"""Pilotage minimal du hotspot NetworkManager préparé par le script d'installation."""

from __future__ import annotations

import json
import shutil
import socket
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path

import qrcode

from dropyourmoment.operator_access import OperatorAccess
from dropyourmoment.storage.atomic import write_atomic

CommandRunner = Callable[[list[str]], str]


def _run(command: list[str]) -> str:
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout


def development_portal_url(port: int, override: str | None = None) -> str:
    if override:
        return override
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # UDP ne contacte pas cette adresse réservée : connect() demande seulement au
        # noyau quelle interface il utiliserait pour sortir sur le réseau local.
        sock.connect(("192.0.2.1", 9))
        address = sock.getsockname()[0]
    except OSError:
        address = "127.0.0.1"
    finally:
        sock.close()
    return f"http://{address}:{port}/"


@dataclass
class Hotspot:
    data_dir: Path
    secret_file: Path
    operator_access: OperatorAccess
    ssid: str = "DYM-PhotoBooth"
    connection: str = "dym-hotspot"
    interface: str = "wlan0"
    portal_url: str = "http://10.42.0.1:8001/"
    runner: CommandRunner = field(default=_run, repr=False)
    available: bool = field(default_factory=lambda: shutil.which("nmcli") is not None)

    @property
    def state_path(self) -> Path:
        return self.data_dir / "hotspot.json"

    @property
    def desired_active(self) -> bool:
        try:
            return json.loads(self.state_path.read_text()).get("active") is True
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return False

    @property
    def secret(self) -> str | None:
        try:
            value = self.secret_file.read_text().strip()
        except OSError:
            return None
        return value or None

    def activate(self) -> None:
        self._require_configured()
        self.runner(["sudo", "/usr/bin/nmcli", "connection", "up", "id", self.connection])
        self.operator_access.activate()
        self._save(True)

    def deactivate(self) -> None:
        if self.active():
            self.runner(["sudo", "/usr/bin/nmcli", "connection", "down", "id", self.connection])
        self.operator_access.deactivate()
        self._save(False)

    def restore(self) -> None:
        if not self.desired_active:
            return
        self._require_configured()
        self.runner(["sudo", "/usr/bin/nmcli", "connection", "up", "id", self.connection])
        self.operator_access.activate()

    def active(self) -> bool:
        if not self.available:
            return False
        try:
            output = self.runner(
                ["/usr/bin/nmcli", "-g", "GENERAL.STATE", "connection", "show", self.connection]
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return output.strip().startswith("activated")

    def client_count(self) -> int:
        if not self.active():
            return 0
        try:
            output = self.runner(["/usr/sbin/ip", "neigh", "show", "dev", self.interface])
        except (OSError, subprocess.SubprocessError):
            return 0
        return sum(
            "FAILED" not in line and "INCOMPLETE" not in line for line in output.splitlines()
        )

    def qr_png(self, content: str) -> bytes:
        output = BytesIO()
        qrcode.make(content).save(output, format="PNG")
        return output.getvalue()

    def _require_configured(self) -> None:
        if not self.available or self.secret is None:
            raise RuntimeError("hotspot non configuré sur cette borne")

    def _save(self, active: bool) -> None:
        write_atomic(self.state_path, json.dumps({"active": active}).encode())
