"""Compteurs de tirages : survivre à un redémarrage, et tolérer un fichier abîmé.

Deux compteurs pour deux questions : « combien de photos cet événement a-t-il produit »
et « me reste-t-il du papier ». Le second n'a de sens qu'accompagné du bouton qui le
réarme — sans lui il vaudrait toujours exactement le premier.
"""

from __future__ import annotations

from pathlib import Path

from dropyourmoment.storage.counters import COUNTERS_FILENAME, CounterStore


def test_part_de_zero_sans_fichier(tmp_path: Path) -> None:
    assert CounterStore(tmp_path).read().prints_total == 0


def test_incremente_les_deux_compteurs(tmp_path: Path) -> None:
    store = CounterStore(tmp_path)

    store.record_prints(2)
    counters = store.record_prints(3)

    assert counters.prints_total == 5
    assert counters.prints_since_reset == 5


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


def test_la_remise_a_zero_n_entame_pas_le_cumul(tmp_path: Path) -> None:
    """Les deux compteurs répondent à deux questions : changer de papier n'efface pas
    le nombre de photos que l'événement a produites."""
    store = CounterStore(tmp_path)
    store.record_prints(40)

    counters = store.reset_cartridge()

    assert counters.prints_total == 40
    assert counters.prints_since_reset == 0
    assert counters.reset_at is not None, "sans horodatage, on ne sait pas quand"


def test_les_tirages_reprennent_apres_la_remise_a_zero(tmp_path: Path) -> None:
    store = CounterStore(tmp_path)
    store.record_prints(40)
    store.reset_cartridge()

    counters = store.record_prints(3)

    assert counters.prints_total == 43
    assert counters.prints_since_reset == 3


def test_la_remise_a_zero_survit_a_un_redemarrage(tmp_path: Path) -> None:
    CounterStore(tmp_path).record_prints(40)
    CounterStore(tmp_path).reset_cartridge()

    assert CounterStore(tmp_path).read().prints_since_reset == 0


def test_un_fichier_de_l_ancien_format_se_relit(tmp_path: Path) -> None:
    """Migration : un `counters.json` écrit avant l'arrivée du second compteur n'a que le
    cumul. Aucune remise à zéro n'a eu lieu, donc la cartouche a vu passer tous les
    tirages — c'est la seule lecture honnête, et repartir de zéro annoncerait du papier
    qui n'existe pas."""
    (tmp_path / COUNTERS_FILENAME).write_text('{"prints_total": 12}', encoding="utf-8")

    counters = CounterStore(tmp_path).read()

    assert counters.prints_total == 12
    assert counters.prints_since_reset == 12
    assert counters.reset_at is None
