from __future__ import annotations

import time
from collections.abc import Iterator

import httpx
from fastapi.testclient import TestClient

from dropyourmoment.api.kiosk_router import MJPEG_BOUNDARY, _mjpeg_frames
from dropyourmoment.core.print_format import POSTCARD_LANDSCAPE
from dropyourmoment.core.session import SessionState
from dropyourmoment.hardware.camera.mock_driver import MockCameraDriver
from dropyourmoment.runtime import Runtime


def test_statut_initial_au_repos(kiosk: TestClient) -> None:
    body = kiosk.get("/api/status").json()

    assert body["state"] == SessionState.IDLE
    assert body["session_id"] is None
    assert body["remaining_seconds"] is None


def test_demarrer_une_session_passe_en_preview(kiosk: TestClient) -> None:
    body = kiosk.post("/api/session").json()

    assert body["state"] == SessionState.PREVIEW
    assert body["session_id"]
    assert body["remaining_seconds"] is not None, "le frontend doit pouvoir afficher l'abandon"


def test_annuler_ramene_au_repos(kiosk: TestClient) -> None:
    kiosk.post("/api/session")

    body = kiosk.post("/api/session/cancel").json()

    assert body["state"] == SessionState.IDLE
    assert body["session_id"] is None


def test_statut_systeme_expose_ce_dont_le_frontend_a_besoin(kiosk: TestClient) -> None:
    body = kiosk.get("/api/system/status").json()

    assert body["camera_ok"] is True
    assert body["camera_driver"] == "mock"
    assert body["preview_size"] == [640, 360]
    # Le cadre de visée du preview se dessine à partir de ce ratio : sans lui, le frontend
    # ne peut pas montrer la zone réellement conservée au recadrage.
    assert body["print_aspect_ratio"] == POSTCARD_LANDSCAPE.aspect_ratio


def test_camera_absente_signalee_sans_faire_tomber_l_api(runtime: Runtime) -> None:
    """L'écran d'accueil doit pouvoir se dégrader proprement, pas planter."""
    from dropyourmoment.apps import build_kiosk_app

    runtime.camera = MockCameraDriver(available=False)
    runtime.camera.start()

    with TestClient(build_kiosk_app(runtime)) as client:
        body = client.get("/api/system/status").json()

    assert body["camera_ok"] is False


def _parse_frames(stream: Iterator[bytes], wanted: int) -> list[bytes]:
    """Extrait les `wanted` premières frames JPEG d'un flux MJPEG."""
    separator = f"--{MJPEG_BOUNDARY}".encode()
    frames: list[bytes] = []
    buffer = b""

    for chunk in stream:
        buffer += chunk
        parts = buffer.split(separator)
        # Le dernier segment est potentiellement tronqué : on ne traite que ceux qui
        # sont suivis d'un séparateur, et on garde le reste pour le tour suivant.
        for part in parts[1:-1]:
            _, _, payload = part.partition(b"\r\n\r\n")
            if payload.endswith(b"\r\n"):
                frames.append(payload[:-2])
        buffer = separator + parts[-1]
        if len(frames) >= wanted:
            break
    return frames[:wanted]


def test_le_flux_preview_sert_du_mjpeg(runtime: Runtime) -> None:
    frames = _parse_frames(_mjpeg_frames(runtime), 1)

    assert len(frames) == 1
    assert frames[0].startswith(b"\xff\xd8"), "en-tête JPEG attendu"
    assert frames[0].endswith(b"\xff\xd9"), "fin de JPEG attendue"


def test_le_flux_preview_est_vivant(runtime: Runtime) -> None:
    """Deux frames consécutives doivent différer.

    C'est le test qui justifie une caméra de synthèse *animée* : un mock statique
    passerait ce flux pour vivant alors qu'un flux gelé — le mode de défaillance réel de
    cette architecture — donnerait exactement les mêmes octets.
    """
    frames = _parse_frames(_mjpeg_frames(runtime), 2)

    assert len(frames) == 2
    assert frames[0] != frames[1]


def test_content_type_mjpeg_annonce_la_frontiere(kiosk_url: str) -> None:
    with httpx.stream("GET", f"{kiosk_url}/api/preview/stream", timeout=5.0) as response:
        assert response.status_code == 200
        assert MJPEG_BOUNDARY in response.headers["content-type"]
        assert "no-store" in response.headers["cache-control"]


def test_un_client_parti_cesse_de_consommer_du_cpu(
    kiosk_url: str, camera: MockCameraDriver
) -> None:
    """C'est la garantie qui compte vraiment sur un Pi : plus d'encodage après la coupure.

    Starlette annule bien la tâche qui pompe le générateur dès la déconnexion. Le
    générateur reste ensuite suspendu jusqu'au ramasse-miettes, mais suspendu il ne
    coûte rien — donc une connexion MJPEG oubliée par Chromium ne brûle pas de CPU.
    """
    with httpx.stream("GET", f"{kiosk_url}/api/preview/stream", timeout=5.0) as response:
        _parse_frames(response.iter_bytes(), 2)
        assert camera.active_streams == 1

    time.sleep(0.5)
    apres_coupure = camera.frames_rendered
    time.sleep(0.5)

    assert camera.frames_rendered == apres_coupure, "des frames sont encore encodées"


def test_un_flux_abandonne_n_est_plus_compte_comme_actif(
    kiosk_url: str, camera: MockCameraDriver
) -> None:
    """Le comptage doit s'auto-corriger, sans attendre une finalisation de générateur."""
    with httpx.stream("GET", f"{kiosk_url}/api/preview/stream", timeout=5.0) as response:
        _parse_frames(response.iter_bytes(), 2)

    deadline = time.monotonic() + 5.0
    while camera.active_streams and time.monotonic() < deadline:
        time.sleep(0.05)

    assert camera.active_streams == 0
