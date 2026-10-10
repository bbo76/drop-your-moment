"""Destination choisie pour les photos finales, avec repli local sur la SD."""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

PHOTO_FOLDER = "photobooth"
SYSTEM_VOLUME_NAMES = {"Macintosh HD", "Recovery"}


@dataclass(frozen=True)
class StorageStatus:
    mode: str
    root: Path
    reason: str | None = None

    @property
    def label(self) -> str:
        return "Carte SD" if self.mode == "sd" else self.root.parent.name


class PhotoStorage:
    def __init__(
        self, sd_root: Path, removable_root: Path | None = None, config_dir: Path | None = None
    ) -> None:
        self.sd_root = sd_root
        self.removable_root = removable_root
        self.selection_file = (config_dir or sd_root.parent) / "photo-storage.json"
        self._selected_root = removable_root or self._load_selection()
        self._status = StorageStatus("sd", sd_root, "aucun support externe sélectionné")

    @property
    def sessions_root(self) -> Path:
        return self._status.root

    @property
    def status(self) -> StorageStatus:
        return self._status

    def refresh(self) -> StorageStatus:
        if self._selected_root is None:
            self.sd_root.mkdir(parents=True, exist_ok=True)
            self._status = StorageStatus("sd", self.sd_root)
            return self._status
        root = self._selected_root.resolve()
        if root.is_dir():
            destination = root / PHOTO_FOLDER
            try:
                if not destination.exists():
                    destination.mkdir(parents=True)
                elif not destination.is_dir():
                    raise OSError("le chemin photobooth n'est pas un dossier")
                self._probe(destination)
                self._status = StorageStatus("external", destination)
                return self._status
            except OSError:
                pass
        self.sd_root.mkdir(parents=True, exist_ok=True)
        self._status = StorageStatus("sd", self.sd_root, "support sélectionné indisponible")
        return self._status

    def select(self, root: Path | None) -> StorageStatus:
        self._selected_root = root
        self.selection_file.parent.mkdir(parents=True, exist_ok=True)
        if root is None:
            self.selection_file.unlink(missing_ok=True)
        else:
            temporary = self.selection_file.with_suffix(".tmp")
            temporary.write_text(json.dumps({"root": str(root)}), encoding="utf-8")
            os.replace(temporary, self.selection_file)
        return self.refresh()

    def available(self) -> list[Path]:
        candidates = [self.removable_root]
        sd_mount = self.sd_root.resolve()
        for base in (Path("/Volumes"), Path("/media"), Path("/mnt")):
            if base.is_dir():
                candidates.extend(
                    path
                    for path in base.iterdir()
                    if path.is_dir()
                    and not path.is_symlink()
                    and path.name not in SYSTEM_VOLUME_NAMES
                    and path.resolve() != sd_mount
                )
        return list(dict.fromkeys(path.resolve() for path in candidates if path is not None))

    def ensure_destination(self) -> Path:
        return self.refresh().root

    def _load_selection(self) -> Path | None:
        try:
            return Path(json.loads(self.selection_file.read_text(encoding="utf-8"))["root"])
        except (OSError, ValueError, KeyError, TypeError):
            return None

    @staticmethod
    def _probe(directory: Path) -> None:
        fd, name = tempfile.mkstemp(prefix=".dym-write-", dir=directory)
        try:
            os.write(fd, b"ok")
            os.fsync(fd)
        finally:
            os.close(fd)
            try:
                Path(name).unlink(missing_ok=True)
            except OSError:
                pass
