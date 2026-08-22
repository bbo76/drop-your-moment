"""Tests du chargement de la configuration d'événement.

Le fil conducteur : une borne doit démarrer et fonctionner même si la configuration est
absente, corrompue ou incohérente. Un événement se déroule le samedi soir, sans personne
pour déboguer un fichier JSON.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
from PIL import Image

from dropyourmoment.core.event_config import CONFIG_FILENAME, EventConfig, EventStore
from dropyourmoment.core.print_format import POSTCARD_LANDSCAPE, PrintFormat
from dropyourmoment.imaging.filters import FilterName


def test_config_absente_cree_les_valeurs_par_defaut(tmp_path: Path) -> None:
    """L'opérateur récupère un fichier à éditer au lieu d'en deviner la structure."""
    store = EventStore(tmp_path)

    event = store.load()

    assert event.config.event_name == "Événement"
    assert store.config_path.is_file()


def test_config_relue_a_l_identique(tmp_path: Path) -> None:
    store = EventStore(tmp_path)
    store.save_config(
        EventConfig(
            event_name="Mariage Camille & Théo",
            available_filters=[FilterName.ORIGINAL, FilterName.BW],
            copies_per_print=2,
        )
    )

    event = store.load()

    assert event.config.event_name == "Mariage Camille & Théo"
    assert event.config.available_filters == [FilterName.ORIGINAL, FilterName.BW]
    assert event.config.copies_per_print == 2


def test_config_corrompue_ne_bloque_pas_le_demarrage(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    (tmp_path / CONFIG_FILENAME).write_text("{ ceci n'est pas du JSON")

    with caplog.at_level(logging.ERROR):
        event = EventStore(tmp_path).load()

    assert event.config.event_name == "Événement", "on repart sur les valeurs par défaut"
    assert "illisible" in caplog.text


def test_config_invalide_ne_bloque_pas_le_demarrage(tmp_path: Path) -> None:
    """JSON valide mais valeurs hors bornes : même traitement."""
    (tmp_path / CONFIG_FILENAME).write_text('{"copies_per_print": 999}')

    event = EventStore(tmp_path).load()

    assert event.config.copies_per_print == 1


def test_fichier_corrompu_est_conserve(tmp_path: Path) -> None:
    """On ne réécrit pas par-dessus : l'opérateur doit pouvoir voir ce qui n'allait pas."""
    corrupted = "{ pas du JSON"
    (tmp_path / CONFIG_FILENAME).write_text(corrupted)

    EventStore(tmp_path).load()

    assert (tmp_path / CONFIG_FILENAME).read_text() == corrupted


def test_aucun_overlay_par_defaut(tmp_path: Path) -> None:
    assert EventStore(tmp_path).load().overlay is None


def test_overlay_charge_et_converti_en_rgba(tmp_path: Path) -> None:
    Image.new("RGB", (1480, 1000), (10, 20, 30)).save(tmp_path / "cadre.png")
    store = EventStore(tmp_path)
    store.save_config(EventConfig(overlay_file="cadre.png"))

    event = store.load()

    assert event.overlay is not None
    assert event.overlay.mode == "RGBA", "le pipeline compose en alpha"


def test_overlay_declare_mais_absent(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    store = EventStore(tmp_path)
    store.save_config(EventConfig(overlay_file="jamais-televerse.png"))

    with caplog.at_level(logging.WARNING):
        event = store.load()

    assert event.overlay is None, "la borne fonctionne sans branding plutôt que pas du tout"
    assert "introuvable" in caplog.text


def test_overlay_illisible(tmp_path: Path) -> None:
    (tmp_path / "cadre.png").write_bytes(b"ce ne sont pas des pixels")
    store = EventStore(tmp_path)
    store.save_config(EventConfig(overlay_file="cadre.png"))

    assert store.load().overlay is None


def test_overlay_au_mauvais_ratio_est_utilise_mais_signale(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Strict à la porte, permissif à l'exécution.

    Le téléversement refusera un mauvais ratio (jalon 5). Au chargement, en revanche,
    perdre le branding d'un événement serait plus grave que l'afficher étiré.
    """
    Image.new("RGBA", (1000, 1000), (0, 0, 0, 0)).save(tmp_path / "carre.png")
    store = EventStore(tmp_path)
    store.save_config(EventConfig(overlay_file="carre.png"))

    with caplog.at_level(logging.WARNING):
        event = store.load()

    assert event.overlay is not None
    assert "étiré" in caplog.text


def test_le_format_de_sortie_porte_le_ratio(tmp_path: Path) -> None:
    store = EventStore(tmp_path)
    store.save_config(
        EventConfig(print_format=PrintFormat(name="Carré", width_mm=72, height_mm=72))
    )

    assert EventStore(tmp_path).load().aspect_ratio == 1.0


def test_ratio_par_defaut_est_la_carte_postale_paysage(tmp_path: Path) -> None:
    assert EventStore(tmp_path).load().aspect_ratio == POSTCARD_LANDSCAPE.aspect_ratio


def test_filtres_proposes_interrogeables(tmp_path: Path) -> None:
    config = EventConfig(available_filters=[FilterName.ORIGINAL, FilterName.SEPIA])

    assert config.offers(FilterName.SEPIA)
    assert not config.offers(FilterName.BW)
