"""Galerie de l'événement : lister, miniaturiser, archiver.

Le fil conducteur est une contrainte de matériel. Un événement produit plusieurs centaines
de photos et la borne est un Pi avec une carte SD : rien ne doit charger l'ensemble — ni
les images pour lister, ni l'archive pour la télécharger.
"""

from __future__ import annotations

import os
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from dropyourmoment.runtime import Runtime
from dropyourmoment.storage.gallery import list_sessions, thumbnail_jpeg, zip_stream

# Horodatages fixes et croissants : sans eux l'ordre de la galerie dépendrait de la
# vitesse d'écriture du système de fichiers, et le test serait instable.
FIRST_MTIME = 1_760_000_000


def _sessions(root: Path, count: int, size: tuple[int, int] = (960, 648)) -> list[str]:
    """Fabrique `count` sessions terminées, de la plus ancienne à la plus récente."""
    identifiers = []
    for index in range(count):
        session_id = f"{index:012x}"
        directory = root / session_id
        directory.mkdir(parents=True)
        final = directory / "final.jpg"
        Image.new("RGB", size, (index * 7 % 256, 80, 120)).save(final)
        os.utime(final, (FIRST_MTIME + index, FIRST_MTIME + index))
        identifiers.append(session_id)
    return identifiers


def test_liste_du_plus_recent_au_plus_ancien(tmp_path: Path) -> None:
    identifiers = _sessions(tmp_path, 5)

    total, entries = list_sessions(tmp_path, offset=0, limit=10)

    assert total == 5
    assert [entry.session_id for entry in entries] == list(reversed(identifiers))


def test_pagination_ne_rend_qu_une_tranche(tmp_path: Path) -> None:
    """Plusieurs centaines de photos ne doivent pas être servies d'un bloc."""
    _sessions(tmp_path, 30)

    total, first = list_sessions(tmp_path, offset=0, limit=12)
    _, second = list_sessions(tmp_path, offset=12, limit=12)
    _, last = list_sessions(tmp_path, offset=24, limit=12)

    assert total == 30
    assert (len(first), len(second), len(last)) == (12, 12, 6)
    assert {entry.session_id for entry in first}.isdisjoint(entry.session_id for entry in second), (
        "aucune session ne doit apparaître sur deux pages"
    )


def test_une_session_sans_photo_finale_est_absente(tmp_path: Path) -> None:
    """Une session en cours n'a qu'un `raw.jpg`, et une session refaite n'a plus rien."""
    _sessions(tmp_path, 2)
    (tmp_path / "encours").mkdir()
    (tmp_path / "encours" / "raw.jpg").write_bytes(b"pas encore composee")
    (tmp_path / "vide").mkdir()

    total, entries = list_sessions(tmp_path, limit=10)

    assert total == 2
    assert {entry.session_id for entry in entries} == {"000000000000", "000000000001"}


def test_liste_sur_un_dossier_absent(tmp_path: Path) -> None:
    """Avant la première session, le dossier n'existe pas encore."""
    assert list_sessions(tmp_path / "jamais-cree") == (0, [])


def test_la_vignette_est_bien_plus_petite(tmp_path: Path) -> None:
    _sessions(tmp_path, 1, size=(1918, 1296))
    original = tmp_path / "000000000000" / "final.jpg"

    data = thumbnail_jpeg(original)

    with Image.open(BytesIO(data)) as vignette:
        assert vignette.format == "JPEG"
        assert max(vignette.size) <= 320
    assert len(data) < original.stat().st_size


def test_la_vignette_garde_le_ratio(tmp_path: Path) -> None:
    """Une vignette déformée ferait mal juger un recadrage."""
    _sessions(tmp_path, 1, size=(1480, 1000))

    with Image.open(BytesIO(thumbnail_jpeg(tmp_path / "000000000000" / "final.jpg"))) as vignette:
        assert abs(vignette.size[0] / vignette.size[1] - 1.48) < 0.01


def test_l_archive_se_relit(tmp_path: Path) -> None:
    identifiers = _sessions(tmp_path, 4)
    photos = [(f"{i}.jpg", tmp_path / i / "final.jpg") for i in identifiers]

    data = b"".join(zip_stream(photos))

    with zipfile.ZipFile(BytesIO(data)) as archive:
        assert archive.testzip() is None, "archive corrompue"
        assert sorted(archive.namelist()) == sorted(name for name, _ in photos)


def test_l_archive_sort_par_morceaux(tmp_path: Path) -> None:
    """Le flux est ce qui évite de construire l'archive en mémoire ou dans un temporaire.

    Un seul morceau signifierait que tout a été assemblé avant d'être rendu.
    """
    identifiers = _sessions(tmp_path, 5)
    photos = [(f"{i}.jpg", tmp_path / i / "final.jpg") for i in identifiers]

    chunks = list(zip_stream(photos))

    assert len(chunks) > 1
    biggest = max(len(chunk) for chunk in chunks)
    total = sum(len(chunk) for chunk in chunks)
    assert biggest < total, "le pic doit valoir une photo, pas l'archive entière"


def test_une_archive_vide_reste_une_archive_valide(tmp_path: Path) -> None:
    """Avant la première photo, le bouton existe déjà : il ne doit pas rendre un fichier
    illisible."""
    data = b"".join(zip_stream([]))

    with zipfile.ZipFile(BytesIO(data)) as archive:
        assert archive.namelist() == []


# --- Routes ---------------------------------------------------------------------------


def test_la_galerie_pagine(admin: TestClient, runtime: Runtime) -> None:
    _sessions(runtime.settings.sessions_dir, 30)

    body = admin.get("/admin/gallery", params={"offset": 0, "limit": 12}).json()

    assert body["total"] == 30
    assert len(body["entries"]) == 12
    assert body["entries"][0]["session_id"] == f"{29:012x}", "le plus récent d'abord"
    assert body["entries"][0]["size_bytes"] > 0


def test_la_taille_de_page_est_bornee(admin: TestClient) -> None:
    """La valeur vient de l'URL : sans plafond, une requête produirait des centaines de
    vignettes."""
    assert admin.get("/admin/gallery", params={"limit": 1000}).status_code == 422
    assert admin.get("/admin/gallery", params={"limit": 0}).status_code == 422
    assert admin.get("/admin/gallery", params={"offset": -1}).status_code == 422


def test_vignette_servie_en_jpeg(admin: TestClient, runtime: Runtime) -> None:
    _sessions(runtime.settings.sessions_dir, 1)

    response = admin.get("/admin/gallery/000000000000/thumbnail")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    with Image.open(BytesIO(response.content)) as image:
        assert max(image.size) <= 320


def test_telechargement_unitaire_en_piece_jointe(admin: TestClient, runtime: Runtime) -> None:
    _sessions(runtime.settings.sessions_dir, 1)

    response = admin.get("/admin/gallery/000000000000/photo")

    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]


def test_photo_plein_format_s_affiche_sans_telechargement(
    admin: TestClient, runtime: Runtime
) -> None:
    _sessions(runtime.settings.sessions_dir, 1)

    response = admin.get("/admin/gallery/000000000000/view")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert "content-disposition" not in response.headers


def test_suppression_efface_toute_la_session(admin: TestClient, runtime: Runtime) -> None:
    _sessions(runtime.settings.sessions_dir, 2)
    directory = runtime.settings.sessions_dir / "000000000000"
    (directory / "raw.jpg").write_bytes(b"prise brute")
    (directory / "artefact.tmp").write_bytes(b"autre artefact")

    response = admin.delete("/admin/gallery/000000000000")

    assert response.status_code == 204
    assert not directory.exists()
    body = admin.get("/admin/gallery").json()
    assert body["total"] == 1
    assert body["entries"][0]["session_id"] == "000000000001"


def test_suppression_refuse_la_session_en_cours(
    admin: TestClient, kiosk: TestClient, runtime: Runtime
) -> None:
    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")

    response = admin.delete(f"/admin/gallery/{session_id}")

    assert response.status_code == 409
    assert "session en cours" in response.json()["detail"]
    assert (runtime.settings.sessions_dir / session_id / "final.jpg").is_file()


def test_suppression_inconnue_en_404(admin: TestClient) -> None:
    assert admin.delete("/admin/gallery/jamais-vue").status_code == 404


def test_session_inconnue_en_404(admin: TestClient) -> None:
    assert admin.get("/admin/gallery/jamais-vue/photo").status_code == 404
    assert admin.get("/admin/gallery/jamais-vue/thumbnail").status_code == 404
    assert admin.get("/admin/gallery/jamais-vue/view").status_code == 404


def test_traversee_de_chemin_refusee(admin: TestClient, runtime: Runtime) -> None:
    """`session_id` vient de l'URL : « .. » et les chemins absolus mènent au même refus."""
    (runtime.settings.data_dir / "secret.txt").write_text("hors galerie")

    for tentative in ("..%2F..%2Fsecret.txt", "%2Fetc", "..", "..%2F..%2F..%2Fetc%2Fpasswd"):
        for method, suffix in ((admin.get, "/photo"), (admin.delete, "")):
            response = method(f"/admin/gallery/{tentative}{suffix}")
            assert response.status_code == 404, f"{tentative!r} n'a pas été refusé"


def test_l_archive_de_l_evenement_se_telecharge(admin: TestClient, runtime: Runtime) -> None:
    _sessions(runtime.settings.sessions_dir, 6)

    response = admin.get("/admin/gallery/archive.zip")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(BytesIO(response.content)) as archive:
        assert len(archive.namelist()) == 6
        assert archive.testzip() is None


def test_le_nom_de_l_archive_vient_de_l_evenement(admin: TestClient, runtime: Runtime) -> None:
    """Un fichier qui atterrit dans un dossier de téléchargements doit se reconnaître."""
    _sessions(runtime.settings.sessions_dir, 1)
    config = admin.get("/admin/event-config").json()
    config["event_name"] = "Mariage Camille & Théo"
    admin.put("/admin/event-config", json=config)

    disposition = admin.get("/admin/gallery/archive.zip").headers["content-disposition"]

    assert "Mariage-Camille-Theo.zip" in disposition


def test_archive_zip_n_est_pas_pris_pour_une_session(admin: TestClient) -> None:
    """Les routes à paramètre ne doivent pas capturer le nom de l'archive."""
    assert admin.get("/admin/gallery/archive.zip").status_code == 200


def test_la_photo_du_kiosque_apparait_dans_la_galerie(admin: TestClient, kiosk: TestClient) -> None:
    """Le bout en bout : ce que le visiteur garde, l'opérateur le retrouve."""
    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")
    kiosk.post(f"/api/session/{session_id}/print")

    body = admin.get("/admin/gallery").json()

    assert body["total"] == 1
    assert body["entries"][0]["session_id"] == session_id
    assert admin.get(f"/admin/gallery/{session_id}/thumbnail").status_code == 200
