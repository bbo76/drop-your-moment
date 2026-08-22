"""API du portail d'administration.

Le fil conducteur : ce que l'opérateur modifie ici doit être vu par le kiosque sans
redémarrage. C'est la raison d'être du process unique à deux sockets, et jusqu'à ce jalon
`Runtime.reload_event()` n'avait aucun appelant — donc rien ne le vérifiait.
"""

from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from dropyourmoment.core.event_config import CONFIG_FILENAME, OVERLAY_FILENAME
from dropyourmoment.core.print_format import POSTCARD_LANDSCAPE
from dropyourmoment.core.session import SessionState
from dropyourmoment.runtime import Runtime

# Au ratio de la carte postale paysage (1.48), le format par défaut de l'événement.
GOOD_SIZE = (1480, 1000)


def test_lecture_de_la_configuration_active(admin: TestClient) -> None:
    body = admin.get("/admin/event-config").json()

    assert body["event_name"] == "Événement"
    assert body["available_filters"] == ["original", "bw", "sepia"]
    assert body["copies_per_print"] == 1
    assert body["flash_duration_ms"] == 180


def test_aller_retour_de_la_configuration(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Mariage Camille & Théo"
    config["available_filters"] = ["original", "bw"]
    config["copies_per_print"] = 2
    config["flash_duration_ms"] = 320

    assert admin.put("/admin/event-config", json=config).status_code == 200

    relu = admin.get("/admin/event-config").json()
    assert relu["event_name"] == "Mariage Camille & Théo"
    assert relu["available_filters"] == ["original", "bw"]
    assert relu["copies_per_print"] == 2
    assert relu["flash_duration_ms"] == 320


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
    config["flash_duration_ms"] = 450
    admin.put("/admin/event-config", json=config)

    vu_par_le_kiosque = kiosk.get("/api/event").json()

    assert vu_par_le_kiosque["event_name"] == "Anniversaire de Lou"
    assert vu_par_le_kiosque["available_filters"] == ["bw"]
    assert vu_par_le_kiosque["flash_duration_ms"] == 450


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

    config = admin.get("/admin/event-config").json()
    config["flash_duration_ms"] = 2001
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


# --- Téléversement de l'overlay -------------------------------------------------------


def _png(size: tuple[int, int], mode: str = "RGBA", alpha: int = 128) -> bytes:
    """Un PNG en mémoire. `alpha=255` produit une image entièrement opaque."""
    color = (255, 0, 0, alpha) if mode == "RGBA" else (255, 0, 0)
    buffer = BytesIO()
    Image.new(mode, size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(admin: TestClient, data: bytes, name: str = "cadre.png"):
    return admin.post("/admin/overlay", files={"file": (name, data, "image/png")})


def test_overlay_au_bon_ratio_accepte(admin: TestClient, runtime: Runtime) -> None:
    response = _upload(admin, _png(GOOD_SIZE))

    assert response.status_code == 200
    assert response.json()["overlay_file"] == OVERLAY_FILENAME
    assert runtime.event.overlay is not None, "le kiosque doit l'avoir chargé aussitôt"
    assert runtime.event_store.overlay_path.is_file()


def test_overlay_au_mauvais_ratio_refuse_avec_les_deux_ratios(admin: TestClient) -> None:
    """Message exploitable, pas un 422 muet : l'opérateur doit savoir quoi corriger."""
    response = _upload(admin, _png((1000, 1000)))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "1.000" in detail, "le ratio reçu"
    assert f"{POSTCARD_LANDSCAPE.aspect_ratio:.3f}" in detail, "le ratio attendu"
    assert "1000×1000" in detail, "les dimensions reçues"
    assert POSTCARD_LANDSCAPE.name in detail, "le format qui l'impose"


def test_overlay_refuse_ne_touche_a_rien(admin: TestClient, runtime: Runtime) -> None:
    _upload(admin, _png((1000, 1000)))

    assert runtime.event.config.overlay_file is None
    assert not runtime.event_store.overlay_path.exists()


def test_fichier_qui_n_est_pas_une_image_refuse(admin: TestClient) -> None:
    response = _upload(admin, b"ce ne sont pas des pixels")

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "illisible" in detail
    assert "BytesIO" not in detail, "le repr de Pillow ne dit rien à un opérateur"


def test_png_tronque_refuse_sans_500(admin: TestClient) -> None:
    """En-tête valide, pixels absents : `Image.open` étant paresseux, il ne lève qu'au
    décodage. Décoder hors du gestionnaire d'erreur rendrait un 500 au lieu d'un refus."""
    entier = _png(GOOD_SIZE)

    response = _upload(admin, entier[: len(entier) // 2])

    assert response.status_code == 422


def test_image_sans_canal_alpha_refusee(admin: TestClient) -> None:
    response = _upload(admin, _png(GOOD_SIZE, mode="RGB"))

    assert response.status_code == 422
    assert "opaque" in response.json()["detail"]


def test_rgba_entierement_opaque_refuse(admin: TestClient) -> None:
    """Le piège qu'un contrôle de mode laisserait passer.

    Un JPEG aplati réexporté en PNG RGBA a bien un canal alpha, rempli de 255. Accepté, il
    donnerait des photos entièrement recouvertes par le cadre.
    """
    response = _upload(admin, _png(GOOD_SIZE, alpha=255))

    assert response.status_code == 422
    assert "opaque" in response.json()["detail"]


def test_png_palettise_transparent_accepte(admin: TestClient) -> None:
    """Faux négatif à éviter : la transparence d'un PNG palettisé vit dans un bloc tRNS,
    pas dans une bande « A ». Un cadre parfaitement valable ne doit pas être refusé."""
    buffer = BytesIO()
    Image.new("RGBA", GOOD_SIZE, (255, 0, 0, 0)).convert("P", palette=Image.Palette.ADAPTIVE).save(
        buffer, format="PNG", transparency=0
    )

    assert _upload(admin, buffer.getvalue()).status_code == 200


def test_le_televersement_preserve_le_reste_de_la_configuration(admin: TestClient) -> None:
    """Seul `overlay_file` change : le nom de l'événement ne doit pas repartir par défaut."""
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Gala"
    config["copies_per_print"] = 3
    admin.put("/admin/event-config", json=config)

    apres = _upload(admin, _png(GOOD_SIZE)).json()

    assert apres["event_name"] == "Gala"
    assert apres["copies_per_print"] == 3


def test_l_overlay_est_visible_sur_la_capture_suivante(
    admin: TestClient, kiosk: TestClient
) -> None:
    """Le bout en bout : accepté à la porte, appliqué par le pipeline sans redémarrage."""
    sans_overlay = _photo_apres_capture(kiosk)

    _upload(admin, _png(GOOD_SIZE))
    avec_overlay = _photo_apres_capture(kiosk)

    assert avec_overlay != sans_overlay


def test_overlay_servi_pour_apercu(admin: TestClient) -> None:
    assert admin.get("/admin/overlay").status_code == 404

    _upload(admin, _png(GOOD_SIZE))

    response = admin.get("/admin/overlay")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_retrait_de_l_overlay(admin: TestClient, runtime: Runtime) -> None:
    """Sans ce pendant, un cadre mis par erreur ne se retirerait qu'en éditant le JSON."""
    _upload(admin, _png(GOOD_SIZE))

    response = admin.delete("/admin/overlay")

    assert response.json()["overlay_file"] is None
    assert runtime.event.overlay is None
    assert not runtime.event_store.overlay_path.exists()


def test_overlay_refuse_apres_changement_de_format(admin: TestClient) -> None:
    """Le format de sortie est l'autorité : le passer en carré change le ratio attendu."""
    config = admin.get("/admin/event-config").json()
    config["print_format"] = {"name": "Carré", "width_mm": 72, "height_mm": 72, "dpi": 300}
    admin.put("/admin/event-config", json=config)

    assert _upload(admin, _png(GOOD_SIZE)).status_code == 422
    assert _upload(admin, _png((1000, 1000))).status_code == 200


def _photo_apres_capture(kiosk: TestClient) -> bytes:
    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")
    photo = kiosk.get(f"/api/session/{session_id}/photo").content
    kiosk.post("/api/session/cancel")
    return photo


# --- Page de santé ------------------------------------------------------------------


def test_la_sante_repond_a_tenir_la_soiree(admin: TestClient) -> None:
    """Une seule requête doit suffire à l'opérateur : caméra, imprimante, papier, disque."""
    body = admin.get("/admin/system/health").json()

    assert body["camera_ok"] is True
    assert body["camera_driver"] == "mock"
    assert body["preview_size"] == [640, 360]
    assert body["printer_driver"], "savoir qu'aucune imprimante n'est branchée explique tout"
    assert body["session_state"] == SessionState.IDLE
    assert body["counters"] == {"prints_total": 0, "prints_since_reset": 0, "reset_at": None}
    assert body["disk_free_bytes"] > 0
    assert body["disk_total_bytes"] >= body["disk_free_bytes"]
    assert 0 <= body["cpu_percent"] <= 100
    assert 0 < body["memory_used_bytes"] <= body["memory_total_bytes"]
    assert 0 <= body["memory_percent"] <= 100
    assert body["temperature_c"] is None or isinstance(body["temperature_c"], float)


def test_la_sante_distingue_un_apercu_vivant_d_un_apercu_gele(
    admin: TestClient, runtime: Runtime
) -> None:
    """La caméra peut être ouverte et disponible sans que personne ne tire de frame."""
    assert admin.get("/admin/system/health").json()["preview_streams"] == 0

    frames = runtime.camera.preview_frames()
    next(frames)

    assert admin.get("/admin/system/health").json()["preview_streams"] == 1
    frames.close()


def test_le_tirage_fait_monter_les_deux_compteurs(admin: TestClient, kiosk: TestClient) -> None:
    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")
    kiosk.post(f"/api/session/{session_id}/print")

    counters = admin.get("/admin/system/health").json()["counters"]

    assert counters["prints_total"] == 1
    assert counters["prints_since_reset"] == 1


def test_la_remise_a_zero_depuis_le_portail(admin: TestClient, kiosk: TestClient) -> None:
    """Le bouton sans lequel le second compteur serait une copie du cumul."""
    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")
    kiosk.post(f"/api/session/{session_id}/print")

    apres = admin.post("/admin/counters/reset").json()

    assert apres["prints_total"] == 1, "le cumul de l'événement ne bouge pas"
    assert apres["prints_since_reset"] == 0
    assert apres["reset_at"] is not None
    assert admin.get("/admin/system/health").json()["counters"] == apres
