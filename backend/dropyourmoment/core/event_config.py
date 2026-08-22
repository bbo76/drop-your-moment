"""Configuration d'un événement, et son chargement.

Un événement a un nom, un overlay fixe, une liste de filtres proposés et un format de
sortie. Ces réglages changent une fois par événement, jamais pendant, ce qui justifie un
simple fichier JSON plutôt qu'une base : un objet unique, lisible et corrigeable avec un
éditeur de texte si le portail d'administration n'est pas joignable.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError, field_validator

from dropyourmoment.core.print_format import POSTCARD_LANDSCAPE, PrintFormat
from dropyourmoment.imaging.filters import FilterName
from dropyourmoment.imaging.steps import overlay_matches_ratio
from dropyourmoment.storage.atomic import write_atomic

logger = logging.getLogger(__name__)

CONFIG_FILENAME = "event_config.json"

# Nom fixe : le téléversement remplace toujours le même fichier. Un nom par version
# imposerait de nettoyer les précédents, pour un dossier d'événement qui n'en contient
# qu'un à la fois.
OVERLAY_FILENAME = "overlay.png"


class EventConfig(BaseModel):
    event_name: str = "Événement"

    # Nom de fichier relatif au dossier de l'événement, jamais un chemin absolu : la
    # configuration doit rester déplaçable avec son dossier.
    overlay_file: str | None = None

    available_filters: list[FilterName] = Field(
        default_factory=lambda: [FilterName.ORIGINAL, FilterName.BW, FilterName.SEPIA]
    )
    print_format: PrintFormat = Field(default_factory=lambda: POSTCARD_LANDSCAPE.model_copy())
    copies_per_print: int = Field(default=1, ge=1, le=10)
    # 0 désactive le flash. Deux secondes est déjà une transition très appuyée ; au-delà,
    # l'écran semblerait bloqué plutôt que photographier.
    flash_duration_ms: int = Field(default=180, ge=0, le=2000)

    @field_validator("overlay_file")
    @classmethod
    def _must_be_a_bare_filename(cls, value: str | None) -> str | None:
        """Un nom de fichier, jamais un chemin.

        Le commentaire ci-dessus le demandait depuis le jalon 1 sans rien pour l'imposer,
        ce qui suffisait tant que la valeur venait d'un fichier édité à la main. Elle
        arrive maintenant par HTTP : c'est devenu une frontière de confiance, et
        `overlay_file` sert à construire un chemin de lecture.

        `Path(value).name` ne suffit pas seul — il rend « .. » inchangé, là où il vide
        « . » — d'où les deux cas nommés.
        """
        if value is None:
            return None
        if value in {"", ".", ".."} or value != Path(value).name:
            raise ValueError(f"nom de fichier attendu, pas un chemin : {value!r}")
        return value


@dataclass
class LoadedEvent:
    """Configuration accompagnée de son overlay déjà décodé.

    L'overlay est ouvert une seule fois au chargement, pas à chaque photo : décoder un
    PNG de plusieurs mégapixels à chaque capture serait du gaspillage pur sur un Pi.
    """

    config: EventConfig
    overlay: Image.Image | None = None

    @property
    def aspect_ratio(self) -> float:
        return self.config.print_format.aspect_ratio


class EventStore:
    """Lecture et écriture de la configuration d'événement sur disque."""

    def __init__(self, event_dir: Path) -> None:
        self._dir = event_dir

    @property
    def config_path(self) -> Path:
        return self._dir / CONFIG_FILENAME

    @property
    def overlay_path(self) -> Path:
        """Emplacement de l'overlay téléversé.

        Exposé ici plutôt que reconstruit par le routeur : la disposition du dossier
        d'événement appartient au store, comme pour `config_path`.
        """
        return self._dir / OVERLAY_FILENAME

    def load(self) -> LoadedEvent:
        config = self._read_config()
        return LoadedEvent(config=config, overlay=self._read_overlay(config))

    def save_config(self, config: EventConfig) -> None:
        """Écrit la configuration sans état intermédiaire visible.

        Atomique parce que ce fichier est réécrit depuis le portail pendant qu'un
        événement se déroule : un JSON tronqué ferait repartir la borne sur les valeurs
        par défaut, donc sans le nom de l'événement ni son overlay.
        """
        write_atomic(self.config_path, (config.model_dump_json(indent=2) + "\n").encode("utf-8"))

    def _read_config(self) -> EventConfig:
        if not self.config_path.is_file():
            # Écrire les valeurs par défaut donne à l'opérateur un fichier à éditer, au
            # lieu d'avoir à en deviner la structure.
            logger.info("aucune configuration d'événement — création de %s", self.config_path)
            config = EventConfig()
            self.save_config(config)
            return config

        try:
            return EventConfig.model_validate_json(self.config_path.read_text(encoding="utf-8"))
        except (ValidationError, json.JSONDecodeError, OSError) as exc:
            # Repartir sur les valeurs par défaut plutôt que refuser de démarrer : une
            # borne qui fonctionne sans branding vaut mieux qu'une borne éteinte en
            # pleine soirée. Le fichier fautif est conservé tel quel.
            logger.error("configuration d'événement illisible (%s) — valeurs par défaut", exc)
            return EventConfig()

    def _read_overlay(self, config: EventConfig) -> Image.Image | None:
        if not config.overlay_file:
            return None

        path = self._dir / config.overlay_file
        if not path.is_file():
            logger.warning("overlay déclaré mais introuvable : %s", path)
            return None

        try:
            with Image.open(path) as opened:
                overlay = opened.convert("RGBA")
        except (UnidentifiedImageError, OSError) as exc:
            logger.error("overlay illisible (%s) : %s", exc, path)
            return None

        target = config.print_format.aspect_ratio
        if not overlay_matches_ratio(overlay.size, target):
            # On l'utilise quand même : perdre le branding d'un événement est plus grave
            # que l'afficher légèrement étiré. Le téléversement, lui, refusera — strict à
            # la porte, permissif à l'exécution.
            logger.warning(
                "overlay %s au ratio %.3f, attendu %.3f — il sera étiré",
                path.name,
                overlay.size[0] / overlay.size[1],
                target,
            )
        return overlay
