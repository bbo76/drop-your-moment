"""Maintenance locale : protégée, courte et limitée aux gestes de soirée."""

from __future__ import annotations

from fastapi.testclient import TestClient

from dropyourmoment.runtime import Runtime


def _unlock(kiosk: TestClient, pin: str = "2580") -> None:
    assert kiosk.post("/api/maintenance/unlock", json={"pin": pin}).status_code == 204


def test_le_statut_est_protege_par_pin(kiosk: TestClient) -> None:
    assert kiosk.get("/api/maintenance/status").status_code == 401
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "0000"}).status_code == 401

    _unlock(kiosk)

    assert kiosk.get("/api/maintenance/status").status_code == 200


def test_la_fermeture_invalide_la_session(kiosk: TestClient) -> None:
    _unlock(kiosk)
    assert kiosk.post("/api/maintenance/lock").status_code == 204

    assert kiosk.get("/api/maintenance/status").status_code == 401


def test_la_session_expire_meme_si_le_frontend_continue_de_sonder(
    kiosk: TestClient, runtime: Runtime
) -> None:
    runtime.settings.maintenance_session_timeout_s = 0
    _unlock(kiosk)

    assert kiosk.get("/api/maintenance/status").status_code == 401


def test_les_reglages_utiles_s_appliquent_au_kiosque(kiosk: TestClient) -> None:
    _unlock(kiosk)

    response = kiosk.put(
        "/api/maintenance/settings",
        json={
            "copies_per_print": 2,
            "screen_flash_enabled": False,
            "accent_color": "#8b5cf6",
            "launch_font": "prestigious",
        },
    )

    assert response.status_code == 200
    assert kiosk.get("/api/event").json()["screen_flash_enabled"] is False
    assert kiosk.get("/api/event").json()["accent_color"] == "#8b5cf6"
    assert kiosk.get("/api/event").json()["launch_font"] == "prestigious"


def test_le_changement_de_cartouche_memorise_la_capacite(kiosk: TestClient) -> None:
    _unlock(kiosk)

    response = kiosk.post("/api/maintenance/cartridge", json={"capacity": 54})

    assert response.status_code == 200
    assert response.json()["cartridge_capacity"] == 54
    assert response.json()["prints_since_reset"] == 0


def test_une_capacite_inconnue_est_refusee(kiosk: TestClient) -> None:
    _unlock(kiosk)

    assert kiosk.post("/api/maintenance/cartridge", json={"capacity": 72}).status_code == 422


def test_l_operateur_peut_liberer_la_borne(kiosk: TestClient, runtime: Runtime) -> None:
    kiosk.post("/api/session")
    _unlock(kiosk)

    response = kiosk.post("/api/maintenance/home")

    assert response.json()["state"] == "idle"
    assert runtime.machine.session is None


def test_la_galerie_locale_est_protegee_et_liste_les_photos(kiosk: TestClient) -> None:
    assert kiosk.get("/api/maintenance/gallery").status_code == 401

    _unlock(kiosk)
    response = kiosk.get("/api/maintenance/gallery")

    assert response.status_code == 200
    assert response.json() == {"total": 0, "entries": []}


def test_les_routes_de_maintenance_ne_sont_pas_sur_le_portail_lan(
    admin: TestClient,
) -> None:
    assert admin.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 404
