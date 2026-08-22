"""Orchestration de la composition d'une photo.

L'ordre des étapes est la décision structurante de ce module :

    prise brute → recadrage au ratio de sortie → filtre → overlay

Le filtre passe **avant** l'overlay. L'inverse — filtrer l'ensemble déjà composé — ferait
partir en sépia le cadre et le logo de l'événement dès qu'un visiteur choisit ce filtre,
ce qui détruit un branding en couleur.

Conséquence utile de cet ordre : aucun fichier intermédiaire n'est nécessaire. Changer de
filtre en review recompose depuis la prise brute, ce qui coûte quelques dizaines de
millisecondes et évite une seconde compression JPEG.
"""

from __future__ import annotations

import logging
from pathlib import Path

from PIL import Image

from dropyourmoment.core.errors import PhotoboothError
from dropyourmoment.core.event_config import LoadedEvent
from dropyourmoment.imaging.filters import FilterName, apply_filter
from dropyourmoment.imaging.steps import apply_overlay, crop_to_aspect

logger = logging.getLogger(__name__)

# Assez haut pour un tirage 10x15 sans artefact visible, assez bas pour ne pas remplir la
# carte SD : une centaine de sessions par événement, deux fichiers chacune.
JPEG_QUALITY = 92


class CompositionError(PhotoboothError):
    """La composition a échoué (prise illisible)."""


class ImagePipeline:
    def __init__(self, event: LoadedEvent) -> None:
        self._event = event

    def compose(self, raw_path: Path, filter_name: FilterName) -> Image.Image:
        """Construit l'image finale à partir de la prise brute d'une session."""
        shot = self._load_and_crop(raw_path)
        filtered = apply_filter(shot, filter_name)

        if self._event.overlay is None:
            return filtered
        return apply_overlay(filtered, self._event.overlay)

    def _load_and_crop(self, path: Path) -> Image.Image:
        try:
            with Image.open(path) as opened:
                shot = opened.convert("RGB")
        except OSError as exc:
            raise CompositionError(f"prise illisible : {path} ({exc})") from exc

        return crop_to_aspect(shot, self._event.aspect_ratio)


def save_jpeg(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="JPEG", quality=JPEG_QUALITY, optimize=True)
