"""Actions d'alimentation strictement bornées pour la borne Raspberry Pi."""

from __future__ import annotations

import logging
import subprocess
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

PowerAction = Literal["reboot", "poweroff"]
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PendingPowerAction:
    action: PowerAction
    execute_at: float


def _is_raspberry_pi_systemd() -> bool:
    try:
        model = Path("/proc/device-tree/model").read_text(errors="ignore")
    except OSError:
        return False
    return "Raspberry Pi" in model and Path("/run/systemd/system").is_dir()


def _run_systemctl(action: PowerAction) -> None:
    subprocess.run(
        ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", action],
        check=True,
        timeout=10,
    )


@dataclass
class SystemPower:
    """Exécuteur injectable : les tests ne lancent jamais de commande système."""

    executor: Callable[[PowerAction], None] = _run_systemctl
    available: bool = field(
        default_factory=lambda: (
            _is_raspberry_pi_systemd()
            and Path("/usr/bin/systemctl").is_file()
            and Path("/usr/bin/sudo").is_file()
        )
    )
    _pending: PendingPowerAction | None = field(default=None, init=False, repr=False)
    _timer: threading.Timer | None = field(default=None, init=False, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)

    def request(self, action: PowerAction) -> None:
        if not self.available:
            raise RuntimeError("action disponible uniquement sur Raspberry Pi avec systemd")
        self.cancel_pending()
        logger.warning("action système demandée depuis la maintenance locale : %s", action)
        self.executor(action)

    def schedule(self, action: PowerAction, delay_seconds: float) -> PendingPowerAction:
        if not self.available:
            raise RuntimeError("action disponible uniquement sur Raspberry Pi avec systemd")
        with self._lock:
            if self._pending is not None:
                raise RuntimeError("une action d’alimentation est déjà programmée")
            pending = PendingPowerAction(action, time.time() + delay_seconds)
            timer = threading.Timer(delay_seconds, self._execute_scheduled, args=(pending,))
            timer.daemon = True
            self._pending = pending
            self._timer = timer
            timer.start()
        logger.warning("action système programmée dans %.0f s : %s", delay_seconds, action)
        return pending

    @property
    def pending(self) -> PendingPowerAction | None:
        with self._lock:
            return self._pending

    def cancel_pending(self) -> None:
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
            self._timer = None
            self._pending = None

    def _execute_scheduled(self, pending: PendingPowerAction) -> None:
        with self._lock:
            if self._pending != pending:
                return
            self._pending = None
            self._timer = None
        try:
            self.executor(pending.action)
        except (OSError, subprocess.SubprocessError):
            logger.exception("échec de l’action système programmée : %s", pending.action)
