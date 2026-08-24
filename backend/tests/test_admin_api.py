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
GOOD_SIZE = POSTCARD_LANDSCAPE.pixel_size


def test_lecture_de_la_configuration_active(admin: TestClient) -> None:
    body = admin.get("/admin/event-config").json()

    assert body["event_name"] == "Événement"
    assert body["launch_message"] == "Bienvenue"
    assert body["launch_font"] == "modern"
    assert body["accent_color"] == "#ffd400"
    assert body["available_filters"] == ["original", "bw", "sepia"]
    assert body["copies_per_print"] == 1
    assert body["default_shot_timer_seconds"] == 3
    assert body["screen_flash_enabled"] is True


def test_aller_retour_de_la_configuration(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Mariage Camille & Théo"
    config["launch_message"] = "Bienvenue à notre mariage"
    config["launch_font"] = "prestigious"
    config["accent_color"] = "#8b5cf6"
    config["available_filters"] = ["original", "bw"]
    config["copies_per_print"] = 2
    config["default_shot_timer_seconds"] = 10
    config["screen_flash_enabled"] = False

    assert admin.put("/admin/event-config", json=config).status_code == 200

    relu = admin.get("/admin/event-config").json()
    assert relu["event_name"] == "Mariage Camille & Théo"
    assert relu["launch_message"] == "Bienvenue à notre mariage"
    assert relu["launch_font"] == "prestigious"
    assert relu["accent_color"] == "#8b5cf6"
    assert relu["available_filters"] == ["original", "bw"]
    assert relu["copies_per_print"] == 2
    assert relu["default_shot_timer_seconds"] == 10
    assert relu["screen_flash_enabled"] is False


def test_une_couleur_dominante_invalide_est_refusee(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["accent_color"] = "jaune"

    assert admin.put("/admin/event-config", json=config).status_code == 422


def test_un_style_de_titre_inconnu_est_refuse(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["launch_font"] = "comic-sans"

    assert admin.put("/admin/event-config", json=config).status_code == 422


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
    config["launch_message"] = "Faites les fous !"
    config["launch_font"] = "handwritten"
    config["accent_color"] = "#f97316"
    config["available_filters"] = ["bw"]
    config["default_shot_timer_seconds"] = 5
    config["screen_flash_enabled"] = False
    admin.put("/admin/event-config", json=config)

    vu_par_le_kiosque = kiosk.get("/api/event").json()

    assert vu_par_le_kiosque["event_name"] == "Anniversaire de Lou"
    assert vu_par_le_kiosque["launch_message"] == "Faites les fous !"
    assert vu_par_le_kiosque["launch_font"] == "handwritten"
    assert vu_par_le_kiosque["accent_color"] == "#f97316"
    assert vu_par_le_kiosque["available_filters"] == ["bw"]
    assert vu_par_le_kiosque["default_shot_timer_seconds"] == 5
    assert vu_par_le_kiosque["screen_flash_enabled"] is False


def test_une_duree_de_minuteur_non_proposee_est_refusee(admin: TestClient) -> None:
    config = admin.get("/admin/event-config").json()
    config["default_shot_timer_seconds"] = 4

    assert admin.put("/admin/event-config", json=config).status_code == 422


def test_l_operateur_distant_peut_liberer_la_borne(
    admin: TestClient, kiosk: TestClient, runtime: Runtime
) -> None:
    kiosk.post("/api/session")

    response = admin.post("/admin/session/home")

    assert response.json()["state"] == "idle"
    assert runtime.machine.session is None


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


def test_le_portail_remplace_le_pin_sans_l_exposer(admin: TestClient, kiosk: TestClient) -> None:
    assert admin.put("/admin/maintenance-pin", json={"pin": "7391"}).status_code == 204

    assert kiosk.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 401
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "7391"}).status_code == 204


def test_le_portail_refuse_un_pin_non_conforme(admin: TestClient) -> None:
    for pin in ("123", "12345", "abcd"):
        assert admin.put("/admin/maintenance-pin", json={"pin": pin}).status_code == 422


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


def test_overlay_plus_grand_est_reduit_a_la_sortie(admin: TestClient, runtime: Runtime) -> None:
    large = (GOOD_SIZE[0] * 2, GOOD_SIZE[1] * 2)

    assert _upload(admin, _png(large)).status_code == 200

    with Image.open(runtime.event_store.overlay_path) as stored:
        assert stored.size == GOOD_SIZE


def test_overlay_plus_petit_est_conserve_sans_agrandissement(
    admin: TestClient, runtime: Runtime
) -> None:
    small = (GOOD_SIZE[0] // 2, GOOD_SIZE[1] // 2)

    response = _upload(admin, _png(small))

    assert response.status_code == 200
    with Image.open(runtime.event_store.overlay_path) as stored:
        assert stored.size == small


def test_overlay_paysage_au_ratio_proche_est_recadre_sans_deformation(
    admin: TestClient, runtime: Runtime
) -> None:
    response = _upload(admin, _png((1536, 1024)))

    assert response.status_code == 200
    with Image.open(runtime.event_store.overlay_path) as stored:
        assert stored.size == (1516, 1024)


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
    assert body["counters"] == {
        "prints_total": 0,
        "prints_since_reset": 0,
        "reset_at": None,
        "cartridge_capacity": 36,
        "prints_since_cassette_reload": 0,
        "paper_stock_capacity": 108,
        "prints_since_stock_set": 0,
        "stock_set_at": None,
        "cassette_capacity": 18,
    }
    assert body["disk_free_bytes"] > 0
    assert body["disk_total_bytes"] >= body["disk_free_bytes"]
    assert 0 <= body["cpu_percent"] <= 100
    assert 0 < body["memory_used_bytes"] <= body["memory_total_bytes"]
    assert 0 <= body["memory_percent"] <= 100
    assert body["temperature_c"] is None or isinstance(body["temperature_c"], float)


def test_la_sante_signale_la_maintenance_locale(
    admin: TestClient, kiosk: TestClient, runtime: Runtime
) -> None:
    assert admin.get("/admin/system/health").json()["maintenance_active"] is False

    assert kiosk.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 204
    assert admin.get("/admin/system/health").json()["maintenance_active"] is True

    assert kiosk.post("/api/maintenance/lock").status_code == 204
    assert admin.get("/admin/system/health").json()["maintenance_active"] is False

    runtime.settings.maintenance_session_timeout_s = 0
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "2580"}).status_code == 204
    assert admin.get("/admin/system/health").json()["maintenance_active"] is False


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

    apres = admin.post("/admin/counters/paper-stock", json={"capacity": 137}).json()

    assert apres["prints_total"] == 1, "le cumul de l'événement ne bouge pas"
    assert apres["prints_since_stock_set"] == 0
    assert apres["paper_stock_capacity"] == 137
    assert apres["stock_set_at"] is not None
    assert apres["prints_since_reset"] == 1
    assert admin.get("/admin/system/health").json()["counters"] == apres


def test_le_remplacement_d_encre_depuis_le_portail(admin: TestClient) -> None:
    apres = admin.post("/admin/counters/ink/replace", json={"capacity": 54}).json()

    assert apres["cartridge_capacity"] == 54
    assert apres["prints_since_reset"] == 0
    assert apres["reset_at"] is not None
