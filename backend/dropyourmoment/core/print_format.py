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

from pydantic import BaseModel, Field


class PrintFormat(BaseModel):
    name: str = Field(min_length=1)
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)
    dpi: int = Field(default=300, gt=0)

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


# Média de la Canon Selphy CP1500 retenu par défaut : le plus courant, et l'orientation
# qui cadre le mieux un groupe. Les autres médias (portrait, carte, carré) s'écrivent à la
# main dans `event_config.json` — un format est quatre nombres, pas une entrée de registre.
POSTCARD_LANDSCAPE = PrintFormat(name="Carte postale paysage", width_mm=148, height_mm=100)
