"""Compteur de tirages : il doit survivre à un redémarrage et tolérer un fichier abîmé."""

from __future__ import annotations

from pathlib import Path

from dropyourmoment.storage.counters import COUNTERS_FILENAME, CounterStore


def test_part_de_zero_sans_fichier(tmp_path: Path) -> None:
    assert CounterStore(tmp_path).read().prints_total == 0


def test_incremente_des_deux_cotes(tmp_path: Path) -> None:
    store = CounterStore(tmp_path)

    store.record_prints(2)
    counters = store.record_prints(3)

    assert counters.prints_total == 5


def test_survit_a_un_redemarrage(tmp_path: Path) -> None:
    """L'état de session est en mémoire et se perd ; le compteur, non."""
    CounterStore(tmp_path).record_prints(4)

    assert CounterStore(tmp_path).read().prints_total == 4


def test_un_fichier_corrompu_repart_de_zero(tmp_path: Path) -> None:
    """Une borne qui compte faux vaut mieux qu'une borne qui refuse de démarrer."""
    (tmp_path / COUNTERS_FILENAME).write_text("{ceci n'est pas du JSON", encoding="utf-8")

    assert CounterStore(tmp_path).read().prints_total == 0


def test_un_fichier_incomplet_repart_de_zero(tmp_path: Path) -> None:
    """JSON valide mais sans le compteur : même arbitrage qu'un fichier corrompu."""
    (tmp_path / COUNTERS_FILENAME).write_text('{"autre_chose": 7}', encoding="utf-8")

    assert CounterStore(tmp_path).read().prints_total == 0


def test_l_ecriture_ne_laisse_pas_de_temporaire(tmp_path: Path) -> None:
    """L'écriture est atomique : le temporaire ne doit pas survivre au remplacement."""
    store = CounterStore(tmp_path)

    store.record_prints(1)

    assert (tmp_path / COUNTERS_FILENAME).is_file()
    assert list(tmp_path.glob("*.tmp")) == []
