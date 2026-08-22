"""Sélection du driver caméra.

L'autodétection permet au même dépôt de tourner sur le Pi (picamera2), sur un poste de
bureau muni d'une webcam (opencv) et en CI (mire de synthèse) sans configuration, tout en
laissant `DYM_CAMERA_DRIVER` forcer un choix.

Les imports de picamera2 et de cv2 sont faits ici, tardivement : le backend doit démarrer
sur une machine qui n'a ni libcamera ni OpenCV.
"""

from __future__ import annotations

import logging
from enum import StrEnum

from dropyourmoment.core.errors import CameraNotAvailableError
from dropyourmoment.hardware.camera.base import CameraDriver
from dropyourmoment.hardware.camera.mock_driver import MockCameraDriver

logger = logging.getLogger(__name__)


class CameraDriverName(StrEnum):
    AUTO = "auto"
    MOCK = "mock"
    PICAMERA2 = "picamera2"
    OPENCV = "opencv"


def build_camera_driver(name: CameraDriverName, device: int | str = 0) -> CameraDriver:
    """`device` ne concerne que le driver webcam : le Pi et la mire n'ont rien à choisir."""
    if name is CameraDriverName.MOCK:
        return MockCameraDriver()
    if name is CameraDriverName.PICAMERA2:
        return _build_picamera2()
    if name is CameraDriverName.OPENCV:
        return _build_opencv(device)

    driver = _try_picamera2()
    if driver is not None:
        return driver
    driver = _try_opencv(device)
    if driver is not None:
        return driver
    logger.info("aucune caméra détectée — bascule sur la caméra de synthèse")
    return MockCameraDriver()


def _build_picamera2() -> CameraDriver:
    from dropyourmoment.hardware.camera.picamera2_driver import Picamera2Driver

    return Picamera2Driver()


def _build_opencv(device: int | str) -> CameraDriver:
    from dropyourmoment.hardware.camera.opencv_driver import OpencvCameraDriver

    return OpencvCameraDriver(device=device)


def _try_picamera2() -> CameraDriver | None:
    try:
        return _build_picamera2()
    except ImportError:
        return None


def _try_opencv(device: int | str) -> CameraDriver | None:
    """Sonde la webcam en l'ouvrant réellement, contrairement au test de picamera2.

    L'import réussi ne prouve rien ici : `opencv-python` peut très bien être installé sans
    qu'aucune webcam soit branchée. Seule l'ouverture du périphérique répond à la question.

    Le driver est laissé **ouvert** en cas de succès. `start()` étant idempotent, l'appel
    ultérieur de `Runtime.start()` ne fait rien — ce qui évite une seconde ouverture, et
    sur macOS un second dialogue d'autorisation caméra.
    """
    try:
        driver = _build_opencv(device)
    except ImportError:
        return None
    try:
        driver.start()
    except CameraNotAvailableError as exc:
        logger.info("webcam indisponible : %s", exc)
        return None
    return driver
