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


@dataclass(frozen=True)
class WifiNetwork:
    ssid: str
    signal: int
    security: str
    active: bool
    profile: str | None


@dataclass(frozen=True)
class WifiProfile:
    name: str
    ssid: str


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
        return self._state().get("active") is True

    @property
    def previous_connection(self) -> str | None:
        value = self._state().get("previous_connection")
        valid = isinstance(value, str) and value not in {"", "--", self.connection}
        return value if valid else None

    @property
    def secret(self) -> str | None:
        try:
            value = self.secret_file.read_text().strip()
        except OSError:
            return None
        return value or None

    def activate(self) -> None:
        self._require_configured()
        if self.active():
            self.operator_access.activate()
            self._save(True, self.previous_connection)
            return
        previous_connection = self.runner(
            ["/usr/bin/nmcli", "-g", "GENERAL.CONNECTION", "device", "show", self.interface]
        ).strip()
        self.runner(["/usr/bin/nmcli", "connection", "up", "id", self.connection])
        self.operator_access.activate()
        self._save(True, previous_connection)

    def deactivate(self) -> None:
        previous_connection = self.previous_connection
        if self.active():
            self.runner(["/usr/bin/nmcli", "connection", "down", "id", self.connection])
        self.operator_access.deactivate()
        self._save(False)
        if previous_connection:
            self.runner(["/usr/bin/nmcli", "connection", "up", "id", previous_connection])

    def restore(self) -> None:
        if not self.desired_active:
            return
        self._require_configured()
        self.runner(["/usr/bin/nmcli", "connection", "up", "id", self.connection])
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

    def wifi_status(self) -> dict[str, object]:
        if not self.available:
            return {"available": False, "mode": "offline", "ssid": None, "connectivity": "unknown"}
        try:
            connection = self.runner(
                ["/usr/bin/nmcli", "-g", "GENERAL.CONNECTION", "device", "show", self.interface]
            ).strip()
            connectivity = self.runner(
                ["/usr/bin/nmcli", "-t", "-f", "CONNECTIVITY", "general"]
            ).strip()
        except (OSError, subprocess.SubprocessError):
            return {"available": True, "mode": "offline", "ssid": None, "connectivity": "unknown"}
        active = connection not in {"", "--"}
        ssid = self.ssid if connection == self.connection else None
        if active and ssid is None:
            try:
                ssid = self.runner(
                    [
                        "/usr/bin/nmcli",
                        "-g",
                        "802-11-wireless.ssid",
                        "connection",
                        "show",
                        "id",
                        connection,
                    ]
                ).strip() or None
            except (OSError, subprocess.SubprocessError):
                pass
        return {
            "available": True,
            "mode": (
                "hotspot" if connection == self.connection else "client" if active else "offline"
            ),
            "ssid": ssid,
            "connectivity": (
                connectivity if connectivity in {"full", "limited", "portal", "none"} else "unknown"
            ),
        }

    def scan_wifi(self) -> list[WifiNetwork]:
        if not self.available:
            return []
        output = self.runner(
            [
                "/usr/bin/nmcli",
                "-t",
                "-f",
                "IN-USE,SSID,SIGNAL,SECURITY",
                "device",
                "wifi",
                "list",
                "ifname",
                self.interface,
                "--rescan",
                "yes",
            ]
        )
        profiles = {profile.ssid: profile.name for profile in self.wifi_profiles()}
        by_ssid: dict[str, WifiNetwork] = {}
        for line in output.splitlines():
            fields = _split_nmcli(line)
            if len(fields) != 4 or not fields[1] or fields[1] == self.ssid:
                continue
            try:
                signal = max(0, min(100, int(fields[2])))
            except ValueError:
                continue
            network = WifiNetwork(
                fields[1],
                signal,
                fields[3] or "Ouvert",
                fields[0] == "*",
                profiles.get(fields[1]),
            )
            previous = by_ssid.get(network.ssid)
            if previous is None or network.signal > previous.signal:
                by_ssid[network.ssid] = network
        return sorted(
            by_ssid.values(), key=lambda network: (-network.signal, network.ssid.casefold())
        )

    def wifi_profiles(self) -> list[WifiProfile]:
        if not self.available:
            return []
        output = self.runner(["/usr/bin/nmcli", "-t", "-f", "NAME,TYPE", "connection", "show"])
        profiles: list[WifiProfile] = []
        for line in output.splitlines():
            fields = _split_nmcli(line)
            if (
                len(fields) != 2
                or fields[0] == self.connection
                or fields[1] not in {"802-11-wireless", "wifi"}
            ):
                continue
            ssid = self.runner(
                [
                    "/usr/bin/nmcli",
                    "-g",
                    "802-11-wireless.ssid",
                    "connection",
                    "show",
                    "id",
                    fields[0],
                ]
            ).strip()
            if ssid:
                profiles.append(WifiProfile(fields[0], ssid))
        return sorted(profiles, key=lambda profile: profile.ssid.casefold())

    def connect_wifi(
        self,
        ssid: str,
        password: str | None = None,
        *,
        profile: str | None = None,
        hidden: bool = False,
    ) -> None:
        if not self.available:
            raise RuntimeError("Wi-Fi indisponible sur cette borne")
        hotspot_was_active = self.active()
        try:
            if hotspot_was_active:
                self.deactivate()
            command = (
                [
                    "/usr/bin/nmcli",
                    "--wait",
                    "20",
                    "connection",
                    "up",
                    "id",
                    profile,
                    "ifname",
                    self.interface,
                ]
                if profile
                else [
                    "/usr/bin/nmcli",
                    "--wait",
                    "20",
                    "device",
                    "wifi",
                    "connect",
                    ssid,
                    "ifname",
                    self.interface,
                ]
            )
            if password and not profile:
                command.extend(["password", password])
            if hidden and not profile:
                command.extend(["hidden", "yes"])
            self.runner(command)
            self._save(False)
        except Exception:
            if hotspot_was_active:
                self.activate()
            raise

    def disconnect_wifi(self) -> None:
        if not self.available:
            raise RuntimeError("Wi-Fi indisponible sur cette borne")
        self.runner(["/usr/bin/nmcli", "device", "disconnect", self.interface])

    def forget_wifi(self, profile: str) -> None:
        if not self.available:
            raise RuntimeError("Wi-Fi indisponible sur cette borne")
        self.runner(["/usr/bin/nmcli", "connection", "delete", "id", profile])

    def qr_png(self, content: str) -> bytes:
        output = BytesIO()
        qrcode.make(content).save(output, format="PNG")
        return output.getvalue()

    def _require_configured(self) -> None:
        if not self.available or self.secret is None:
            raise RuntimeError("hotspot non configuré sur cette borne")

    def _state(self) -> dict[str, object]:
        try:
            value = json.loads(self.state_path.read_text())
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return {}

    def _save(self, active: bool, previous_connection: str | None = None) -> None:
        state: dict[str, object] = {"active": active}
        if previous_connection not in {None, "", "--", self.connection}:
            state["previous_connection"] = previous_connection
        write_atomic(self.state_path, json.dumps(state).encode())


def _split_nmcli(line: str) -> list[str]:
    """Découpe la sortie terse de nmcli sans casser les SSID contenant ':' ou '\\'."""
    fields = [""]
    escaped = False
    for character in line:
        if escaped:
            fields[-1] += character
            escaped = False
        elif character == "\\":
            escaped = True
        elif character == ":":
            fields.append("")
        else:
            fields[-1] += character
    if escaped:
        fields[-1] += "\\"
    return fields
