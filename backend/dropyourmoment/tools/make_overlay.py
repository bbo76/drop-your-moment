"""Génère un overlay de démonstration au bon ratio.

Sert à exercer la chaîne complète avant de disposer d'un vrai visuel d'événement. Le
fichier produit est un PNG transparent au centre, avec un cadre et un bandeau nommant
l'événement — la place qu'occuperait un logo client.

Volontairement pas automatique : l'application n'écrit jamais d'overlay toute seule dans
le dossier d'un événement. Un cadre de démonstration apparaissant sur les photos d'un
mariage serait pire que pas de cadre du tout.

    uv run python -m dropyourmoment.tools.make_overlay
    uv run python -m dropyourmoment.tools.make_overlay --label "Mariage C & T"
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from dropyourmoment.config import load_settings
from dropyourmoment.core.event_config import EventStore
from dropyourmoment.core.print_format import PrintFormat

FRAME_COLOR = (255, 255, 255, 235)
BANNER_COLOR = (18, 20, 26, 205)
TEXT_COLOR = (255, 255, 255, 245)

# La police par défaut de Pillow n'embarque aucun glyphe accentué : « Mariage Camille &
# Théo » sortait « Th□o ». Rédhibitoire pour un outil dont l'unique travail est d'écrire un
# nom d'événement français. D'où ces deux polices système, la première de Raspberry Pi OS,
# la seconde de macOS — la seule paire nécessaire, la borne et le poste de développement.
FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
)


def build_overlay(print_format: PrintFormat, label: str) -> Image.Image:
    width, height = print_format.pixel_size
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Cadre fin en retrait du bord : un liseré collé au bord disparaît sous la marge non
    # imprimable de la plupart des imprimantes photo.
    margin = round(min(width, height) * 0.035)
    thickness = max(2, round(min(width, height) * 0.006))
    draw.rectangle(
        [margin, margin, width - margin, height - margin],
        outline=FRAME_COLOR,
        width=thickness,
    )

    # Bandeau bas : l'endroit où un logo d'événement se place sans manger les visages.
    banner_height = round(height * 0.12)
    banner_top = height - margin - banner_height
    draw.rectangle(
        [margin + thickness, banner_top, width - margin - thickness, height - margin - thickness],
        fill=BANNER_COLOR,
    )

    font = _font(size=round(banner_height * 0.42))
    box = draw.textbbox((0, 0), label, font=font)
    draw.text(
        (
            (width - (box[2] - box[0])) / 2,
            banner_top + (banner_height - (box[3] - box[1])) / 2 - box[1],
        ),
        label,
        font=font,
        fill=TEXT_COLOR,
    )
    return overlay


def _font(size: int) -> ImageFont.FreeTypeFont:
    """Une police qui sait écrire « Théo ».

    Repli sur la police par défaut plutôt qu'une erreur : un cadre au texte abîmé reste
    plus utile qu'un outil qui refuse de produire quoi que ce soit.
    """
    for candidate in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    print("aucune police système trouvée — les accents sortiront en carrés")
    return ImageFont.load_default(size=size)


def main() -> None:
    settings = load_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", default="Drop Your Moment", help="texte du bandeau")
    parser.add_argument(
        "--out",
        type=Path,
        default=settings.event_dir / "overlay.png",
        help="chemin du PNG produit",
    )
    args = parser.parse_args()

    # Le ratio vient du format de sortie de l'événement, jamais d'un choix indépendant :
    # un overlay au mauvais ratio finit étiré sur la photo.
    print_format = EventStore(settings.event_dir).load().config.print_format
    overlay = build_overlay(print_format, args.label)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    overlay.save(args.out)

    print(f"overlay écrit : {args.out} ({overlay.size[0]}x{overlay.size[1]})")
    print(f'renseignez "overlay_file": "{args.out.name}" dans event_config.json')


if __name__ == "__main__":
    main()
