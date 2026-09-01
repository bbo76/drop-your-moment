"""Filtres colorimétriques proposés au visiteur.

Ils s'appliquent à la photo **avant** que l'overlay d'événement soit composé par-dessus :
un cadre ou un logo en couleur ne doit pas partir en sépia parce qu'un invité a choisi ce
filtre. Cet ordre est porté par `ImagePipeline`, pas par ce module.
"""

from __future__ import annotations

from enum import StrEnum

from PIL import Image, ImageEnhance, ImageOps


class FilterName(StrEnum):
    ORIGINAL = "original"
    BW_STUDIO = "bw_studio"
    SEPIA = "sepia"


# Teintes du virage sépia : un noir légèrement chaud et un blanc crème. Des valeurs plus
# saturées donnent un rendu carte postale des années 70 peu flatteur sur des visages.
SEPIA_SHADOW = (24, 20, 16)
SEPIA_HIGHLIGHT = (250, 242, 228)


def _studio_grayscale(image: Image.Image) -> Image.Image:
    balanced = ImageOps.autocontrast(ImageOps.grayscale(image), cutoff=1)
    return ImageEnhance.Contrast(balanced).enhance(1.18)


def apply_filter(image: Image.Image, name: FilterName) -> Image.Image:
    """Retourne une nouvelle image filtrée. L'originale n'est jamais modifiée."""
    if name is FilterName.ORIGINAL:
        natural = ImageEnhance.Contrast(image).enhance(1.04)
        natural = ImageEnhance.Color(natural).enhance(1.05)
        return ImageEnhance.Sharpness(natural).enhance(1.05)
    if name is FilterName.BW_STUDIO:
        return _studio_grayscale(image).convert("RGB")
    if name is FilterName.SEPIA:
        return ImageOps.colorize(
            _studio_grayscale(image),
            black=SEPIA_SHADOW,
            white=SEPIA_HIGHLIGHT,
        ).convert("RGB")
    raise ValueError(f"filtre inconnu : {name}")
