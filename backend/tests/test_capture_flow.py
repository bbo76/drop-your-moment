"""Tests du parcours capture → review → filtre → refaire, via l'API.

Ces tests exercent la chaîne complète avec la caméra de synthèse : machine à états,
écriture sur disque, composition et service de l'image.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from dropyourmoment.core.event_config import EventConfig
from dropyourmoment.core.session import SessionState
from dropyourmoment.imaging.filters import FilterName
from dropyourmoment.runtime import Runtime


def assert_color_close(
    actual: tuple[int, ...], expected: tuple[int, int, int], tolerance: int = 6
) -> None:
    """Comparaison tolérante : la sortie passe par une compression JPEG.

    Un JPEG à qualité 92 décale de quelques niveaux les aplats saturés, surtout près
    d'une frontière franche. Comparer au bit près rendrait le test fragile sans rien
    prouver de plus.
    """
    assert len(actual) >= 3
    for channel, (got, want) in enumerate(zip(actual[:3], expected, strict=True)):
        assert abs(got - want) <= tolerance, (
            f"canal {channel} : {got} attendu proche de {want} (obtenu {actual})"
        )


def start_and_capture(kiosk: TestClient) -> dict:
    session_id = kiosk.post("/api/session").json()["session_id"]
    return kiosk.post(f"/api/session/{session_id}/capture").json()


def test_capture_passe_en_review(kiosk: TestClient) -> None:
    body = start_and_capture(kiosk)

    assert body["state"] == SessionState.REVIEW
    assert body["photo_url"], "l'écran de review a besoin d'une image tout de suite"


def test_capture_ecrit_la_prise_brute_et_l_image_finale(
    kiosk: TestClient, runtime: Runtime
) -> None:
    session_id = kiosk.post("/api/session").json()["session_id"]

    kiosk.post(f"/api/session/{session_id}/capture")

    session = runtime.machine.session
    assert session is not None
    assert session.raw_path is not None and session.raw_path.is_file()
    assert session.final_path is not None and session.final_path.is_file()
    assert session.raw_path.is_relative_to(runtime.settings.sessions_dir)
    assert session.final_path.parent.name == session.photo_date
    assert session.final_path.parent.parent.name == "photobooth"
    assert session.final_path.stem == session.photo_name
    assert session.id not in str(session.final_path)


def test_l_image_finale_est_recadree_au_format_de_sortie(
    kiosk: TestClient, runtime: Runtime
) -> None:
    session_id = kiosk.post("/api/session").json()["session_id"]

    kiosk.post(f"/api/session/{session_id}/capture")

    assert runtime.machine.session is not None
    with Image.open(runtime.machine.session.final_path) as final:
        ratio = final.size[0] / final.size[1]
    assert ratio == pytest.approx(runtime.event.aspect_ratio, abs=1e-3)


def test_la_photo_est_servie(kiosk: TestClient) -> None:
    body = start_and_capture(kiosk)

    response = kiosk.get(body["photo_url"])

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["cache-control"] == "no-store"


def test_capture_refusee_hors_apercu(kiosk: TestClient) -> None:
    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")

    second = kiosk.post(f"/api/session/{session_id}/capture")

    assert second.status_code == 409


def test_capture_sur_une_session_perimee(kiosk: TestClient) -> None:
    """Cas réel : le visiteur s'éloigne, le timeout ramène au repos, l'onglet insiste."""
    kiosk.post("/api/session")
    kiosk.post("/api/session/cancel")

    response = kiosk.post("/api/session/jamais-existe/capture")

    assert response.status_code == 409


def test_choix_de_filtre_change_l_image(kiosk: TestClient, runtime: Runtime) -> None:
    body = start_and_capture(kiosk)
    session_id = body["session_id"]
    session = runtime.machine.session
    assert session is not None and session.final_path is not None
    before_path = session.final_path
    before = before_path.read_bytes()

    after_body = kiosk.post(
        f"/api/session/{session_id}/filter", json={"name": FilterName.BW_STUDIO}
    ).json()

    assert after_body["selected_filter"] == FilterName.BW_STUDIO
    assert after_body["state"] == SessionState.REVIEW
    session = runtime.machine.session
    assert session is not None and session.final_path is not None
    after = session.final_path.read_bytes()
    assert before_path == session.final_path
    assert before != after


def test_l_url_de_la_photo_change_a_chaque_composition(kiosk: TestClient) -> None:
    """Sans révision dans l'URL, le navigateur réafficherait l'image précédente."""
    body = start_and_capture(kiosk)
    session_id = body["session_id"]

    after = kiosk.post(f"/api/session/{session_id}/filter", json={"name": FilterName.SEPIA}).json()

    assert after["photo_url"] != body["photo_url"]


def test_aller_retour_entre_filtres(kiosk: TestClient, runtime: Runtime) -> None:
    body = start_and_capture(kiosk)
    session_id = body["session_id"]
    assert runtime.machine.session is not None
    path = runtime.machine.session.final_path
    assert path is not None

    kiosk.post(f"/api/session/{session_id}/filter", json={"name": FilterName.SEPIA})
    sepia_first = path.read_bytes()
    kiosk.post(f"/api/session/{session_id}/filter", json={"name": FilterName.BW_STUDIO})
    kiosk.post(f"/api/session/{session_id}/filter", json={"name": FilterName.SEPIA})

    assert path.read_bytes() == sepia_first, "recomposer depuis le brut doit être stable"


def test_filtre_non_propose_refuse(kiosk: TestClient, runtime: Runtime) -> None:
    """Un événement peut n'offrir que certains filtres ; l'API doit tenir la liste."""
    runtime.event.config = EventConfig(
        available_filters=[FilterName.ORIGINAL, FilterName.BW_STUDIO]
    )
    body = start_and_capture(kiosk)

    response = kiosk.post(
        f"/api/session/{body['session_id']}/filter", json={"name": FilterName.SEPIA}
    )

    assert response.status_code == 422


def test_filtre_inconnu_rejete(kiosk: TestClient) -> None:
    body = start_and_capture(kiosk)

    response = kiosk.post(f"/api/session/{body['session_id']}/filter", json={"name": "aquarelle"})

    assert response.status_code == 422


def test_refaire_revient_en_apercu(kiosk: TestClient) -> None:
    body = start_and_capture(kiosk)

    after = kiosk.post(f"/api/session/{body['session_id']}/retake").json()

    assert after["state"] == SessionState.PREVIEW
    assert after["session_id"] == body["session_id"], "même session"
    assert after["photo_url"] is None


def test_refaire_efface_les_fichiers(kiosk: TestClient, runtime: Runtime) -> None:
    """Une photo dont le visiteur ne voulait pas n'a rien à faire dans la galerie."""
    body = start_and_capture(kiosk)
    session_id = body["session_id"]
    root = runtime.settings.sessions_dir

    kiosk.post(f"/api/session/{session_id}/retake")

    assert runtime.machine.session is not None
    assert runtime.machine.session.raw_path is None
    assert runtime.machine.session.final_path is None
    assert not any(runtime.photo_storage.sessions_root.rglob("*.jpg"))
    assert not any(root.rglob("raw.jpg"))


def test_recapture_apres_refaire(kiosk: TestClient) -> None:
    body = start_and_capture(kiosk)
    session_id = body["session_id"]
    kiosk.post(f"/api/session/{session_id}/retake")

    again = kiosk.post(f"/api/session/{session_id}/capture").json()

    assert again["state"] == SessionState.REVIEW
    assert again["photo_url"]


def test_echec_de_capture_bascule_en_erreur(kiosk: TestClient, runtime: Runtime) -> None:
    """Le visiteur voit un écran d'erreur, pas une exception."""
    from dropyourmoment.core.errors import CameraCaptureError

    session_id = kiosk.post("/api/session").json()["session_id"]

    def boom(_dest: object) -> None:
        raise CameraCaptureError("capteur déconnecté")

    runtime.camera.capture_still = boom  # type: ignore[method-assign]

    body = kiosk.post(f"/api/session/{session_id}/capture").json()

    assert body["state"] == SessionState.ERROR
    assert body["error"] == "capteur déconnecté"


def test_l_overlay_configure_est_applique(kiosk: TestClient, runtime: Runtime) -> None:
    """Bout en bout : overlay chargé depuis la config, composé sur la photo capturée."""
    overlay = Image.new("RGBA", (1480, 1000), (0, 0, 0, 0))
    overlay.paste((255, 0, 255, 255), (0, 0, 1480, 200))
    runtime.settings.event_dir.mkdir(parents=True, exist_ok=True)
    overlay.save(runtime.settings.event_dir / "cadre.png")
    runtime.event_store.save_config(EventConfig(overlay_file="cadre.png"))
    runtime.reload_event()

    start_and_capture(kiosk)

    assert runtime.machine.session is not None
    assert runtime.machine.session.final_path is not None
    with Image.open(runtime.machine.session.final_path) as final:
        width, height = final.size
        assert_color_close(final.getpixel((width // 2, height // 20)), (255, 0, 255))
