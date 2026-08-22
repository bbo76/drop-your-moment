"""Emplacement des fichiers d'une session.

Un répertoire par session plutôt qu'un préfixe dans un dossier commun : supprimer une
session ou en archiver le lot devient une opération sur un dossier, et la politique de
rétention n'a pas à filtrer des noms de fichiers.
"""

from __future__ import annotations

from pathlib import Path

RAW_NAME = "raw.jpg"
FINAL_NAME = "final.jpg"


def session_dir(sessions_root: Path, session_id: str) -> Path:
    return sessions_root / session_id


def raw_path(sessions_root: Path, session_id: str) -> Path:
    return session_dir(sessions_root, session_id) / RAW_NAME


def final_path(sessions_root: Path, session_id: str) -> Path:
    return session_dir(sessions_root, session_id) / FINAL_NAME
