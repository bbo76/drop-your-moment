"""Driver Raspberry Pi Camera Module v3 (IMX708) via picamera2.

⚠️  Non validé sur hardware — écrit contre la doc picamera2, à vérifier au jalon 6.

Deux choix structurants :

1. **Une seule configuration capteur, pas de changement de mode.** Le flux `main` sert
   les captures, le flux `lores` alimente le preview. `switch_mode_and_capture_file()`
   aurait donné les 12 Mpx du capteur mais interrompt le preview le temps de
   reconfigurer le capteur — pour rien : une carte postale Selphy (100×148 mm) à 300 dpi
   demande ~1181×1748 px, donc 2304×1296 est déjà au-delà du nécessaire, et le surplus
   partirait à la poubelle au recadrage puis au tirage.

2. **Encodeur MJPEG unique, plusieurs lecteurs.** L'encodeur tourne une fois sur le flux
   `lores` et dépose chaque frame dans un tampon partagé. Les consommateurs HTTP lisent
   ce tampon au lieu de déclencher chacun leur propre encodage : le coût CPU sur le Pi
   ne dépend pas du nombre de connexions.

Ce module importe picamera2 au niveau global. C'est voulu : il n'est chargé que si la
fabrique le sélectionne, ce qui garde le backend démarrable sur une machine sans
libcamera.
"""

from __future__ import annotations

import io
import logging
import threading
from collections.abc import Iterator
from pathlib import Path

from picamera2 import Picamera2
from picamera2.encoders import MJPEGEncoder
from picamera2.outputs import FileOutput

from dropyourmoment.core.errors import CameraCaptureError, CameraNotAvailableError
from dropyourmoment.hardware.camera.base import (
    CameraCapabilities,
    CameraDriver,
    CaptureResult,
)
from dropyourmoment.hardware.camera.preview_activity import PreviewActivity

logger = logging.getLogger(__name__)

STILL_SIZE = (2304, 1296)
PREVIEW_SIZE = (640, 360)
PREVIEW_QUALITY = 75

# Les buffers `main` pèsent ~9 Mo chacun en RGB888. La valeur par défaut de picamera2
# est généreuse ; 4 suffit pour un flux mono-client et économise ~20 Mo sur le Pi.
BUFFER_COUNT = 4

# Au-delà de cette attente sans nouvelle frame, on considère le flux mort plutôt que de
# laisser une requête HTTP pendue indéfiniment.
FRAME_WAIT_TIMEOUT_S = 5.0


class _FrameBuffer(io.BufferedIOBase):
    """Reçoit les frames de l'encodeur et réveille les lecteurs en attente.

    Ne conserve que la dernière frame : un consommateur lent doit sauter des images, pas
    accumuler du retard.
    """

    def __init__(self) -> None:
        self._frame: bytes | None = None
        self._condition = threading.Condition()

    def write(self, buf: bytes) -> int:  # type: ignore[override]
        with self._condition:
            self._frame = bytes(buf)
            self._condition.notify_all()
        return len(buf)

    def wait_for_frame(self, timeout: float) -> bytes | None:
        with self._condition:
            if not self._condition.wait(timeout=timeout):
                return None
            return self._frame


class Picamera2Driver(CameraDriver):
    def __init__(
        self,
        still_size: tuple[int, int] = STILL_SIZE,
        preview_size: tuple[int, int] = PREVIEW_SIZE,
    ) -> None:
        self._still_size = still_size
        self._preview_size = preview_size
        self._camera: Picamera2 | None = None
        self._buffer = _FrameBuffer()
        self._capture_lock = threading.Lock()
        self._activity = PreviewActivity()

    def start(self) -> None:
        if self._camera is not None:
            return
        try:
            camera = Picamera2()
            camera.configure(
                camera.create_video_configuration(
                    main={"size": self._still_size, "format": "RGB888"},
                    lores={"size": self._preview_size, "format": "YUV420"},
                    buffer_count=BUFFER_COUNT,
                    display=None,
                )
            )
            camera.start_recording(
                MJPEGEncoder(q=PREVIEW_QUALITY),
                FileOutput(self._buffer),
                name="lores",
            )
        except Exception as exc:
            raise CameraNotAvailableError(f"ouverture du capteur impossible : {exc}") from exc
        self._camera = camera
        logger.info(
            "caméra Pi démarrée : still=%s preview=%s", self._still_size, self._preview_size
        )

    def stop(self) -> None:
        if self._camera is None:
            return
        try:
            self._camera.stop_recording()
            self._camera.close()
        finally:
            self._camera = None

    def is_available(self) -> bool:
        return self._camera is not None

    def get_capabilities(self) -> CameraCapabilities:
        return CameraCapabilities(
            driver_name="picamera2",
            still_size=self._still_size,
            preview_size=self._preview_size,
            supports_live_preview=True,
        )

    @property
    def active_streams(self) -> int:
        return self._activity.active

    def preview_frames(self) -> Iterator[bytes]:
        if self._camera is None:
            raise CameraNotAvailableError("preview demandé alors que la caméra est arrêtée")
        with self._activity.track() as heartbeat:
            while self._camera is not None:
                frame = self._buffer.wait_for_frame(FRAME_WAIT_TIMEOUT_S)
                if frame is None:
                    logger.warning(
                        "aucune frame depuis %.0f s — arrêt du flux", FRAME_WAIT_TIMEOUT_S
                    )
                    return
                heartbeat()
                yield frame

    def capture_still(self, dest: Path) -> CaptureResult:
        if self._camera is None:
            raise CameraNotAvailableError("capture demandée alors que la caméra est arrêtée")
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Sérialisé : deux captures concurrentes sur le même capteur n'ont aucun sens et
        # picamera2 ne le garantit pas.
        with self._capture_lock:
            try:
                self._camera.capture_file(str(dest), name="main")
            except Exception as exc:
                raise CameraCaptureError(f"capture échouée : {exc}") from exc
        return CaptureResult(path=dest, size=self._still_size)
