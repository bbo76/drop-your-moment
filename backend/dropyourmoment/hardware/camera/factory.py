"""Sélection du driver caméra.

L'autodétection permet au même dépôt de tourner sur le Mac (mock) et sur le Pi
(picamera2) sans configuration, tout en laissant `PHOTOBOOTH_CAMERA_DRIVER` forcer un
choix — utile pour tester le chemin d'erreur « caméra absente » sur le Pi lui-même.

L'import de picamera2 est fait ici, tardivement : le backend doit démarrer sur une
machine sans libcamera.
"""

from __future__ import annotations

import logging
from enum import StrEnum

from dropyourmoment.hardware.camera.base import CameraDriver
from dropyourmoment.hardware.camera.mock_driver import MockCameraDriver

logger = logging.getLogger(__name__)


class CameraDriverName(StrEnum):
    AUTO = "auto"
    MOCK = "mock"
    PICAMERA2 = "picamera2"
    UNAVAILABLE = "unavailable"


def build_camera_driver(name: CameraDriverName) -> CameraDriver:
    if name is CameraDriverName.MOCK:
        return MockCameraDriver()
    if name is CameraDriverName.UNAVAILABLE:
        # Simule un capteur absent, pour valider l'écran d'accueil dégradé.
        return MockCameraDriver(available=False)
    if name is CameraDriverName.PICAMERA2:
        return _build_picamera2()

    driver = _try_picamera2()
    if driver is not None:
        return driver
    logger.info("picamera2 indisponible — bascule sur la caméra de synthèse")
    return MockCameraDriver()


def _build_picamera2() -> CameraDriver:
    from dropyourmoment.hardware.camera.picamera2_driver import Picamera2Driver

    return Picamera2Driver()


def _try_picamera2() -> CameraDriver | None:
    try:
        return _build_picamera2()
    except ImportError:
        return None
