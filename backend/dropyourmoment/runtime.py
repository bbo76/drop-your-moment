"""État partagé du process.

Un seul process héberge les deux serveurs (kiosque et admin), donc un seul `Runtime` :
une seule caméra ouverte, une seule machine à états, une seule config d'événement en
mémoire. C'est précisément ce que deux process séparés ne permettraient pas — l'admin ne
pourrait ni interroger le capteur (déjà ouvert par le kiosque) ni invalider la config
chargée côté kiosque.
"""

from __future__ import annotations

import hmac
import secrets
import time
from dataclasses import dataclass, field

from dropyourmoment.config import Settings
from dropyourmoment.core.event_config import EventStore, LoadedEvent
from dropyourmoment.core.print_flow import PrintFlow
from dropyourmoment.core.session import SessionMachine
from dropyourmoment.hardware.camera.base import CameraDriver
from dropyourmoment.hardware.camera.factory import build_camera_driver
from dropyourmoment.hardware.printer.base import PrinterDriver
from dropyourmoment.hardware.printer.null_driver import NullPrinterDriver
from dropyourmoment.imaging.filters import FilterName
from dropyourmoment.imaging.pipeline import ImagePipeline
from dropyourmoment.storage.counters import CounterStore
from dropyourmoment.storage.maintenance_pin import MaintenancePinStore
from dropyourmoment.storage.retention import purge


@dataclass
class Runtime:
    settings: Settings
    camera: CameraDriver
    printer: PrinterDriver
    machine: SessionMachine
    event_store: EventStore
    event: LoadedEvent
    pipeline: ImagePipeline = field(init=False)
    counters: CounterStore = field(init=False)
    print_flow: PrintFlow = field(init=False)
    maintenance_pin: MaintenancePinStore = field(init=False)
    _maintenance_token: str | None = field(default=None, init=False, repr=False)
    _maintenance_expires_at: float = field(default=0.0, init=False, repr=False)

    def __post_init__(self) -> None:
        self.pipeline = ImagePipeline(self.event)
        self.counters = CounterStore(self.settings.data_dir)
        self.maintenance_pin = MaintenancePinStore(
            self.settings.data_dir, self.settings.maintenance_pin
        )
        self.print_flow = PrintFlow(
            machine=self.machine,
            printer=self.printer,
            counters=self.counters,
            # La purge se déclenche après un tirage terminé : le visiteur regarde déjà
            # l'écran de confirmation, personne n'attend le balayage de répertoire.
            on_completed=self.purge_sessions,
        )

    @classmethod
    def build(cls, settings: Settings) -> Runtime:
        store = EventStore(settings.event_dir)
        return cls(
            settings=settings,
            camera=build_camera_driver(settings.camera_driver, settings.camera_device),
            # Pilote neutre pendant toute la phase numérique : le parcours va jusqu'au
            # bout sans imprimante branchée. Le jalon 7 branche ici le pilote CUPS.
            printer=NullPrinterDriver(),
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

    def purge_sessions(self) -> None:
        """Applique la politique de rétention, en épargnant la session en cours."""
        session = self.machine.session
        purge(
            self.settings.sessions_dir,
            self.settings.retention_policy(),
            keep_ids={session.id} if session is not None else set(),
        )

    def start(self) -> None:
        self.settings.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.settings.event_dir.mkdir(parents=True, exist_ok=True)
        self.purge_sessions()
        self.camera.start()

    def stop(self) -> None:
        self.camera.stop()

    def unlock_maintenance(self, pin: str) -> str | None:
        if not self.maintenance_pin.verify(pin):
            return None
        self._maintenance_token = secrets.token_urlsafe(32)
        self._maintenance_expires_at = (
            time.monotonic() + self.settings.maintenance_session_timeout_s
        )
        return self._maintenance_token

    def authorize_maintenance(self, token: str | None) -> bool:
        if (
            token is None
            or self._maintenance_token is None
            or not hmac.compare_digest(token, self._maintenance_token)
            or time.monotonic() >= self._maintenance_expires_at
        ):
            return False
        return True

    @property
    def maintenance_active(self) -> bool:
        return (
            self._maintenance_token is not None and time.monotonic() < self._maintenance_expires_at
        )

    def lock_maintenance(self) -> None:
        self._maintenance_token = None
        self._maintenance_expires_at = 0.0

    def replace_maintenance_pin(self, pin: str) -> None:
        self.maintenance_pin.replace(pin)
        self.lock_maintenance()
