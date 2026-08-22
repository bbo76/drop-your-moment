"""Purge des sessions anciennes.

Deux raisons chiffrées, et donc deux garde-fous distincts :

- **l'âge** : environ 2 Go par événement, qui n'ont pas à s'accumuler indéfiniment ;
- **le plafond d'espace** : deux événements chargés dans la même semaine rempliraient la
  carte SD sans qu'aucune session n'ait atteint l'âge limite.

L'âge est ce qu'un opérateur comprend et règle ; le plafond est le filet qui évite le
disque plein en pleine soirée. Un seul des deux laisserait un trou : sans plafond on se
remplit vite, sans âge on supprime des photos le jour même d'un gros événement.

L'horloge est injectée, comme celle de la machine à états : sinon un test d'âge demanderait
d'attendre.
"""

from __future__ import annotations

import logging
import shutil
from collections.abc import Collection
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

BYTES_PER_GB = 1024**3


@dataclass(frozen=True)
class RetentionPolicy:
    max_age_days: float
    max_total_bytes: int

    @classmethod
    def from_gb(cls, max_age_days: float, max_total_gb: float) -> RetentionPolicy:
        return cls(max_age_days=max_age_days, max_total_bytes=int(max_total_gb * BYTES_PER_GB))


@dataclass(frozen=True)
class PurgeReport:
    removed_ids: list[str]
    freed_bytes: int
    remaining_bytes: int

    @property
    def removed(self) -> int:
        return len(self.removed_ids)


@dataclass(frozen=True)
class _Candidate:
    path: Path
    modified_at: float
    size: int


def purge(
    sessions_root: Path,
    policy: RetentionPolicy,
    keep_ids: Collection[str] = (),
    now: datetime | None = None,
) -> PurgeReport:
    """Supprime les sessions trop vieilles, puis les plus anciennes si le total déborde.

    `keep_ids` protège la session en cours : on ne purge jamais sous les pieds d'un
    visiteur, même si l'horloge ou le plafond le réclament.
    """
    if not sessions_root.is_dir():
        return PurgeReport(removed_ids=[], freed_bytes=0, remaining_bytes=0)

    protected = set(keep_ids)
    reference = (now or datetime.now(UTC)).timestamp()
    age_limit = policy.max_age_days * 86400.0

    # Triés du plus ancien au plus récent : c'est l'ordre de suppression des deux passes.
    candidates = sorted(
        (
            _Candidate(path=entry, modified_at=entry.stat().st_mtime, size=_directory_size(entry))
            for entry in sessions_root.iterdir()
            if entry.is_dir() and entry.name not in protected
        ),
        key=lambda candidate: candidate.modified_at,
    )
    total = sum(candidate.size for candidate in candidates)
    total += sum(
        _directory_size(sessions_root / session_id)
        for session_id in protected
        if (sessions_root / session_id).is_dir()
    )

    removed: list[str] = []
    freed = 0
    survivors: list[_Candidate] = []

    for candidate in candidates:
        if reference - candidate.modified_at > age_limit:
            _remove(candidate, "âge")
            removed.append(candidate.path.name)
            freed += candidate.size
        else:
            survivors.append(candidate)

    for candidate in survivors:
        if total - freed <= policy.max_total_bytes:
            break
        _remove(candidate, "plafond d'espace")
        removed.append(candidate.path.name)
        freed += candidate.size

    if removed:
        logger.info(
            "rétention : %d session(s) supprimée(s), %.1f Mo libérés",
            len(removed),
            freed / 1024 / 1024,
        )
    return PurgeReport(removed_ids=removed, freed_bytes=freed, remaining_bytes=total - freed)


def _remove(candidate: _Candidate, reason: str) -> None:
    logger.info("rétention : suppression de %s (%s)", candidate.path.name, reason)
    shutil.rmtree(candidate.path, ignore_errors=True)


def _directory_size(directory: Path) -> int:
    return sum(entry.stat().st_size for entry in directory.rglob("*") if entry.is_file())
