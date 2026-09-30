from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from dropyourmoment.hotspot import Hotspot, development_portal_url
from dropyourmoment.operator_access import OperatorAccess
from dropyourmoment.runtime import Runtime
from dropyourmoment.system_power import SystemPower


class FakeNetwork:
    def __init__(self) -> None:
        self.active = False
        self.current_connection = "wifi-maison"
        self.commands: list[list[str]] = []

    def __call__(self, command: list[str]) -> str:
        self.commands.append(command)
        if "GENERAL.CONNECTION" in command:
            return f"{self.current_connection}\n"
        if "up" in command:
            self.current_connection = command[-1]
            self.active = self.current_connection == "dym-hotspot"
        elif "down" in command:
            self.active = False
            self.current_connection = "--"
        elif "GENERAL.STATE" in command:
            return "activated\n" if self.active else "deactivated\n"
        elif "neigh" in command:
            return "10.42.0.2 dev wlan0 REACHABLE\n10.42.0.3 dev wlan0 STALE\n"
        return ""


def test_url_de_developpement_utilise_l_ip_de_la_route(monkeypatch) -> None:
    class FakeSocket:
        def connect(self, address: tuple[str, int]) -> None:
            assert address == ("192.0.2.1", 9)

        def getsockname(self) -> tuple[str, int]:
            return ("192.168.1.42", 12345)

        def close(self) -> None:
            pass

    monkeypatch.setattr("dropyourmoment.hotspot.socket.socket", lambda *args: FakeSocket())

    assert development_portal_url(8001) == "http://192.168.1.42:8001/"


def configured_hotspot(tmp_path: Path, access: OperatorAccess) -> tuple[Hotspot, FakeNetwork]:
    secret = tmp_path / "hotspot.secret"
    secret.write_text("secret-installation")
    network = FakeNetwork()
    return (
        Hotspot(tmp_path, secret, access, runner=network, available=True),
        network,
    )


def test_activation_persiste_et_restaure_le_hotspot(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    hotspot, network = configured_hotspot(tmp_path, access)

    hotspot.activate()
    network.active = False
    hotspot.restore()

    assert hotspot.desired_active
    assert hotspot.active()
    assert access.code is not None
    assert (
        network.commands.count(["sudo", "/usr/bin/nmcli", "connection", "up", "id", "dym-hotspot"])
        == 2
    )


def test_desactivation_coupe_le_reseau_et_invalide_les_acces(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    hotspot, network = configured_hotspot(tmp_path, access)
    hotspot.activate()

    hotspot.deactivate()

    assert not hotspot.desired_active
    assert not hotspot.active()
    assert access.code is None
    assert network.current_connection == "wifi-maison"
    assert [
        "sudo",
        "/usr/bin/nmcli",
        "connection",
        "up",
        "id",
        "wifi-maison",
    ] in network.commands


def test_api_locale_pilote_et_compte_les_clients(
    kiosk: TestClient, runtime: Runtime, tmp_path: Path
) -> None:
    runtime.hotspot, _ = configured_hotspot(tmp_path, runtime.operator_access)
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 204

    response = kiosk.post("/api/maintenance/hotspot/activate")

    assert response.status_code == 200
    assert response.json()["active"] is True
    assert response.json()["client_count"] == 2
    assert len(response.json()["admin_code"]) == 6


def test_qr_de_developpement_utilisent_l_adresse_du_poste(
    kiosk: TestClient, runtime: Runtime
) -> None:
    runtime.hotspot.available = False
    runtime.settings.hotspot_development_portal_url = "http://192.168.1.42:8001/"
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 204

    status = kiosk.get("/api/maintenance/status").json()["hotspot"]
    qr = kiosk.get("/api/maintenance/hotspot/qr/portal")

    assert status["portal_url"] == "http://192.168.1.42:8001/"
    assert status["secret"] == "DYM-PhotoBooth-Dev"
    assert qr.status_code == 200
    assert qr.headers["content-type"] == "image/png"
    assert qr.content.startswith(b"\x89PNG")


def test_arret_volontaire_desactive_le_hotspot_avant_poweroff(
    kiosk: TestClient, runtime: Runtime, tmp_path: Path
) -> None:
    runtime.hotspot, network = configured_hotspot(tmp_path, runtime.operator_access)
    runtime.hotspot.activate()
    calls: list[str] = []
    runtime.system_power = SystemPower(executor=calls.append, available=True)
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 204

    assert kiosk.post("/api/maintenance/power/poweroff").status_code == 202

    down_index = next(i for i, command in enumerate(network.commands) if "down" in command)
    assert down_index >= 0
    assert calls == ["poweroff"]
    assert runtime.operator_access.code is None
