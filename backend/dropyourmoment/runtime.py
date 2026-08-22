"""État partagé du process.

Un seul process héberge les deux serveurs (kiosque et admin), donc un seul `Runtime` :
une seule caméra ouverte, une seule machine à états, une seule config d'événement en
mémoire. C'est précisément ce que deux process séparés ne permettraient pas — l'admin ne
pourrait ni interroger le capteur (déjà ouvert par le kiosque) ni invalider la config
chargée côté kiosque.
"""

from __future__ import annotations

from dataclasses import dataclass

from dropyourmoment.config import Settings
from dropyourmoment.core.print_format import BUILTIN_FORMATS, DEFAULT_FORMAT_KEY, PrintFormat
from dropyourmoment.core.session import SessionMachine
from dropyourmoment.hardware.camera.base import CameraDriver
from dropyourmoment.hardware.camera.factory import build_camera_driver


@dataclass
class Runtime:
    settings: Settings
    camera: CameraDriver
    machine: SessionMachine
    # Jalon 2 : remplacé par le format porté par EventConfig, éditable depuis l'admin.
    print_format: PrintFormat

    @classmethod
    def build(cls, settings: Settings) -> Runtime:
        return cls(
            settings=settings,
            camera=build_camera_driver(settings.camera_driver),
            machine=SessionMachine(timeouts=settings.state_timeouts()),
            print_format=BUILTIN_FORMATS[DEFAULT_FORMAT_KEY],
        )

    def start(self) -> None:
        self.settings.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.settings.event_dir.mkdir(parents=True, exist_ok=True)
        self.camera.start()

    def stop(self) -> None:
        self.camera.stop()
