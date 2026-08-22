"""Interface caméra.

Le driver est propriétaire du capteur et rien d'autre : il produit des frames de preview
et des fichiers de capture. Il ne décide pas où les fichiers sont écrits (le chemin lui
est passé) et n'applique aucun traitement d'image — recadrage, filtre et overlay sont du
ressort de `dropyourmoment.imaging`. Cette frontière est ce qui permet d'échanger un driver
sans toucher au pipeline.

Limite assumée de cette interface : le scénario futur « navigateur comme caméra » (une
tablette sans capteur CSI, où le navigateur capture et téléverse) inverse le flux de
contrôle et ne rentre pas ici. Il demandera un second mode de capture au niveau de
l'API, pas un simple driver de plus.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CameraCapabilities:
    driver_name: str
    still_size: tuple[int, int]
    preview_size: tuple[int, int]
    supports_live_preview: bool


@dataclass(frozen=True)
class CaptureResult:
    path: Path
    size: tuple[int, int]


class CameraDriver(ABC):
    """Contrat commun à toutes les caméras.

    Cycle de vie : `start()` une fois au démarrage du backend, `stop()` à l'arrêt. Le
    driver est un singleton de longue durée, jamais instancié par requête — ouvrir le
    capteur coûte cher et il n'accepte qu'un propriétaire à la fois.
    """

    @abstractmethod
    def start(self) -> None:
        """Ouvre le capteur et démarre le flux de preview. Idempotent."""

    @abstractmethod
    def stop(self) -> None:
        """Libère le capteur. Idempotent."""

    @abstractmethod
    def is_available(self) -> bool:
        """True si le capteur est ouvert et prêt à produire des images."""

    @abstractmethod
    def get_capabilities(self) -> CameraCapabilities: ...

    @abstractmethod
    def preview_frames(self) -> Iterator[bytes]:
        """Flux infini de frames JPEG encodées, consommé par l'endpoint MJPEG.

        Le générateur doit être paresseux et bloquer entre deux frames plutôt que de
        tourner à vide : c'est lui qui cadence le flux. Il se termine proprement quand
        le consommateur se déconnecte (GeneratorExit) ou que le driver s'arrête.
        """

    @abstractmethod
    def capture_still(self, dest: Path) -> CaptureResult:
        """Écrit une image pleine résolution dans `dest` sans interrompre le preview."""
