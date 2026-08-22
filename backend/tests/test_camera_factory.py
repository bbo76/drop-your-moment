"""Ordre de repli de l'autodétection caméra.

Les drivers réels ne sont pas testables ici : ni libcamera ni OpenCV ne sont installés en
CI, et aucune caméra n'y est branchée. Ce qui l'est — et qui est le vrai risque de
régression — c'est l'arbitrage entre les trois : un `auto` qui retombe sur la mire alors
qu'une webcam est là, ou qui ouvre le périphérique alors que le Pi a déjà répondu.

Les drivers eux-mêmes se valident sur le matériel : jalon 6 pour le Pi, un simple
`python -m dropyourmoment.main` sur un poste de bureau pour la webcam.
"""

from __future__ import annotations

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
