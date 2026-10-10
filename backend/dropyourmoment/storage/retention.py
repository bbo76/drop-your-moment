"""Rétention des photos finales, par âge et par espace total."""

from __future__ import annotations

import logging
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
        return cls(max_age_days, int(max_total_gb * BYTES_PER_GB))


@dataclass(frozen=True)
class _Candidate:
    path: Path
    modified_at: float
    size: int
    identity: str


def purge(
    sessions_root: Path,
    policy: RetentionPolicy,
    keep_ids: Collection[str] = (),
    now: datetime | None = None,
) -> list[str]:
    if not sessions_root.is_dir():
        return []
    protected = set(keep_ids)
    reference = (now or datetime.now(UTC)).timestamp()
    age_limit = policy.max_age_days * 86400
    candidates = sorted(
        (
            _Candidate(
                path=file,
                modified_at=file.stat().st_mtime,
                size=file.stat().st_size,
                identity=(file.parent.name if file.stem == "final" else file.stem),
            )
            for file in sessions_root.rglob("*.jpg")
            if file.name != "raw.jpg" and not any(p.name.startswith(".") for p in file.parents)
        ),
        key=lambda item: item.modified_at,
    )
    total = sum(item.size for item in candidates)
    removed: list[str] = []
    freed = 0
    survivors: list[_Candidate] = []
    for item in candidates:
        if item.identity not in protected and reference - item.modified_at > age_limit:
            _remove(item)
            removed.append(item.identity)
            freed += item.size
        else:
            survivors.append(item)
    for item in survivors:
        if total - freed <= policy.max_total_bytes:
            break
        if item.identity in protected:
            continue
        _remove(item)
        removed.append(item.identity)
        freed += item.size
    for directory in sorted(
        (p for p in sessions_root.rglob("*") if p.is_dir()),
        key=lambda p: len(p.parts),
        reverse=True,
    ):
        try:
            directory.rmdir()
        except OSError:
            pass
    if removed:
        logger.info(
            "rétention : %d photo(s) supprimée(s), %.1f Mo libérés",
            len(removed),
            freed / 2**20,
        )
    return removed


def _remove(candidate: _Candidate) -> None:
    logger.info("rétention : suppression de %s", candidate.path)
    candidate.path.unlink(missing_ok=True)
