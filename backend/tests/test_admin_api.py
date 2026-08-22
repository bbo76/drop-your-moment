"""API du portail d'administration.

Le fil conducteur : ce que l'opérateur modifie ici doit être vu par le kiosque sans
redémarrage. C'est la raison d'être du process unique à deux sockets, et jusqu'à ce jalon
`Runtime.reload_event()` n'avait aucun appelant — donc rien ne le vérifiait.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from dropyourmoment.core.event_config import CONFIG_FILENAME
from dropyourmoment.runtime import Runtime


def test_lecture_de_la_configuration_active(admin: TestClient) -> None:
    body = admin.get("/admin/event-config").json()

    assert body["event_name"] == "Événement"
    assert body["available_filters"] == ["original", "bw", "sepia"]
    assert body["copies_per_print"] == 1


def test_aller_retour_de_la_configuration(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Mariage Camille & Théo"
    config["available_filters"] = ["original", "bw"]
    config["copies_per_print"] = 2

    assert admin.put("/admin/event-config", json=config).status_code == 200

    relu = admin.get("/admin/event-config").json()
    assert relu["event_name"] == "Mariage Camille & Théo"
    assert relu["available_filters"] == ["original", "bw"]
    assert relu["copies_per_print"] == 2


def test_le_kiosque_voit_le_changement_sans_redemarrage(
    admin: TestClient, kiosk: TestClient
) -> None:
    """Le test qui justifie toute l'architecture à un process et deux sockets.

    Les deux clients partagent le même `Runtime` — exactement comme les deux serveurs en
    production. Deux process séparés auraient laissé le kiosque sur son ancienne
    configuration jusqu'au redémarrage, sans qu'aucun test ne le voie.
    """
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Anniversaire de Lou"
    config["available_filters"] = ["bw"]
    admin.put("/admin/event-config", json=config)

    vu_par_le_kiosque = kiosk.get("/api/event").json()

    assert vu_par_le_kiosque["event_name"] == "Anniversaire de Lou"
    assert vu_par_le_kiosque["available_filters"] == ["bw"]


def test_un_filtre_retire_est_refuse_au_kiosque(admin: TestClient, kiosk: TestClient) -> None:
    """Retirer un filtre doit fermer la porte, pas seulement masquer un bouton.

    Un onglet resté ouvert sur l'ancien écran de review continuerait sinon à demander un
    filtre que l'événement ne propose plus.
    """
    config = admin.get("/admin/event-config").json()
    config["available_filters"] = ["original"]
    admin.put("/admin/event-config", json=config)

    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")

    refus = kiosk.post(f"/api/session/{session_id}/filter", json={"name": "sepia"})

    assert refus.status_code == 422


def test_le_changement_de_format_change_le_recadrage(admin: TestClient, kiosk: TestClient) -> None:
    """Le format de sortie fixe le ratio de recadrage, donc le cadre de visée du kiosque."""
    config = admin.get("/admin/event-config").json()
    config["print_format"] = {"name": "Carré", "width_mm": 72, "height_mm": 72, "dpi": 300}
    admin.put("/admin/event-config", json=config)

    assert kiosk.get("/api/event").json()["print_aspect_ratio"] == 1.0


def test_valeur_hors_bornes_refusee(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["copies_per_print"] = 999

    assert admin.put("/admin/event-config", json=config).status_code == 422


def test_filtre_inconnu_refuse(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["available_filters"] = ["polaroid"]

    assert admin.put("/admin/event-config", json=config).status_code == 422


def test_chemin_dans_overlay_file_refuse(admin: TestClient) -> None:
    """Frontière de confiance : `overlay_file` sert à construire un chemin de lecture.

    Le champ ne portait qu'un commentaire jusqu'ici, ce qui suffisait tant que la valeur
    venait d'un fichier édité à la main.
    """
    config = admin.get("/admin/event-config").json()

    for tentative in ("../../etc/passwd", "/etc/passwd", "..", "sous/dossier.png", ""):
        config["overlay_file"] = tentative
        response = admin.put("/admin/event-config", json=config)
        assert response.status_code == 422, f"{tentative!r} aurait dû être refusé"


def test_une_configuration_refusee_ne_touche_pas_au_disque(
    admin: TestClient, runtime: Runtime
) -> None:
    """Un 422 ne doit rien avoir écrit : la validation précède l'enregistrement."""
    avant = (runtime.settings.event_dir / CONFIG_FILENAME).read_text(encoding="utf-8")

    admin.put("/admin/event-config", json={"copies_per_print": 999})

    assert (runtime.settings.event_dir / CONFIG_FILENAME).read_text(encoding="utf-8") == avant


def test_l_enregistrement_ne_laisse_pas_de_temporaire(admin: TestClient, runtime: Runtime) -> None:
    """Écriture atomique : le temporaire ne doit pas survivre au remplacement."""
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Soirée"
    admin.put("/admin/event-config", json=config)

    assert list(runtime.settings.event_dir.glob("*.tmp")) == []


def test_la_configuration_survit_a_un_redemarrage(admin: TestClient, runtime: Runtime) -> None:
    """Ce que le portail écrit doit être relu du disque, pas seulement gardé en mémoire."""
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Gala"
    admin.put("/admin/event-config", json=config)

    assert runtime.event_store.load().config.event_name == "Gala"
