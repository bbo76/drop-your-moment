"""Actions d'alimentation strictement bornées pour la borne Raspberry Pi."""

from __future__ import annotations

import logging
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

PowerAction = Literal["reboot", "poweroff"]
logger = logging.getLogger(__name__)


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
        default_factory=lambda: _is_raspberry_pi_systemd()
        and Path("/usr/bin/systemctl").is_file()
        and Path("/usr/bin/sudo").is_file()
    )

    def request(self, action: PowerAction) -> None:
        if not self.available:
            raise RuntimeError("action disponible uniquement sur Raspberry Pi avec systemd")
        logger.warning("action système demandée depuis la maintenance locale : %s", action)
        self.executor(action)
