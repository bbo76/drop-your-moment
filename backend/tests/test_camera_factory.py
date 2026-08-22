"""Ordre de repli de l'autodétection caméra.

Les drivers réels ne sont pas testables ici : ni libcamera ni OpenCV ne sont installés en
CI, et aucune caméra n'y est branchée. Ce qui l'est — et qui est le vrai risque de
régression — c'est l'arbitrage entre les trois : un `auto` qui retombe sur la mire alors
qu'une webcam est là, ou qui ouvre le périphérique alors que le Pi a déjà répondu.

Les drivers eux-mêmes se valident sur le matériel : jalon 6 pour le Pi, un simple
`python -m dropyourmoment.main` sur un poste de bureau pour la webcam.
"""

from __future__ import annotations

import time

import pytest

from dropyourmoment.hardware.camera import factory
from dropyourmoment.hardware.camera.factory import CameraDriverName, build_camera_driver
from dropyourmoment.hardware.camera.mock_driver import MockCameraDriver


class _FakeDriver:
    def __init__(self, name: str) -> None:
        self.name = name


def test_auto_prefere_picamera2_et_ne_sonde_pas_la_webcam(monkeypatch):
    """Sur le Pi, la webcam ne doit pas être ouverte : le capteur CSI a déjà répondu."""
    probed = []
    monkeypatch.setattr(factory, "_try_picamera2", lambda: _FakeDriver("picamera2"))
    monkeypatch.setattr(factory, "_try_opencv", lambda device: probed.append(device))

    driver = build_camera_driver(CameraDriverName.AUTO)

    assert driver.name == "picamera2"
    assert probed == []


def test_auto_retombe_sur_la_webcam(monkeypatch):
    monkeypatch.setattr(factory, "_try_picamera2", lambda: None)
    monkeypatch.setattr(factory, "_try_opencv", lambda device: _FakeDriver(f"opencv:{device}"))

    driver = build_camera_driver(CameraDriverName.AUTO, device=2)

    assert driver.name == "opencv:2"


def test_auto_retombe_sur_la_mire_sans_materiel(monkeypatch):
    monkeypatch.setattr(factory, "_try_picamera2", lambda: None)
    monkeypatch.setattr(factory, "_try_opencv", lambda device: None)

    assert isinstance(build_camera_driver(CameraDriverName.AUTO), MockCameraDriver)


def test_mock_force_ne_sonde_aucun_materiel(monkeypatch):
    """`DYM_CAMERA_DRIVER=mock` doit rester le moyen sûr de travailler sans matériel."""

    def boom(*args):
        raise AssertionError("aucune sonde matérielle ne doit être tentée")

    monkeypatch.setattr(factory, "_try_picamera2", boom)
    monkeypatch.setattr(factory, "_try_opencv", boom)

    assert isinstance(build_camera_driver(CameraDriverName.MOCK), MockCameraDriver)


def test_device_numerique_est_un_index_pas_un_chemin(monkeypatch):
    """Sans cette conversion, OpenCV chercherait un fichier nommé « 2 » et échouerait."""
    from dropyourmoment.config import Settings

    monkeypatch.setenv("DYM_CAMERA_DEVICE", "2")
    assert Settings().camera_device == 2

    monkeypatch.setenv("DYM_CAMERA_DEVICE", "/dev/video0")
    assert Settings().camera_device == "/dev/video0"


# --- Libération du périphérique à l'inactivité -----------------------------------------


def test_le_driver_webcam_rend_le_peripherique_quand_personne_ne_regarde() -> None:
    """Une webcam est celle d'un poste de travail : LED allumée, et une visioconférence
    qui voudra peut-être la même caméra. La retenir du démarrage à l'arrêt se justifie
    pour un capteur CSI dédié, pas ici.

    L'horloge est injectée, comme celle de la machine à états : sinon le test devrait
    attendre quinze secondes. Le périphérique n'est jamais ouvert — c'est la décision de
    libérer qui est exercée, et elle tient dans quatre cas.
    """
    pytest.importorskip("cv2", reason="driver webcam non installé (extra `webcam`)")
    from dropyourmoment.hardware.camera.opencv_driver import OpencvCameraDriver

    maintenant = 1000.0
    driver = OpencvCameraDriver(idle_release_s=15.0, clock=lambda: maintenant)

    assert driver._should_release_locked() is False, "rien à rendre : jamais ouvert"

    # Périphérique retenu, mais un flux vient d'être servi.
    driver._capture = object()  # type: ignore[assignment]
    driver._last_used = maintenant
    assert driver._should_release_locked() is False, "vient d'être utilisé"

    # Le délai est écoulé, mais un aperçu est vivant : on ne coupe pas sous les pieds
    # d'un visiteur.
    with driver._activity.track():
        assert driver._should_release_locked(now=maintenant + 60.0) is False, "flux actif"

    # Plus aucun flux, délai écoulé.
    assert driver._should_release_locked(now=maintenant + 15.0) is True


def test_la_webcam_reste_annoncee_presente_une_fois_detectee() -> None:
    """`is_available()` répond « utilisable », pas « ouverte ».

    Le lier à l'ouverture désactiverait « Commencer » à l'accueil dès que la LED s'éteint,
    c'est-à-dire tout le temps.
    """
    pytest.importorskip("cv2", reason="driver webcam non installé (extra `webcam`)")
    from dropyourmoment.hardware.camera.opencv_driver import OpencvCameraDriver

    driver = OpencvCameraDriver()

    assert driver.is_available() is False, "avant toute ouverture, rien n'est prouvé"

    driver._detected = True
    assert driver.is_available() is True
    assert driver.holds_device is False, "utilisable sans être retenue"


class _FakeCapture:
    """Un `cv2.VideoCapture` qui répond sans matériel.

    Compte ses ouvertures et ses libérations : c'est le cycle qu'on veut voir, et un vrai
    périphérique ne le dirait pas.
    """

    opened = 0
    released = 0

    def __init__(self, *_args: object) -> None:
        type(self).opened += 1
        self._live = True

    def isOpened(self) -> bool:  # noqa: N802 — nom imposé par l'API OpenCV
        return self._live

    def set(self, *_args: object) -> bool:
        return True

    def get(self, prop: int) -> float:
        import cv2

        return 1280.0 if prop == cv2.CAP_PROP_FRAME_WIDTH else 720.0

    def read(self) -> tuple[bool, object]:
        import numpy

        # Une vraie matrice : `imencode` la refuserait autrement, et c'est bien l'encodage
        # qu'on veut voir réussir après une réouverture.
        return True, numpy.zeros((720, 1280, 3), dtype=numpy.uint8)

    def release(self) -> None:
        self._live = False
        type(self).released += 1


def test_le_veilleur_libere_puis_le_peripherique_se_rouvre(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le cycle complet, thread compris : ouvert au démarrage, rendu à l'inactivité,
    rouvert au premier flux d'aperçu qui le redemande.

    Fenêtre d'inactivité écourtée à un dixième de seconde ; le veilleur bat à la seconde,
    d'où l'attente. C'est le seul test qui exerce le cycle de vie du thread — la décision
    de libérer, elle, se teste sans horloge réelle plus haut.
    """
    cv2 = pytest.importorskip("cv2", reason="driver webcam non installé (extra `webcam`)")
    from dropyourmoment.hardware.camera import opencv_driver

    _FakeCapture.opened = _FakeCapture.released = 0
    monkeypatch.setattr(cv2, "VideoCapture", _FakeCapture)
    monkeypatch.setattr(opencv_driver, "JANITOR_TICK_S", 0.02)

    driver = opencv_driver.OpencvCameraDriver(idle_release_s=0.1)
    try:
        driver.start()
        assert (_FakeCapture.opened, driver.holds_device) == (1, True)

        deadline = time.monotonic() + 3.0
        while driver.holds_device and time.monotonic() < deadline:
            time.sleep(0.02)
        assert not driver.holds_device, "le périphérique aurait dû être rendu"
        assert _FakeCapture.released == 1
        assert driver.is_available(), "rendue n'est pas absente"

        # Un flux d'aperçu le redemande : deuxième ouverture, sans nouveau `start()`.
        frames = driver.preview_frames()
        assert next(frames).startswith(b"\xff\xd8"), "une frame JPEG, pas une erreur"
        assert (_FakeCapture.opened, driver.holds_device) == (2, True)
        frames.close()
    finally:
        driver.stop()

    # Le compte exact des libérations n'est pas assertable : le veilleur peut rendre le
    # périphérique une fois de plus entre la fermeture du flux et l'arrêt. Ce qui compte est
    # qu'il ne reste rien de retenu.
    assert not driver.holds_device, "l'arrêt doit rendre le périphérique"
