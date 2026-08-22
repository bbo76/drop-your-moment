"""Purge des sessions anciennes : deux garde-fous, et une session à ne jamais toucher."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from dropyourmoment.storage.retention import RetentionPolicy, purge

NOW = datetime(2026, 8, 22, 20, 0, tzinfo=UTC)


@pytest.fixture
def sessions_root(tmp_path: Path) -> Path:
    root = tmp_path / "sessions"
    root.mkdir()
    return root


def make_session(root: Path, session_id: str, age_days: float, size: int = 1024) -> Path:
    directory = root / session_id
    directory.mkdir()
    (directory / "final.jpg").write_bytes(b"x" * size)
    stamp = (NOW - timedelta(days=age_days)).timestamp()
    os.utime(directory, (stamp, stamp))
    return directory


def test_purge_par_age(sessions_root: Path) -> None:
    make_session(sessions_root, "vieille", age_days=40)
    make_session(sessions_root, "recente", age_days=2)

    report = purge(sessions_root, RetentionPolicy(max_age_days=30, max_total_bytes=10**9), now=NOW)

    assert report.removed_ids == ["vieille"]
    assert (sessions_root / "recente").is_dir()


def test_purge_par_plafond_d_espace(sessions_root: Path) -> None:
    """Deux événements dans la même semaine : aucune session n'est vieille, tout déborde."""
    for index in range(4):
        make_session(sessions_root, f"s{index}", age_days=4 - index, size=1000)

    report = purge(sessions_root, RetentionPolicy(max_age_days=30, max_total_bytes=2500), now=NOW)

    # Les plus anciennes partent en premier, jusqu'à repasser sous le plafond.
    assert report.removed_ids == ["s0", "s1"]
    assert report.remaining_bytes <= 2500


def test_la_session_en_cours_est_epargnee(sessions_root: Path) -> None:
    """On ne purge jamais sous les pieds d'un visiteur, même si l'âge le réclame."""
    make_session(sessions_root, "en-cours", age_days=99)

    report = purge(
        sessions_root,
        RetentionPolicy(max_age_days=1, max_total_bytes=0),
        keep_ids={"en-cours"},
        now=NOW,
    )

    assert report.removed_ids == []
    assert (sessions_root / "en-cours").is_dir()


def test_le_rapport_compte_les_octets_liberes(sessions_root: Path) -> None:
    make_session(sessions_root, "vieille", age_days=40, size=2048)

    report = purge(sessions_root, RetentionPolicy(max_age_days=30, max_total_bytes=10**9), now=NOW)

    assert report.removed == 1
    assert report.freed_bytes == 2048
    assert report.remaining_bytes == 0


def test_un_repertoire_absent_ne_fait_pas_echouer(tmp_path: Path) -> None:
    """Premier démarrage : la purge tourne avant que quoi que ce soit ait été écrit."""
    report = purge(tmp_path / "jamais-cree", RetentionPolicy(max_age_days=30, max_total_bytes=0))

    assert report.removed == 0


def test_conversion_depuis_les_gigaoctets() -> None:
    policy = RetentionPolicy.from_gb(max_age_days=30, max_total_gb=2)

    assert policy.max_total_bytes == 2 * 1024**3
