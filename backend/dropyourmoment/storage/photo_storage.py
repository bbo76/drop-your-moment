"""Destination choisie pour les photos finales, avec repli local sur la SD."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path

PHOTO_FOLDER = "photobooth"
SYSTEM_VOLUME_NAMES = {"Macintosh HD", "Recovery"}
logger = logging.getLogger(__name__)


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
        self._lock = threading.RLock()
        self._writes_in_progress = 0

    @property
    def sessions_root(self) -> Path:
        return self._status.root

    @property
    def status(self) -> StorageStatus:
        return self._status

    @property
    def selected_root(self) -> Path | None:
        return self._selected_root.resolve() if self._selected_root is not None else None

    def refresh(self) -> StorageStatus:
        with self._lock:
            return self._refresh()

    def _refresh(self) -> StorageStatus:
        previous = self._status
        if self._selected_root is None:
            self.sd_root.mkdir(parents=True, exist_ok=True)
            self._status = StorageStatus("sd", self.sd_root)
            if previous != self._status:
                logger.info("destination photo active : Carte SD")
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
                if previous != self._status:
                    logger.info("destination photo active : %s", self._status.label)
                return self._status
            except OSError as exc:
                reason = f"support externe inaccessible ({exc})"
        else:
            reason = "support sélectionné indisponible"
        self.sd_root.mkdir(parents=True, exist_ok=True)
        self._status = StorageStatus("sd", self.sd_root, reason)
        if previous != self._status:
            # La raison peut contenir un OSError spécifique au montage; logger une seule
            # transition évite le bruit des sondes répétées et préserve le diagnostic.
            logger.warning("repli du stockage photo sur la SD : %s", reason)
        return self._status

    def select(self, root: Path | None) -> StorageStatus:
        with self._lock:
            if self._writes_in_progress:
                raise RuntimeError("une écriture photo est en cours")
            old_root = self._selected_root
            self._selected_root = root
            self.selection_file.parent.mkdir(parents=True, exist_ok=True)
            if root is None:
                self.selection_file.unlink(missing_ok=True)
            else:
                self._persist_selection(root)
            status = self._refresh()
            if root is not None and status.mode != "external":
                self._selected_root = old_root
                self._persist_selection(
                    old_root
                ) if old_root is not None else self.selection_file.unlink(missing_ok=True)
                self._refresh()
            return status

    def prepare(self, root: Path | None = None) -> StorageStatus:
        """Prépare un volume sans formatage ni modification de ses autres fichiers."""
        with self._lock:
            if self._writes_in_progress:
                raise RuntimeError("une écriture photo est en cours")
            target = root or self._selected_root
            if target is None:
                self.sd_root.mkdir(parents=True, exist_ok=True)
                self._probe(self.sd_root)
                return self._refresh()
            target = target.resolve()
            if not target.is_dir():
                raise OSError("support externe indisponible")
            destination = target / PHOTO_FOLDER
            destination.mkdir(parents=True, exist_ok=True)
            self._probe(destination)
            self._selected_root = target
            self._persist_selection(target)
            logger.info("support photo préparé : %s", target.name)
            status = self._refresh()
            if status.mode != "external":
                raise OSError(status.reason or "support externe inaccessible")
            return status

    def _persist_selection(self, root: Path) -> None:
        self.selection_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.selection_file.with_suffix(".tmp")
        temporary.write_text(json.dumps({"root": str(root)}), encoding="utf-8")
        os.replace(temporary, self.selection_file)

    def begin_write(self) -> None:
        with self._lock:
            self._writes_in_progress += 1

    def end_write(self) -> None:
        with self._lock:
            self._writes_in_progress = max(0, self._writes_in_progress - 1)

    @property
    def writes_in_progress(self) -> int:
        with self._lock:
            return self._writes_in_progress

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
