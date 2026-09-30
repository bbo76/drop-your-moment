from __future__ import annotations

import subprocess
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
        self.fail_next_wifi_connection = False

    def __call__(self, command: list[str]) -> str:
        self.commands.append(command)
        if "GENERAL.CONNECTION" in command:
            return f"{self.current_connection}\n"
        if "CONNECTIVITY" in command:
            return "full\n" if self.current_connection not in {"", "--"} else "none\n"
        if "IN-USE,SSID,SIGNAL,SECURITY" in command:
            return (
                "*:wifi-maison:74:WPA2\n:DYM-PhotoBooth:99:WPA2\n:Invites:61:\n"
                ":Atelier\\: photo:82:WPA3\n:Invites:32:\n"
            )
        if "NAME,TYPE" in command:
            return (
                "wifi-maison:802-11-wireless\ndym-hotspot:802-11-wireless\ncable:802-3-ethernet\n"
            )
        if "802-11-wireless.ssid" in command:
            ssids = {"dym-hotspot": "DYM-PhotoBooth", "netplan-wlan0": "wifi-maison"}
            return f"{ssids.get(command[-1], command[-1])}\n"
        if "wifi" in command and "connect" in command:
            if self.fail_next_wifi_connection:
                self.fail_next_wifi_connection = False
                raise subprocess.CalledProcessError(10, command)
            self.current_connection = command[command.index("connect") + 1]
            self.active = False
            return ""
        if "delete" in command:
            return ""
        if "up" in command:
            self.current_connection = command[command.index("id") + 1]
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
    assert network.commands.count(["/usr/bin/nmcli", "connection", "up", "id", "dym-hotspot"]) == 2


def test_double_activation_conserve_la_connexion_precedente(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    hotspot, network = configured_hotspot(tmp_path, access)

    hotspot.activate()
    hotspot.activate()
    hotspot.deactivate()

    assert network.current_connection == "wifi-maison"


def test_desactivation_coupe_le_reseau_et_invalide_les_acces(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    hotspot, network = configured_hotspot(tmp_path, access)
    hotspot.activate()

    hotspot.deactivate()

    assert not hotspot.desired_active
    assert not hotspot.active()
    assert access.code is None
    assert network.current_connection == "wifi-maison"
    assert ["/usr/bin/nmcli", "connection", "up", "id", "wifi-maison"] in network.commands


def test_scan_wifi_fusionne_trie_et_decoupe_les_ssid_echappes(tmp_path: Path) -> None:
    hotspot, _ = configured_hotspot(tmp_path, OperatorAccess(tmp_path))

    networks = hotspot.scan_wifi()

    assert [(item.ssid, item.signal, item.security, item.profile) for item in networks] == [
        ("Atelier: photo", 82, "WPA3", None),
        ("wifi-maison", 74, "WPA2", "wifi-maison"),
        ("Invites", 61, "Ouvert", None),
    ]


def test_connexion_client_coupe_le_hotspot_et_ne_persiste_pas_le_secret(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    hotspot, network = configured_hotspot(tmp_path, access)
    hotspot.activate()

    hotspot.connect_wifi("Atelier", "secret-client")

    assert hotspot.wifi_status() == {
        "available": True,
        "mode": "client",
        "ssid": "Atelier",
        "connectivity": "full",
    }
    assert access.code is None
    assert "secret-client" not in hotspot.state_path.read_text()


def test_statut_wifi_affiche_le_ssid_plutot_que_le_nom_du_profil(tmp_path: Path) -> None:
    hotspot, network = configured_hotspot(tmp_path, OperatorAccess(tmp_path))
    network.current_connection = "netplan-wlan0"

    assert hotspot.wifi_status()["ssid"] == "wifi-maison"


def test_echec_de_connexion_restaure_le_hotspot(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    hotspot, network = configured_hotspot(tmp_path, access)
    hotspot.activate()
    network.fail_next_wifi_connection = True

    try:
        hotspot.connect_wifi("Injoignable", "secret-client")
    except subprocess.CalledProcessError:
        pass

    assert hotspot.active()
    assert hotspot.desired_active
    assert access.code is not None


def test_profils_reconnexion_reseau_masque_et_oubli(tmp_path: Path) -> None:
    hotspot, network = configured_hotspot(tmp_path, OperatorAccess(tmp_path))

    assert [(profile.name, profile.ssid) for profile in hotspot.wifi_profiles()] == [
        ("wifi-maison", "wifi-maison")
    ]
    hotspot.connect_wifi("wifi-maison", profile="wifi-maison")
    hotspot.connect_wifi("Secret", "mot-de-passe", hidden=True)
    hotspot.forget_wifi("wifi-maison")

    assert ["/usr/bin/nmcli", "connection", "delete", "id", "wifi-maison"] in network.commands
    hidden_command = next(command for command in network.commands if "Secret" in command)
    assert hidden_command[-2:] == ["hidden", "yes"]


def test_deconnexion_wifi_utilise_network_manager(tmp_path: Path) -> None:
    hotspot, network = configured_hotspot(tmp_path, OperatorAccess(tmp_path))

    hotspot.disconnect_wifi()

    assert ["/usr/bin/nmcli", "device", "disconnect", "wlan0"] in network.commands


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


def test_api_wifi_ne_renvoie_jamais_le_mot_de_passe(
    kiosk: TestClient, runtime: Runtime, tmp_path: Path
) -> None:
    runtime.hotspot, _ = configured_hotspot(tmp_path, runtime.operator_access)
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 204

    networks = kiosk.get("/api/maintenance/wifi/scan")
    profiles = kiosk.get("/api/maintenance/wifi/profiles")
    connected = kiosk.post(
        "/api/maintenance/wifi/connect",
        json={"ssid": "Atelier", "password": "secret-client"},
    )

    assert networks.status_code == 200
    assert networks.json()[0]["ssid"] == "Atelier: photo"
    assert profiles.json() == [{"name": "wifi-maison", "ssid": "wifi-maison"}]
    assert connected.status_code == 200
    assert connected.json()["ssid"] == "Atelier"
    assert "secret-client" not in connected.text
    assert (
        kiosk.post("/api/maintenance/wifi/forget", json={"profile": "wifi-maison"}).status_code
        == 204
    )


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
