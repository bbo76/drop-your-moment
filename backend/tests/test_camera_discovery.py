"""Découverte des caméras : ce qui peut se tromper, et ce qui coûte cher.

Deux natures de code ici, testées différemment. Les analyseurs de sortie de commande sont
purs et se vérifient sur des sorties réelles capturées. Le sondage, lui, ouvre des
périphériques : les tests ne le déclenchent jamais pour de bon — ils vérifient qu'il
s'abstient quand il doit s'abstenir, et le remplacent pour exercer la route.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from dropyourmoment.api import admin_router
from dropyourmoment.hardware.camera.base import CameraCapabilities
from dropyourmoment.hardware.camera.discovery import (
    ProbedCamera,
    parse_system_profiler,
    parse_v4l2,
    probe_indices,
)
from dropyourmoment.runtime import Runtime

# Sortie réelle de `system_profiler -json SPCameraDataType` sur un MacBook avec une
# caméra de continuité — les guillemets français et l'espace insécable compris.
SYSTEM_PROFILER_OUTPUT = """{
  "SPCameraDataType" : [
    {
      "_name" : "Caméra MacBook Pro",
      "spcamera_model-id" : "Caméra MacBook Pro"
    },
    {
      "_name" : "Caméra de « iPhone de Baptiste »",
      "spcamera_model-id" : "iPhone18,3"
    }
  ]
}"""

# Sortie réelle de `v4l2-ctl --list-devices` : un nom en début de ligne suivi de « : », les
# chemins indentés en dessous.
V4L2_OUTPUT = """Logitech C920 (usb-0000:00:14.0-1):
\t/dev/video0
\t/dev/video1

bcm2835-isp (platform:bcm2835-isp):
\t/dev/video13
\t/dev/video14
"""


def test_noms_macos() -> None:
    assert parse_system_profiler(SYSTEM_PROFILER_OUTPUT) == [
        "Caméra MacBook Pro",
        "Caméra de « iPhone de Baptiste »",
    ]


def test_noms_linux_sans_la_parenthese_de_bus() -> None:
    """« (usb-0000:00:14.0-1) » n'aide pas à reconnaître une caméra du regard."""
    assert parse_v4l2(V4L2_OUTPUT) == ["Logitech C920", "bcm2835-isp"]


@pytest.mark.parametrize("output", ["", "commande introuvable", "{}", "[]", "{pas du JSON"])
def test_une_sortie_inattendue_ne_leve_pas(output: str) -> None:
    """L'absence de noms n'est pas une panne : les index restent la réponse utile."""
    assert parse_system_profiler(output) == []
    assert parse_v4l2(output) == []


def test_aucun_index_a_sonder() -> None:
    assert probe_indices(indices=[]) == []


def test_l_index_du_kiosque_n_est_jamais_sonde() -> None:
    """Le sonder le volerait au kiosque : un capteur n'accepte qu'un propriétaire.

    Aucun périphérique n'est ouvert par ce test — c'est précisément ce qu'il vérifie.
    """
    assert probe_indices(skip=0, indices=[0]) == []


def test_pas_d_index_epargne_hors_driver_webcam(runtime: Runtime) -> None:
    """La mire de synthèse et le capteur CSI ne réservent aucun index."""
    assert admin_router._kiosk_index(runtime) is None


def test_l_index_configure_est_epargne_avec_le_driver_webcam() -> None:
    """Seul le driver webcam réserve un index, et c'est celui des réglages."""
    fake = SimpleNamespace(
        camera=SimpleNamespace(
            get_capabilities=lambda: CameraCapabilities(
                driver_name="opencv",
                still_size=(1280, 720),
                preview_size=(1280, 720),
                supports_live_preview=True,
            )
        ),
        settings=SimpleNamespace(camera_device=2),
    )

    assert admin_router._kiosk_index(fake) == 2  # type: ignore[arg-type]


def test_un_chemin_de_peripherique_n_epargne_aucun_index() -> None:
    """`DYM_CAMERA_DEVICE=/dev/video0` ne désigne pas un index à retirer du sondage."""
    fake = SimpleNamespace(
        camera=SimpleNamespace(
            get_capabilities=lambda: CameraCapabilities(
                driver_name="opencv",
                still_size=(1280, 720),
                preview_size=(1280, 720),
                supports_live_preview=True,
            )
        ),
        settings=SimpleNamespace(camera_device="/dev/video0"),
    )

    assert admin_router._kiosk_index(fake) is None  # type: ignore[arg-type]


def test_la_route_de_sondage(admin: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Le sondage est remplacé : un test ne doit pas ouvrir la webcam de la machine."""
    monkeypatch.setattr(
        admin_router,
        "probe_indices",
        lambda **_: [ProbedCamera(index=0, size=(1280, 720))],
    )
    monkeypatch.setattr(admin_router, "system_camera_names", lambda: ["Caméra MacBook Pro"])

    body = admin.post("/admin/cameras/scan").json()

    assert body["probed"] == [{"index": 0, "size": [1280, 720]}]
    assert body["system_names"] == ["Caméra MacBook Pro"]
    assert body["skipped_index"] is None


def test_aucun_get_ne_declenche_de_sondage(
    admin: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Le sondage ne doit être atteignable que par une action explicite.

    Un `GET` finirait par être appelé par un préchargement de navigateur ou un
    rafraîchissement automatique, et volerait le capteur au kiosque en pleine soirée.

    L'assertion porte sur « aucun périphérique ouvert » et non sur un code HTTP : selon que
    le frontend est construit ou non, l'URL en `GET` rend 405 (aucune route) ou 404 (le
    montage statique de la racine l'attrape). Les deux conviennent, et vérifier le code
    aurait fait passer ce test pour la mauvaise raison.

    La page de santé est incluse : c'est celle qu'on laisse ouverte pendant un événement.
    """

    def interdit(**_: Any) -> list[ProbedCamera]:
        raise AssertionError("aucun GET ne doit ouvrir de périphérique")

    monkeypatch.setattr(admin_router, "probe_indices", interdit)

    assert admin.get("/admin/cameras/scan").status_code in (404, 405)
    assert admin.get("/admin/system/health").status_code == 200
    assert admin.get("/admin/event-config").status_code == 200
