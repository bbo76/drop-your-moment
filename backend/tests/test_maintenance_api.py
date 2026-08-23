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
            "default_shot_timer_seconds": 10,
            "screen_flash_enabled": False,
            "accent_color": "#8b5cf6",
            "launch_font": "prestigious",
        },
    )

    assert response.status_code == 200
    assert kiosk.get("/api/event").json()["default_shot_timer_seconds"] == 10
    assert kiosk.get("/api/event").json()["screen_flash_enabled"] is False
    assert kiosk.get("/api/event").json()["accent_color"] == "#8b5cf6"
    assert kiosk.get("/api/event").json()["launch_font"] == "prestigious"


def test_le_stock_papier_libre_est_memorise(kiosk: TestClient) -> None:
    _unlock(kiosk)

    response = kiosk.post("/api/maintenance/paper-stock", json={"capacity": 137})

    assert response.status_code == 200
    assert response.json()["paper_stock_capacity"] == 137
    assert response.json()["prints_since_stock_set"] == 0


def test_un_stock_hors_limites_est_refuse(kiosk: TestClient) -> None:
    _unlock(kiosk)

    assert kiosk.post("/api/maintenance/paper-stock", json={"capacity": 0}).status_code == 422
    assert kiosk.post("/api/maintenance/paper-stock", json={"capacity": 10_000}).status_code == 422


def test_le_remplacement_de_cassette_d_encre_est_memorise(kiosk: TestClient) -> None:
    _unlock(kiosk)

    response = kiosk.post("/api/maintenance/ink/replace", json={"capacity": 54})

    assert response.status_code == 200
    assert response.json()["cartridge_capacity"] == 54
    assert response.json()["prints_since_reset"] == 0


def test_le_rechargement_du_bac_est_memorise(kiosk: TestClient, runtime: Runtime) -> None:
    runtime.counters.record_prints(18)
    _unlock(kiosk)

    response = kiosk.post("/api/maintenance/cassette/reload")

    assert response.status_code == 200
    assert response.json()["cassette_capacity"] == 18
    assert response.json()["prints_since_cassette_reload"] == 0
    assert response.json()["prints_since_reset"] == 18


def test_la_maintenance_locale_ne_peut_pas_liberer_la_borne(kiosk: TestClient) -> None:
    _unlock(kiosk)

    assert kiosk.post("/api/maintenance/home").status_code == 404


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
