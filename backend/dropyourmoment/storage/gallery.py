"""Galerie de l'événement : lister, miniaturiser, archiver.

Les trois opérations partagent une contrainte : un événement produit plusieurs centaines de
photos, et la borne est un Raspberry Pi avec une carte SD. Rien ici ne doit charger
l'ensemble — ni les images en mémoire pour lister, ni l'archive entière pour la
télécharger.

La logique vit ici plutôt que dans le routeur, comme le reste du dépôt : les routeurs
lisent l'état et déclenchent, ils ne portent pas d'algorithme.
"""

from __future__ import annotations

import zipfile
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path

from PIL import Image

from dropyourmoment.storage.paths import FINAL_NAME

THUMBNAIL_BOX = (320, 320)
THUMBNAIL_QUALITY = 80


@dataclass(frozen=True)
class GalleryEntry:
    session_id: str
    # `mtime` de `final.jpg`, donc la dernière composition. Un changement de filtre le
    # réécrit : c'est bien « quand cette photo a pris sa forme finale ».
    captured_at: float
    size_bytes: int

    @property
    def archive_name(self) -> str:
        """Nom dans l'archive : horodaté d'abord, pour que l'ordre alphabétique soit
        l'ordre chronologique. Un identifiant de session seul est opaque."""
        stamp = datetime.fromtimestamp(self.captured_at).strftime("%Y%m%d-%H%M%S")
        return f"{stamp}_{self.session_id}.jpg"


def list_sessions(
    sessions_root: Path, offset: int = 0, limit: int = 24
) -> tuple[int, list[GalleryEntry]]:
    """Rend le total et une tranche, du plus récent au plus ancien.

    Ne retient que les sessions portant un `final.jpg` : une session en cours n'a encore
    qu'un `raw.jpg`, et une session dont le visiteur a demandé une nouvelle prise n'a plus
    rien du tout.

    Un `stat` par session, jamais un balayage récursif — la taille affichée est celle de
    la photo, pas celle du dossier. Sur plusieurs centaines de sessions cela reste
    quelques millisecondes ; c'est le décodage des images qu'il fallait éviter, et la
    pagination s'en charge en aval.
    """
    if not sessions_root.is_dir():
        return 0, []

    entries: list[GalleryEntry] = []
    for directory in sessions_root.iterdir():
        final = directory / FINAL_NAME
        if not directory.is_dir() or not final.is_file():
            continue
        stat = final.stat()
        entries.append(
            GalleryEntry(
                session_id=directory.name,
                captured_at=stat.st_mtime,
                size_bytes=stat.st_size,
            )
        )

    entries.sort(key=lambda entry: entry.captured_at, reverse=True)
    return len(entries), entries[offset : offset + limit]


def thumbnail_jpeg(path: Path, box: tuple[int, int] = THUMBNAIL_BOX) -> bytes:
    """Une miniature JPEG, produite à la demande.

    `draft()` est ce qui rend l'absence de cache tenable : sur un JPEG, il demande au
    décodeur de sous-échantillonner dans le domaine DCT, donc l'image pleine résolution
    n'est jamais reconstituée. Une vignette coûte alors une fraction d'un décodage complet.

    ponytail: aucun cache disque. Une grille de 24 vignettes tient largement sur un Pi
    grâce à `draft`. Si la page devenait lente sur place, la suite est un `thumb.jpg` écrit
    à côté de `final.jpg` — jamais un cache en mémoire, qui se viderait au redémarrage
    justement quand l'opérateur en aurait besoin.
    """
    with Image.open(path) as image:
        image.draft("RGB", box)
        image.thumbnail(box, Image.Resampling.LANCZOS)
        buffer = BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=THUMBNAIL_QUALITY)
    return buffer.getvalue()


class _Sink:
    """Cible d'écriture sans `seek` ni `tell`, vidée au fur et à mesure.

    C'est l'absence de ces deux méthodes qui déclenche le mode flux de `zipfile` : il
    bascule sur les descripteurs de données au lieu de revenir en arrière corriger les
    en-têtes. Un objet de dix lignes remplace donc un temporaire de plusieurs gigaoctets.
    """

    def __init__(self) -> None:
        self._chunks: list[bytes] = []

    def write(self, data: bytes) -> int:
        self._chunks.append(bytes(data))
        return len(data)

    def flush(self) -> None:
        pass

    def drain(self) -> bytes:
        data = b"".join(self._chunks)
        self._chunks.clear()
        return data


def zip_stream(photos: Iterable[tuple[str, Path]]) -> Iterator[bytes]:
    """Archive l'événement en flux, sans jamais la construire en entier.

    `ZIP_STORED` et non `ZIP_DEFLATED` : du JPEG est déjà compressé, et le déflater ne
    gagnerait que quelques pour cent en échange de tout le CPU d'un Pi. Le tirage d'une
    soirée se télécharge pendant que l'opérateur range le matériel — pas pendant qu'il
    attend.

    Le pic mémoire est d'une photo : `ZipFile.write` recopie la source par blocs, et le
    puits est vidé après chaque entrée.
    """
    sink = _Sink()
    with zipfile.ZipFile(sink, "w", zipfile.ZIP_STORED) as archive:
        for arcname, path in photos:
            archive.write(path, arcname)
            if chunk := sink.drain():
                yield chunk
    # L'annuaire central est écrit à la fermeture du `with`, donc après la boucle.
    if chunk := sink.drain():
        yield chunk
