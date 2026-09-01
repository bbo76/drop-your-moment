"""Tests des étapes élémentaires de composition."""

from __future__ import annotations

import pytest
from PIL import Image

from dropyourmoment.imaging.filters import (
    SEPIA_HIGHLIGHT,
    SEPIA_SHADOW,
    FilterName,
    apply_filter,
)
from dropyourmoment.imaging.steps import apply_overlay, crop_to_aspect, overlay_matches_ratio

POSTCARD_RATIO = 148 / 100  # 1.48


def solid(size: tuple[int, int], color: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", size, color)


# --- Recadrage ---------------------------------------------------------------------


def test_recadre_en_largeur_vers_un_ratio_plus_etroit() -> None:
    """Le capteur est en 16:9, le tirage en 1,48 : on retire de la largeur."""
    cropped = crop_to_aspect(solid((2304, 1296), (10, 20, 30)), POSTCARD_RATIO)

    assert cropped.size == (1918, 1296), "la hauteur est conservée intégralement"
    assert cropped.size[0] / cropped.size[1] == pytest.approx(POSTCARD_RATIO, abs=1e-3)


def test_recadre_en_hauteur_vers_un_ratio_plus_large() -> None:
    cropped = crop_to_aspect(solid((1000, 1000), (0, 0, 0)), 2.0)

    assert cropped.size == (1000, 500)


def test_recadrage_centre() -> None:
    """Les visiteurs se placent au centre : c'est là qu'il faut conserver les pixels."""
    image = solid((300, 100), (0, 0, 0))
    # Bandes repères : rouge à gauche, vert au centre, bleu à droite.
    image.paste(solid((100, 100), (255, 0, 0)), (0, 0))
    image.paste(solid((100, 100), (0, 255, 0)), (100, 0))
    image.paste(solid((100, 100), (0, 0, 255)), (200, 0))

    cropped = crop_to_aspect(image, 1.0)

    assert cropped.size == (100, 100)
    assert cropped.getpixel((50, 50)) == (0, 255, 0), "la bande centrale doit survivre"


def test_aucun_recadrage_si_le_ratio_correspond_deja() -> None:
    original = solid((1480, 1000), (1, 2, 3))

    cropped = crop_to_aspect(original, POSTCARD_RATIO)

    assert cropped.size == original.size


def test_recadrage_ne_modifie_pas_la_source() -> None:
    original = solid((2304, 1296), (5, 5, 5))

    crop_to_aspect(original, POSTCARD_RATIO)

    assert original.size == (2304, 1296)


def test_ratio_cible_invalide_rejete() -> None:
    with pytest.raises(ValueError):
        crop_to_aspect(solid((100, 100), (0, 0, 0)), 0)


# --- Overlay -----------------------------------------------------------------------


def test_overlay_compose_par_dessus_la_photo() -> None:
    photo = solid((100, 100), (0, 0, 255))
    overlay = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    # Bandeau opaque rouge sur la moitié haute.
    overlay.paste((255, 0, 0, 255), (0, 0, 100, 50))

    result = apply_overlay(photo, overlay)

    assert result.getpixel((50, 10)) == (255, 0, 0), "zone couverte par l'overlay"
    assert result.getpixel((50, 90)) == (0, 0, 255), "zone transparente : la photo passe"


def test_overlay_redimensionne_a_la_photo() -> None:
    photo = solid((400, 200), (0, 0, 0))
    overlay = Image.new("RGBA", (100, 50), (255, 255, 255, 255))

    result = apply_overlay(photo, overlay)

    assert result.size == (400, 200)


def test_overlay_semi_transparent_se_melange() -> None:
    photo = solid((10, 10), (0, 0, 0))
    overlay = Image.new("RGBA", (10, 10), (255, 255, 255, 128))

    result = apply_overlay(photo, overlay)

    red = result.getpixel((5, 5))[0]
    assert 120 < red < 136, f"mélange à mi-chemin attendu, obtenu {red}"


def test_overlay_sans_canal_alpha_accepte() -> None:
    """Un PNG aplati ou un JPEG déposé par erreur ne doit pas faire tomber le pipeline."""
    photo = solid((10, 10), (0, 0, 0))
    overlay = solid((10, 10), (200, 100, 50))

    result = apply_overlay(photo, overlay)

    assert result.getpixel((5, 5)) == (200, 100, 50)


def test_validation_du_ratio_d_overlay() -> None:
    assert overlay_matches_ratio((1480, 1000), POSTCARD_RATIO)
    assert overlay_matches_ratio((2960, 2000), POSTCARD_RATIO), "mêmes proportions, autre taille"
    assert not overlay_matches_ratio((1000, 1000), POSTCARD_RATIO)
    assert not overlay_matches_ratio((100, 0), POSTCARD_RATIO), "hauteur nulle"


# --- Filtres -----------------------------------------------------------------------


def test_filtre_naturel_embellit_subtilement_les_couleurs() -> None:
    result = apply_filter(solid((10, 10), (200, 50, 25)), FilterName.ORIGINAL)

    assert result.getpixel((5, 5)) != (200, 50, 25)


def test_filtre_noir_et_blanc_studio_etend_les_tons_et_renforce_le_contraste() -> None:
    image = Image.new("RGB", (3, 1))
    image.putdata([(40, 40, 40), (128, 128, 128), (210, 210, 210)])

    result = apply_filter(image, FilterName.BW_STUDIO)

    assert result.getpixel((0, 0)) == (0, 0, 0)
    assert result.getpixel((2, 0)) == (255, 255, 255)
    assert result.getpixel((1, 0))[0] > 128


def test_filtre_sepia_rechauffe_l_image() -> None:
    image = Image.new("RGB", (3, 1))
    image.putdata([(40, 40, 40), (128, 128, 128), (210, 210, 210)])

    result = apply_filter(image, FilterName.SEPIA)

    red, green, blue = result.getpixel((1, 0))
    assert red > green > blue, "virage chaud attendu"
    assert result.getpixel((0, 0)) == SEPIA_SHADOW
    assert result.getpixel((2, 0)) == SEPIA_HIGHLIGHT


def test_les_filtres_ne_modifient_pas_la_source() -> None:
    """L'image composée est réutilisée à chaque changement de filtre en review."""
    original = solid((10, 10), (200, 50, 25))

    apply_filter(original, FilterName.SEPIA)

    assert original.getpixel((5, 5)) == (200, 50, 25)
