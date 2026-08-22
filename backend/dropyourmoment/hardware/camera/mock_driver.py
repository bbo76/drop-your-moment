"""Caméra de synthèse : driver de développement sur Mac et de CI.

Le flux est **animé** — mire mouvante, horodatage, compteur de frames. C'est délibéré :
un JPEG statique ne permet pas de distinguer un flux MJPEG vivant d'un flux gelé, et
c'est précisément le mode de défaillance de cette architecture (connexion MJPEG laissée
ouverte par Chromium, frame figée au retour sur l'écran preview). Un mock statique
masquerait le bug qu'on cherche à voir.
"""

from __future__ import annotations

import io
import itertools
import logging
import time
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from dropyourmoment.hardware.camera.base import (
    CameraCapabilities,
    CameraDriver,
    CaptureResult,
)
from dropyourmoment.hardware.camera.preview_activity import PreviewActivity

logger = logging.getLogger(__name__)

# Mêmes dimensions que le driver Pi, pour que le cadre de visée et le recadrage se
# comportent identiquement en développement et sur le hardware cible.
STILL_SIZE = (2304, 1296)
PREVIEW_SIZE = (640, 360)
PREVIEW_FPS = 15


class MockCameraDriver(CameraDriver):
    def __init__(
        self,
        still_size: tuple[int, int] = STILL_SIZE,
        preview_size: tuple[int, int] = PREVIEW_SIZE,
        fps: int = PREVIEW_FPS,
        available: bool = True,
    ) -> None:
        self._still_size = still_size
        self._preview_size = preview_size
        self._frame_interval = 1.0 / fps
        self._available = available
        self._running = False
        self._counter = itertools.count()
        self._last_frame_number = -1
        self._activity = PreviewActivity()

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False

    def is_available(self) -> bool:
        return self._available and self._running

    @property
    def active_streams(self) -> int:
        """Nombre de flux de preview qui consomment encore des frames."""
        return self._activity.active

    def get_capabilities(self) -> CameraCapabilities:
        return CameraCapabilities(
            driver_name="mock",
            still_size=self._still_size,
            preview_size=self._preview_size,
            supports_live_preview=True,
        )

    def preview_frames(self) -> Iterator[bytes]:
        with self._activity.track() as heartbeat:
            if self._activity.active > 1:
                # Symptôme d'un frontend qui ouvre un second flux sans fermer le premier.
                # Sur le Pi, chaque consommateur réellement actif en trop coûte un
                # encodage JPEG supplémentaire.
                logger.warning("%d flux de preview actifs simultanément", self._activity.active)
            while self._running:
                started = time.monotonic()
                heartbeat()
                yield self._render_jpeg(self._preview_size, quality=75)
                remaining = self._frame_interval - (time.monotonic() - started)
                if remaining > 0:
                    time.sleep(remaining)

    def capture_still(self, dest: Path) -> CaptureResult:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(self._render_jpeg(self._still_size, quality=92))
        return CaptureResult(path=dest, size=self._still_size)

    @property
    def frames_rendered(self) -> int:
        """Compteur d'encodages. Sert à vérifier qu'un flux abandonné ne coûte plus rien."""
        return self._last_frame_number + 1

    def _render_jpeg(self, size: tuple[int, int], quality: int) -> bytes:
        frame = next(self._counter)
        self._last_frame_number = frame
        image = self._render_scene(size, frame)
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality)
        return buffer.getvalue()

    def _render_scene(self, size: tuple[int, int], frame: int) -> Image.Image:
        width, height = size
        image = Image.new("RGB", size, (24, 26, 32))
        draw = ImageDraw.Draw(image)

        # Mires de couleur fixes : repères pour juger un filtre N&B ou sépia d'un coup d'œil.
        bars = [
            (220, 60, 70),
            (240, 170, 60),
            (250, 235, 120),
            (110, 200, 120),
            (80, 170, 230),
            (150, 110, 210),
        ]
        bar_width = width / len(bars)
        for index, color in enumerate(bars):
            draw.rectangle(
                [index * bar_width, 0, (index + 1) * bar_width, height * 0.22],
                fill=color,
            )

        # Élément mobile : la seule preuve visuelle qu'un flux MJPEG est bien vivant.
        cycle = (frame % 90) / 90
        radius = height * 0.09
        center_x = radius + cycle * (width - 2 * radius)
        center_y = height * 0.58
        draw.ellipse(
            [center_x - radius, center_y - radius, center_x + radius, center_y + radius],
            fill=(255, 255, 255),
            outline=(20, 20, 20),
            width=max(2, height // 180),
        )

        # Repères de bord, pour vérifier qu'aucun recadrage involontaire ne mange l'image.
        inset = max(4, height // 90)
        draw.rectangle(
            [inset, inset, width - inset, height - inset],
            outline=(90, 95, 110),
            width=inset // 2 or 1,
        )

        # Police dimensionnée à l'image : la même légende doit rester lisible sur un
        # preview 640×360 comme sur une capture 2304×1296.
        font = ImageFont.load_default(size=max(11, height // 22))
        label = f"MOCK  frame {frame:06d}  {datetime.now():%H:%M:%S.%f}"[:-4]
        draw.text((inset * 3, height * 0.27), label, font=font, fill=(235, 235, 240))
        draw.text(
            (inset * 3, height * 0.27 + height * 0.07),
            f"{width}x{height}",
            font=font,
            fill=(160, 165, 180),
        )
        return image
