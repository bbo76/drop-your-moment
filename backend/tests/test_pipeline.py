"""Tests du pipeline de composition.

Le test le plus important de ce fichier est celui qui vérifie que l'overlay n'est pas
filtré : c'est l'erreur d'ordre qui détruirait le branding d'un événement, et elle est
invisible à l'œil sur une photo réelle.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from dropyourmoment.core.event_config import EventConfig, LoadedEvent
from dropyourmoment.core.print_format import POSTCARD_LANDSCAPE
from dropyourmoment.imaging.filters import FilterName
from dropyourmoment.imaging.pipeline import CompositionError, ImagePipeline, save_jpeg

RATIO = POSTCARD_LANDSCAPE.aspect_ratio


@pytest.fixture
def raw_shot(tmp_path: Path) -> Path:
    """Prise brute en 16:9, comme le capteur la produit."""
    path = tmp_path / "raw.jpg"
    Image.new("RGB", (2304, 1296), (120, 120, 120)).save(path, format="JPEG", quality=95)
    return path


def event(overlay: Image.Image | None = None) -> LoadedEvent:
    return LoadedEvent(config=EventConfig(print_format=POSTCARD_LANDSCAPE), overlay=overlay)


def red_band_overlay(size: tuple[int, int] = (1480, 1000)) -> Image.Image:
    """Overlay au ratio du tirage : bandeau rouge opaque en haut, reste transparent."""
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    overlay.paste((255, 0, 0, 255), (0, 0, size[0], size[1] // 5))
    return overlay


def test_compose_recadre_au_format_de_sortie(raw_shot: Path) -> None:
    result = ImagePipeline(event()).compose(raw_shot, FilterName.ORIGINAL)

    assert result.size == (1918, 1296)
    assert result.size[0] / result.size[1] == pytest.approx(RATIO, abs=1e-3)


def test_compose_conserve_la_resolution_native(raw_shot: Path) -> None:
    """On ne redimensionne pas à la taille d'impression : la sortie sert aussi au
    numérique, et le tirage se chargera de son propre échantillonnage."""
    result = ImagePipeline(event()).compose(raw_shot, FilterName.ORIGINAL)

    minimum = POSTCARD_LANDSCAPE.pixel_size
    assert result.size[0] >= minimum[0]
    assert result.size[1] >= minimum[1]


def test_l_overlay_est_applique(raw_shot: Path) -> None:
    result = ImagePipeline(event(red_band_overlay())).compose(raw_shot, FilterName.ORIGINAL)

    width, height = result.size
    assert result.getpixel((width // 2, height // 10)) == (255, 0, 0)


def test_l_overlay_n_est_pas_filtre(raw_shot: Path) -> None:
    """L'ordre du pipeline : filtre sur la photo, overlay par-dessus.

    Si l'overlay était composé avant le filtre, ce rouge saturé sortirait en gris avec le
    filtre N&B — et le logo d'un client partirait avec lui.
    """
    result = ImagePipeline(event(red_band_overlay())).compose(raw_shot, FilterName.BW)

    width, height = result.size
    red, green, blue = result.getpixel((width // 2, height // 10))
    assert (red, green, blue) == (255, 0, 0), "l'overlay doit garder ses couleurs"

    # La photo, elle, doit bien être désaturée.
    photo_pixel = result.getpixel((width // 2, height // 2))
    assert photo_pixel[0] == photo_pixel[1] == photo_pixel[2]


def test_le_filtre_sepia_epargne_aussi_l_overlay(raw_shot: Path) -> None:
    result = ImagePipeline(event(red_band_overlay())).compose(raw_shot, FilterName.SEPIA)

    width, height = result.size
    assert result.getpixel((width // 2, height // 10)) == (255, 0, 0)


def test_composition_sans_overlay(raw_shot: Path) -> None:
    """Une borne sans branding configuré doit fonctionner normalement."""
    result = ImagePipeline(event()).compose(raw_shot, FilterName.ORIGINAL)

    assert result.size == (1918, 1296)


def test_changer_de_filtre_est_reproductible(raw_shot: Path) -> None:
    """En review, le visiteur peut faire des allers-retours entre filtres.

    Recomposer depuis la prise brute doit redonner exactement le même résultat, sinon
    l'image change subtilement à chaque essai.
    """
    pipeline = ImagePipeline(event(red_band_overlay()))

    first = pipeline.compose(raw_shot, FilterName.SEPIA)
    pipeline.compose(raw_shot, FilterName.BW)
    again = pipeline.compose(raw_shot, FilterName.SEPIA)

    assert first.tobytes() == again.tobytes()


def test_prise_manquante_rejetee(tmp_path: Path) -> None:
    with pytest.raises(CompositionError, match="illisible"):
        ImagePipeline(event()).compose(tmp_path / "absent.jpg", FilterName.ORIGINAL)


def test_sauvegarde_cree_l_arborescence(tmp_path: Path, raw_shot: Path) -> None:
    result = ImagePipeline(event()).compose(raw_shot, FilterName.ORIGINAL)
    destination = tmp_path / "sessions" / "abc123" / "final.jpg"

    save_jpeg(result, destination)

    assert destination.is_file()
    with Image.open(destination) as reopened:
        assert reopened.size == result.size
        assert reopened.format == "JPEG"
