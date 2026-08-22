"""L'isolation kiosque / administration ne tient qu'à deux adresses de bind.

Le kiosque écoute sur `127.0.0.1`, l'administration sur `0.0.0.0`. Il n'y a pas de
frontière de process entre les deux — c'est un choix, et c'est ce qui permet à l'admin de
modifier une configuration que le kiosque relit aussitôt.

Le revers, c'est qu'une garantie de sécurité repose ici sur deux valeurs de configuration.
Elle se perdrait en silence : personne ne verrait `kiosk_host` passer à `0.0.0.0`, ni une
route d'admin fuiter vers la socket du kiosque. C'est exactement le scénario qui a fait
reporter Docker, qui réécrit précisément ces adresses.

Trois angles, parce qu'aucun ne couvre seul :

1. les valeurs par défaut, qui tombent si quelqu'un les change ;
2. les tables de routage des deux applications, qui tombent si une route fuit ;
3. une vraie socket, qui tombe si le bind ne fait pas ce que la configuration annonce.
"""

from __future__ import annotations

import socket
from urllib.parse import urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from dropyourmoment.config import Settings


def test_les_adresses_de_bind_portent_l_isolation() -> None:
    """Le kiosque sur la boucle locale, l'administration sur le LAN.

    Un test délibérément bête : ces quatre valeurs *sont* la garantie, et rien d'autre
    dans le dépôt n'échouerait si l'une changeait.
    """
    settings = Settings()

    assert settings.kiosk_host == "127.0.0.1", "le kiosque ne doit pas sortir de la boucle locale"
    assert settings.admin_host == "0.0.0.0", "l'admin doit rester joignable depuis le LAN"
    assert (settings.kiosk_port, settings.admin_port) == (8000, 8001)


def test_le_kiosque_ne_sert_pas_les_routes_d_administration(kiosk: TestClient) -> None:
    """Même process, mais deux tables de routage disjointes.

    Sans cela, l'isolation par adresse de bind ne servirait à rien : le kiosque étant
    aussi servi en développement derrière le proxy Vite, une route d'admin montée par
    erreur sur la mauvaise application deviendrait joignable par un chemin inattendu.
    """
    assert kiosk.get("/admin/system/health").status_code == 404


def test_l_administration_ne_sert_pas_l_api_du_kiosque(admin: TestClient) -> None:
    """Réciproque : le déclenchement d'une capture n'appartient pas à la socket LAN."""
    assert admin.get("/api/status").status_code == 404
    assert admin.post("/api/session").status_code == 404


def test_le_kiosque_n_est_pas_joignable_hors_boucle_locale(kiosk_url: str) -> None:
    """Le seul angle qui vérifie le bind lui-même, et non ce qu'on croit avoir configuré."""
    address = _non_loopback_address()
    if address is None:
        pytest.skip("aucune adresse non-loopback sur cette machine")

    # Témoin : sans lui, un serveur qui n'aurait pas démarré ferait passer le test.
    assert httpx.get(f"{kiosk_url}/api/status", timeout=5.0).status_code == 200

    port = urlsplit(kiosk_url).port
    with pytest.raises(httpx.TransportError):
        # Connexion refusée le plus souvent, mais un pare-feu qui jette le paquet donnerait
        # un timeout : les deux sont des `TransportError`, et les deux disent la même chose.
        httpx.get(f"http://{address}:{port}/api/status", timeout=2.0)


def _non_loopback_address() -> str | None:
    """Adresse LAN de la machine, obtenue sans émettre le moindre paquet.

    `connect()` sur un socket UDP ne fait qu'attribuer une route locale. 192.0.2.1 est dans
    TEST-NET-1 (RFC 5737), réservé à la documentation : jamais joignable, donc jamais de
    trafic réel — ce qu'un test n'a pas à produire.

    Rend `None` sur une machine sans interface réseau, cas d'une CI conteneurisée.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("192.0.2.1", 1))
            address: str = probe.getsockname()[0]
        except OSError:
            return None
    return None if address.startswith("127.") else address
