"""État partagé du process.

Un seul process héberge les deux serveurs (kiosque et admin), donc un seul `Runtime` :
une seule caméra ouverte, une seule machine à états, une seule config d'événement en
mémoire. C'est précisément ce que deux process séparés ne permettraient pas — l'admin ne
pourrait ni interroger le capteur (déjà ouvert par le kiosque) ni invalider la config
chargée côté kiosque.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from dropyourmoment.config import Settings
from dropyourmoment.core.event_config import EventStore, LoadedEvent
from dropyourmoment.core.session import SessionMachine
from dropyourmoment.hardware.camera.base import CameraDriver
from dropyourmoment.hardware.camera.factory import build_camera_driver
from dropyourmoment.imaging.filters import FilterName
from dropyourmoment.imaging.pipeline import ImagePipeline


@dataclass
class Runtime:
    settings: Settings
    camera: CameraDriver
    machine: SessionMachine
    event_store: EventStore
    event: LoadedEvent
    pipeline: ImagePipeline = field(init=False)

    def __post_init__(self) -> None:
        self.pipeline = ImagePipeline(self.event)

    @classmethod
    def build(cls, settings: Settings) -> Runtime:
        store = EventStore(settings.event_dir)
        return cls(
            settings=settings,
            camera=build_camera_driver(settings.camera_driver),
            machine=SessionMachine(timeouts=settings.state_timeouts()),
            event_store=store,
            event=store.load(),
        )

    def reload_event(self) -> None:
        """Relit la configuration d'événement et reconstruit le pipeline.

        Appelé après une modification depuis le portail d'administration. Comme les deux
        serveurs vivent dans le même process, le kiosque voit le changement aussitôt —
        sans redémarrage, et sans mécanisme d'invalidation entre process.
        """
        self.event = self.event_store.load()
        self.pipeline = ImagePipeline(self.event)

    @property
    def default_filter(self) -> FilterName:
        """Filtre appliqué juste après la capture, avant tout choix du visiteur.

        `original` s'il est proposé, sinon le premier de la liste : un événement peut
        n'offrir que du noir et blanc.
        """
        offered = self.event.config.available_filters
        if not offered or FilterName.ORIGINAL in offered:
            return FilterName.ORIGINAL
        return offered[0]

    def start(self) -> None:
        self.settings.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.settings.event_dir.mkdir(parents=True, exist_ok=True)
        self.camera.start()

    def stop(self) -> None:
        self.camera.stop()
