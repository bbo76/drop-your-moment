"""Filtres colorimétriques proposés au visiteur.

Ils s'appliquent à la photo **avant** que l'overlay d'événement soit composé par-dessus :
un cadre ou un logo en couleur ne doit pas partir en sépia parce qu'un invité a choisi ce
filtre. Cet ordre est porté par `ImagePipeline`, pas par ce module.
"""

from __future__ import annotations

from enum import StrEnum

from PIL import Image, ImageOps


class FilterName(StrEnum):
    ORIGINAL = "original"
    BW = "bw"
    SEPIA = "sepia"


# Teintes du virage sépia : un noir légèrement chaud et un blanc crème. Des valeurs plus
# saturées donnent un rendu carte postale des années 70 peu flatteur sur des visages.
SEPIA_SHADOW = (38, 26, 14)
SEPIA_HIGHLIGHT = (255, 240, 214)


def apply_filter(image: Image.Image, name: FilterName) -> Image.Image:
    """Retourne une nouvelle image filtrée. L'originale n'est jamais modifiée."""
    if name is FilterName.ORIGINAL:
        return image.copy()
    if name is FilterName.BW:
        return ImageOps.grayscale(image).convert("RGB")
    if name is FilterName.SEPIA:
        return ImageOps.colorize(
            ImageOps.grayscale(image),
            black=SEPIA_SHADOW,
            white=SEPIA_HIGHLIGHT,
        ).convert("RGB")
    raise ValueError(f"filtre inconnu : {name}")
