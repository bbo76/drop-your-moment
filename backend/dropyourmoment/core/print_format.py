"""Format de sortie : ce qui définit le recadrage, même sans imprimante branchée.

Trois ratios cohabitent dans la chaîne et doivent être réconciliés explicitement, sinon
on coupe des têtes en bord de cadre :

    capteur IMX708 (2304×1296)          16:9   → 1.778
    tirage Selphy carte postale         148:100 → 1.480
    écran tactile 7 pouces (800×480)    5:3    → 1.667

Le format de sortie est l'autorité : c'est lui qui fixe le ratio de recadrage, le ratio
attendu de l'overlay, et le cadre de visée affiché sur le preview. Il reste pertinent
pendant la phase numérique — une photo sans imprimante a quand même besoin d'un cadrage
décidé, et le décider maintenant évite de refaire tous les overlays plus tard.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class PrintFormat(BaseModel):
    name: str
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)
    dpi: int = Field(default=300, gt=0)

    @field_validator("name")
    @classmethod
    def _non_vide(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("le nom du format ne peut pas être vide")
        return value

    @property
    def aspect_ratio(self) -> float:
        """Largeur / hauteur. > 1 en paysage, < 1 en portrait."""
        return self.width_mm / self.height_mm

    @property
    def pixel_size(self) -> tuple[int, int]:
        """Dimensions cibles en pixels à la résolution de tirage."""
        mm_per_inch = 25.4
        return (
            round(self.width_mm / mm_per_inch * self.dpi),
            round(self.height_mm / mm_per_inch * self.dpi),
        )


# Formats de média de la Canon Selphy CP1500. Le paysage carte postale est le défaut :
# c'est le média le plus courant et l'orientation qui cadre le mieux un groupe.
POSTCARD_LANDSCAPE = PrintFormat(name="Carte postale paysage", width_mm=148, height_mm=100)
POSTCARD_PORTRAIT = PrintFormat(name="Carte postale portrait", width_mm=100, height_mm=148)
CARD_LANDSCAPE = PrintFormat(name="Format carte paysage", width_mm=86, height_mm=54)
SQUARE = PrintFormat(name="Carré", width_mm=72, height_mm=72)

BUILTIN_FORMATS: dict[str, PrintFormat] = {
    "postcard_landscape": POSTCARD_LANDSCAPE,
    "postcard_portrait": POSTCARD_PORTRAIT,
    "card_landscape": CARD_LANDSCAPE,
    "square": SQUARE,
}

DEFAULT_FORMAT_KEY = "postcard_landscape"
