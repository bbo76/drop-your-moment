"""Driver Raspberry Pi Camera Module v3 (IMX708) via picamera2.

Validé sur Raspberry Pi 4 avec un Camera Module 3 (IMX708) et la dalle Waveshare 7 pouces.

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

from libcamera import controls
from picamera2 import Picamera2
from picamera2.encoders import MJPEGEncoder, Quality
from picamera2.outputs import FileOutput

from dropyourmoment.core.errors import CameraCaptureError, CameraNotAvailableError
from dropyourmoment.hardware.camera.base import (
    AutofocusSettings,
    CameraCapabilities,
    CameraDiagnostics,
    CameraDriver,
    CaptureResult,
)
from dropyourmoment.hardware.camera.preview_activity import PreviewActivity

logger = logging.getLogger(__name__)

STILL_SIZE = (2304, 1296)
PREVIEW_SIZE = (640, 360)
# Ce couple taille/qualité atteint 29,9 images/s sur le Pi tout en restant net sur la dalle.
# Monter la résolution ajouterait du coût sans rendre davantage de détails sur 1024×600.
PREVIEW_QUALITY = Quality.HIGH
# Les buffers `main` pèsent ~9 Mo chacun en RGB888. La valeur par défaut de picamera2
# est généreuse ; 4 suffit pour un flux mono-client et économise ~20 Mo sur le Pi.
BUFFER_COUNT = 4
SENSOR_SIZE = (4608, 2592)

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
        self._diagnostics_lock = threading.Lock()
        self._diagnostics = CameraDiagnostics(driver_name="picamera2")
        self._activity = PreviewActivity()
        self._autofocus_settings = AutofocusSettings()

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
            camera.pre_callback = self._record_metadata
            camera.start_recording(
                MJPEGEncoder(),
                FileOutput(self._buffer),
                quality=PREVIEW_QUALITY,
                name="lores",
            )
            # Le Camera Module 3 (IMX708) reste en autofocus continu pendant l'aperçu
            # et la capture : la distance visiteur varie, et la borne n'a pas de plan
            # focal fixe fiable à imposer.
            camera.set_controls(self._controls_for_autofocus(self._autofocus_settings))
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

    def get_diagnostics(self) -> CameraDiagnostics:
        with self._diagnostics_lock:
            return self._diagnostics

    def get_autofocus_settings(self) -> AutofocusSettings:
        return self._autofocus_settings

    def set_autofocus_settings(self, settings: AutofocusSettings) -> AutofocusSettings:
        if self._camera is None:
            raise CameraNotAvailableError(
                "réglage autofocus demandé alors que la caméra est arrêtée"
            )
        self._camera.set_controls(self._controls_for_autofocus(settings))
        self._autofocus_settings = settings
        return settings

    def trigger_autofocus(self) -> bool:
        if self._camera is None:
            raise CameraNotAvailableError("autofocus demandé alors que la caméra est arrêtée")
        with self._capture_lock:
            try:
                self._camera.set_controls({"AfMode": controls.AfModeEnum.Auto})
                return bool(self._camera.autofocus_cycle())
            finally:
                self._camera.set_controls(self._controls_for_autofocus(self._autofocus_settings))

    @staticmethod
    def _controls_for_autofocus(settings: AutofocusSettings) -> dict[str, object]:
        x, y, width, height = settings.window
        window = (
            round(x * SENSOR_SIZE[0]),
            round(y * SENSOR_SIZE[1]),
            round(width * SENSOR_SIZE[0]),
            round(height * SENSOR_SIZE[1]),
        )
        return {
            "AfMode": {
                "continuous": controls.AfModeEnum.Continuous,
                "auto": controls.AfModeEnum.Auto,
            }[settings.mode],
            "AfRange": {
                "normal": controls.AfRangeEnum.Normal,
                "macro": controls.AfRangeEnum.Macro,
                "full": controls.AfRangeEnum.Full,
            }[settings.range],
            "AfSpeed": {
                "normal": controls.AfSpeedEnum.Normal,
                "fast": controls.AfSpeedEnum.Fast,
            }[settings.speed],
            "AfMetering": controls.AfMeteringEnum.Windows,
            "AfWindows": [window],
        }

    def _record_metadata(self, request: object) -> None:
        metadata = request.get_metadata()  # type: ignore[attr-defined]
        af_state = metadata.get("AfState")
        af_state_name = {0: "idle", 1: "scanning", 2: "focused", 3: "failed"}.get(
            af_state, f"unknown ({af_state})" if af_state is not None else None
        )

        def number(key: str) -> float | None:
            value = metadata.get(key)
            return float(value) if isinstance(value, (int, float)) else None

        with self._diagnostics_lock:
            self._diagnostics = CameraDiagnostics(
                driver_name="picamera2",
                autofocus_state=af_state_name,
                lens_position=number("LensPosition"),
                focus_fom=number("FocusFoM"),
                exposure_time_us=(
                    int(value) if (value := number("ExposureTime")) is not None else None
                ),
                analogue_gain=number("AnalogueGain"),
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
