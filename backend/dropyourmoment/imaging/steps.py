"""Étapes élémentaires de composition, chacune pure et testable isolément.

L'orchestration — et surtout l'ordre — vit dans `pipeline.py`.
"""

from __future__ import annotations

from PIL import Image

# Tolérance de comparaison de ratios. 1 % absorbe les arrondis d'un overlay exporté à des
# dimensions entières sans laisser passer une vraie erreur de format.
RATIO_TOLERANCE = 0.01


def crop_to_aspect(image: Image.Image, target_ratio: float) -> Image.Image:
    """Recadre au centre pour atteindre exactement `target_ratio` (largeur / hauteur).

    Recadrer plutôt que déformer, et au centre plutôt que sur un bord : c'est là que les
    visiteurs se placent. Le repère affiché sur l'aperçu doit annoncer exactement ce
    recadrage, sinon on coupe des têtes.
    """
    if target_ratio <= 0:
        raise ValueError(f"ratio cible invalide : {target_ratio}")

    width, height = image.size
    current = width / height
    if abs(current - target_ratio) <= RATIO_TOLERANCE * target_ratio:
        return image.copy()

    if target_ratio < current:
        kept = round(height * target_ratio)
        left = (width - kept) // 2
        return image.crop((left, 0, left + kept, height))

    kept = round(width / target_ratio)
    top = (height - kept) // 2
    return image.crop((0, top, width, top + kept))


def apply_overlay(image: Image.Image, overlay: Image.Image) -> Image.Image:
    """Compose l'overlay d'événement par-dessus l'image.

    L'overlay est redimensionné si nécessaire, mais son ratio n'est pas corrigé : un
    overlay au mauvais ratio serait étiré. C'est `overlay_matches_ratio` qui doit servir
    de garde-fou en amont, au moment du téléversement.
    """
    base = image.convert("RGBA")
    if overlay.size != base.size:
        overlay = overlay.resize(base.size, Image.Resampling.LANCZOS)
    if overlay.mode != "RGBA":
        overlay = overlay.convert("RGBA")
    return Image.alpha_composite(base, overlay).convert("RGB")


def overlay_matches_ratio(overlay_size: tuple[int, int], target_ratio: float) -> bool:
    """True si l'overlay peut être redimensionné sans déformation visible."""
    width, height = overlay_size
    if height == 0:
        return False
    return abs(width / height - target_ratio) <= RATIO_TOLERANCE * target_ratio
