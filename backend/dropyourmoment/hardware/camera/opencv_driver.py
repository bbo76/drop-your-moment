"""Driver webcam universel via OpenCV : macOS, Windows, n'importe quelle caméra USB.

`cv2.VideoCapture` sélectionne seul le backend de la plateforme — AVFoundation sur macOS,
MSMF ou DirectShow sur Windows, V4L2 sur Linux. Un seul driver couvre donc les trois, sans
la moindre branche par système.

Deux différences assumées avec le driver Pi :

1. **Un seul flux, donc `still_size == preview_size`.** Une webcam UVC n'expose pas de
   second flux basse résolution : la capture et le preview sortent de la même négociation
   de mode. La conséquence est une capture à 1280×720, soit 1066×720 après recadrage au
   ratio de tirage — en dessous des 1748×1181 d'une carte postale à 300 dpi. Sans
   importance : ce driver sert le développement et la démonstration sur poste de bureau,
   le tirage viendra du Pi. Monter la résolution coûterait la fluidité du preview, qui est
   précisément ce qu'on vient regarder ici.

2. **Aucun thread de fond.** Le driver Pi maintient un tampon partagé parce que son
   encodeur MJPEG tourne de toute façon, en continu, dès `start_recording()`. Ici rien ne
   tourne si personne ne lit : les frames sont tirées à la demande dans le générateur de
   preview. Un thread lecteur n'économiserait rien et ajouterait un cycle de vie à gérer.

Ce module importe cv2 au niveau global, comme le driver Pi importe picamera2 : il n'est
chargé que si la fabrique le sélectionne, ce qui garde le backend démarrable sans OpenCV
installé.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from pathlib import Path

import cv2

from dropyourmoment.core.errors import CameraCaptureError, CameraNotAvailableError
from dropyourmoment.hardware.camera.base import (
    CameraCapabilities,
    CameraDriver,
    CaptureResult,
)
from dropyourmoment.hardware.camera.preview_activity import PreviewActivity

logger = logging.getLogger(__name__)

# Demandé, pas garanti : la webcam retiendra le mode supporté le plus proche. 720p est le
# mode que toute webcam sait tenir à cadence pleine, et le ratio 16:9 est celui du capteur
# Pi — le cadre de visée se comporte donc pareil des deux côtés.
REQUESTED_SIZE = (1280, 720)

PREVIEW_QUALITY = 75
STILL_QUALITY = 92


class OpencvCameraDriver(CameraDriver):
    def __init__(
        self,
        device: int | str = 0,
        requested_size: tuple[int, int] = REQUESTED_SIZE,
    ) -> None:
        self._device = device
        self._requested_size = requested_size
        self._capture: cv2.VideoCapture | None = None
        self._size = requested_size
        # ponytail: un seul verrou pour le preview et la capture. Deux plafonds connus —
        # chaque flux de preview supplémentaire paie son propre encodage JPEG, et une frame
        # peut être périmée si plus personne ne draine la file du pilote. Ni l'un ni l'autre
        # ne se produit dans le parcours réel : un seul kiosque lit, et la capture arrive à
        # la fin du décompte, preview vivant. Si ça change : thread lecteur + tampon partagé,
        # comme picamera2_driver.py.
        self._lock = threading.Lock()
        self._activity = PreviewActivity()

    def start(self) -> None:
        if self._capture is not None:
            return

        capture = cv2.VideoCapture(self._device)
        if not capture.isOpened():
            capture.release()
            raise CameraNotAvailableError(
                f"webcam {self._device!r} introuvable ou déjà utilisée "
                "(sur macOS, vérifier l'autorisation caméra du terminal)"
            )

        width, height = self._requested_size
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        # Relecture obligatoire : le mode demandé n'est qu'un vœu, le pilote retient le
        # mode supporté le plus proche sans le signaler. Annoncer la taille demandée
        # plutôt que la taille réelle ferait mentir le cadre de visée du frontend, qui se
        # dimensionne sur `preview_size`.
        self._size = (
            int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
        self._capture = capture

        if self._size != self._requested_size:
            logger.info(
                "webcam %r : %s demandé, %s négocié", self._device, self._requested_size, self._size
            )
        logger.info("webcam %r démarrée : %s", self._device, self._size)

    def stop(self) -> None:
        if self._capture is None:
            return
        try:
            self._capture.release()
        finally:
            self._capture = None

    def is_available(self) -> bool:
        return self._capture is not None

    def get_capabilities(self) -> CameraCapabilities:
        return CameraCapabilities(
            driver_name="opencv",
            still_size=self._size,
            preview_size=self._size,
            supports_live_preview=True,
        )

    @property
    def active_streams(self) -> int:
        return self._activity.active

    def preview_frames(self) -> Iterator[bytes]:
        if self._capture is None:
            raise CameraNotAvailableError("preview demandé alors que la webcam est arrêtée")
        with self._activity.track() as heartbeat:
            if self._activity.active > 1:
                logger.warning("%d flux de preview actifs simultanément", self._activity.active)
            # Pas de temporisation : `read()` bloque jusqu'à la frame suivante, c'est le
            # capteur qui cadence le flux.
            while self._capture is not None:
                frame = self._read_frame()
                if frame is None:
                    # Webcam débranchée en cours de route : terminer le générateur plutôt
                    # que laisser la requête HTTP pendue.
                    logger.warning("lecture de frame échouée — arrêt du flux de preview")
                    return
                heartbeat()
                yield _encode_jpeg(frame, PREVIEW_QUALITY)

    def capture_still(self, dest: Path) -> CaptureResult:
        if self._capture is None:
            raise CameraNotAvailableError("capture demandée alors que la webcam est arrêtée")
        frame = self._read_frame()
        if frame is None:
            raise CameraCaptureError(f"lecture de frame échouée sur la webcam {self._device!r}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_encode_jpeg(frame, STILL_QUALITY))
        return CaptureResult(path=dest, size=self._size)

    def _read_frame(self):
        """Une frame BGR, ou None si la webcam ne répond plus."""
        with self._lock:
            capture = self._capture
            if capture is None:
                return None
            ok, frame = capture.read()
        return frame if ok else None


def _encode_jpeg(frame, quality: int) -> bytes:
    # cv2 travaille en BGR et `imencode` l'attend dans cet ordre : aucune conversion.
    ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise CameraCaptureError("encodage JPEG échoué")
    return buffer.tobytes()
