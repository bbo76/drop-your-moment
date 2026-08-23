"""API du portail d'administration, exposée sur le LAN.

Pas d'authentification : risque assumé, l'accès est censé rester limité au LAN pendant un
événement. À revoir si l'usage sort de ce cadre.

Ces routes ne sont montées que sur l'application admin, et l'API du kiosque ne l'est que
sur la sienne. C'est vérifié par `tests/test_network_isolation.py` : la garantie ne tient
qu'à deux adresses de bind, et une route montée sur la mauvaise application la perdrait
sans que rien ne le signale.
"""

from __future__ import annotations

import logging
import re
import shutil
import unicodedata
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from dropyourmoment.api.kiosk_router import SessionStatus, _status, get_runtime
from dropyourmoment.core.event_config import OVERLAY_FILENAME, EventConfig
from dropyourmoment.core.session import SessionState
from dropyourmoment.hardware.camera.discovery import (
    ProbedCamera,
    probe_indices,
    system_camera_names,
)
from dropyourmoment.hardware.system_metrics import read_system_metrics
from dropyourmoment.imaging.steps import crop_to_aspect
from dropyourmoment.runtime import Runtime
from dropyourmoment.storage.atomic import write_atomic
from dropyourmoment.storage.counters import PAPER_CASSETTE_CAPACITY, Counters
from dropyourmoment.storage.gallery import GalleryEntry, list_sessions, thumbnail_jpeg, zip_stream
from dropyourmoment.storage.paths import FINAL_NAME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin")

# Plafond de lecture, pas de transfert : Starlette a déjà déversé le corps dans un
# temporaire quand la route s'exécute. Ce qu'on empêche, c'est de faire décoder plusieurs
# centaines de mégaoctets à Pillow — un overlay de carte postale en pèse moins de deux.
MAX_OVERLAY_BYTES = 20 * 1024 * 1024


class CounterReading(BaseModel):
    """Les deux compteurs, en miroir de `storage.counters.Counters`."""

    prints_total: int
    prints_since_reset: int
    reset_at: str | None
    cartridge_capacity: int
    prints_since_cassette_reload: int
    cassette_capacity: int = PAPER_CASSETTE_CAPACITY


class AdminHealth(BaseModel):
    """Tout ce qu'il faut pour répondre à « est-ce que la borne va tenir la soirée ? ».

    Une seule requête plutôt que cinq : c'est une page qu'on rafraîchit en boucle, et
    l'opérateur veut un état cohérent à un instant donné, pas cinq lectures décalées.
    """

    camera_ok: bool
    camera_driver: str
    # Un aperçu vivant se distingue d'un aperçu gelé ici : la caméra peut être ouverte et
    # disponible sans que plus personne ne consomme de frame.
    preview_streams: int
    preview_size: tuple[int, int]
    still_size: tuple[int, int]

    printer_driver: str

    session_state: SessionState
    event_name: str
    print_format_name: str
    print_aspect_ratio: float

    counters: CounterReading

    # `statvfs` du système de fichiers portant `data_dir`. Un événement pèse environ 2 Go :
    # c'est à cette échelle que l'espace restant se lit.
    disk_free_bytes: int
    disk_total_bytes: int
    cpu_percent: float
    memory_used_bytes: int
    memory_total_bytes: int
    memory_percent: float
    temperature_c: float | None


@router.get("/system/health", response_model=AdminHealth)
def read_health(runtime: Runtime = Depends(get_runtime)) -> AdminHealth:
    """Diagnostic complet, sans effet de bord.

    Rien ici ne sonde de périphérique ni ne balaye de répertoire : la page est rafraîchie
    en boucle pendant un événement, et un balayage du dossier des sessions à chaque
    passage coûterait des centaines d'appels `stat` toutes les deux secondes sur une carte
    SD. `disk_usage` est un seul `statvfs`, et il répond à la même question.
    """
    caps = runtime.camera.get_capabilities()
    config = runtime.event.config
    usage = shutil.disk_usage(runtime.settings.data_dir)
    metrics = read_system_metrics()
    return AdminHealth(
        camera_ok=runtime.camera.is_available(),
        camera_driver=caps.driver_name,
        preview_streams=runtime.camera.active_streams,
        preview_size=caps.preview_size,
        still_size=caps.still_size,
        printer_driver=runtime.printer.name,
        session_state=runtime.machine.state,
        event_name=config.event_name,
        print_format_name=config.print_format.name,
        print_aspect_ratio=config.print_format.aspect_ratio,
        counters=_reading(runtime.counters.read()),
        disk_free_bytes=usage.free,
        disk_total_bytes=usage.total,
        cpu_percent=metrics.cpu_percent,
        memory_used_bytes=metrics.memory_used_bytes,
        memory_total_bytes=metrics.memory_total_bytes,
        memory_percent=metrics.memory_percent,
        temperature_c=metrics.temperature_c,
    )


@router.post("/counters/reset", response_model=CounterReading)
def reset_cartridge_counter(runtime: Runtime = Depends(get_runtime)) -> CounterReading:
    """Réarme le compteur de cartouche. Le cumul de l'événement ne bouge pas.

    Le bouton sans lequel le second compteur n'aurait aucune raison d'exister : il
    vaudrait toujours exactement le cumul.
    """
    return _reading(runtime.counters.reset_cartridge())


@router.post("/counters/cassette/reload", response_model=CounterReading)
def reload_paper_cassette(runtime: Runtime = Depends(get_runtime)) -> CounterReading:
    return _reading(runtime.counters.reload_cassette())


@router.post("/session/home", response_model=SessionStatus)
def force_kiosk_home(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Interrompt à distance une session bloquée et rend le kiosque disponible."""
    runtime.machine.reset()
    logger.info("session du kiosque interrompue depuis le portail d’administration")
    return _status(runtime)


class MaintenancePinChange(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")


@router.put("/maintenance-pin", status_code=status.HTTP_204_NO_CONTENT)
def replace_maintenance_pin(
    change: MaintenancePinChange, runtime: Runtime = Depends(get_runtime)
) -> None:
    """Remplace le PIN local sans jamais exposer sa valeur actuelle au portail."""
    runtime.replace_maintenance_pin(change.pin)


def _reading(counters: Counters) -> CounterReading:
    # `vars()` plutôt qu'une recopie champ par champ : les deux structures sont un miroir
    # l'une de l'autre, et un champ ajouté d'un côté seulement lèvera au lieu de manquer
    # en silence.
    return CounterReading(**vars(counters), cassette_capacity=PAPER_CASSETTE_CAPACITY)


@router.get("/event-config", response_model=EventConfig)
def read_event_config(runtime: Runtime = Depends(get_runtime)) -> EventConfig:
    """La configuration en mémoire, pas le fichier : c'est elle que le kiosque applique.

    Les deux coïncident, sauf si le fichier a été corrigé à la main sans redémarrage — et
    dans ce cas c'est bien la version active que l'opérateur doit voir avant de la modifier.
    """
    return runtime.event.config


@router.put("/event-config", response_model=EventConfig)
def write_event_config(
    config: EventConfig,
    runtime: Runtime = Depends(get_runtime),
) -> EventConfig:
    """Enregistre la configuration, puis la fait relire par le kiosque.

    `reload_event()` est ce qui justifie le process unique à deux sockets : le kiosque et
    l'administration partagent le même `Runtime`, donc la modification est visible au
    sondage de statut suivant — sans redémarrage, et sans mécanisme d'invalidation entre
    process. Deux process séparés auraient laissé le kiosque sur son ancien overlay.

    La validation est celle du modèle : bornes de `copies_per_print`, filtres connus,
    dimensions positives, `overlay_file` réduit à un nom de fichier. FastAPI en fait un
    422 avec le détail du champ fautif, ce qui est exactement ce que le formulaire affiche.

    Le corps remplace la configuration entière plutôt que d'être fusionné : c'est un objet
    unique, l'opérateur le relit avant de le renvoyer, et un PATCH partiel demanderait de
    distinguer « champ absent » de « champ remis à zéro ».
    """
    runtime.event_store.save_config(config)
    runtime.reload_event()
    logger.info("configuration d'événement mise à jour : « %s »", config.event_name)
    return runtime.event.config


@router.get("/overlay")
def read_overlay(runtime: Runtime = Depends(get_runtime)) -> FileResponse:
    """Sert l'overlay courant, pour que le portail puisse l'afficher."""
    path = runtime.event_store.overlay_path
    if not runtime.event.config.overlay_file or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="aucun overlay téléversé")
    # L'URL n'a pas de révision : sans `no-store` le navigateur resservirait l'ancien
    # cadre juste après un téléversement, ce qui ferait douter du succès de l'opération.
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.post("/overlay", response_model=EventConfig)
def upload_overlay(
    file: UploadFile = File(...),
    runtime: Runtime = Depends(get_runtime),
) -> EventConfig:
    """Téléverse le cadre de l'événement, en refusant tout ce qui ne conviendrait pas.

    **Strict à la porte, permissif à l'exécution.** Ici l'opérateur est devant son écran :
    un refus est une correction immédiate. Au chargement, un samedi soir, le même fichier
    serait accepté avec un avertissement dans les logs — perdre le branding d'un événement
    est plus grave que l'afficher légèrement étiré.

    Route déclarée en `def` et non `async def`, comme celles du kiosque : FastAPI l'exécute
    alors dans un threadpool, et le décodage Pillow d'un PNG de plusieurs mégapixels ne
    fige pas la boucle d'événements — donc pas le flux d'aperçu servi en parallèle.
    """
    data = file.file.read(MAX_OVERLAY_BYTES + 1)
    if len(data) > MAX_OVERLAY_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"fichier trop volumineux, maximum {MAX_OVERLAY_BYTES // 1024 // 1024} Mo",
        )

    image = _decoded(data)
    _reject_if_opaque(image)
    image = _normalize_overlay_ratio(image, runtime)
    image = _downscale_to_print_size(image, runtime)

    # Le fichier d'abord, la configuration ensuite : dans l'autre ordre, `reload_event()`
    # journaliserait un overlay déclaré mais introuvable.
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    write_atomic(runtime.event_store.overlay_path, buffer.getvalue())

    runtime.event_store.save_config(
        runtime.event.config.model_copy(update={"overlay_file": OVERLAY_FILENAME})
    )
    runtime.reload_event()
    logger.info("overlay téléversé : %s, %s", file.filename, image.size)
    return runtime.event.config


def _downscale_to_print_size(image: Image.Image, runtime: Runtime) -> Image.Image:
    """Réduit vers la sortie recommandée, mais conserve une source plus petite telle quelle."""
    target = runtime.event.config.print_format.pixel_size
    if image.width <= target[0] or image.height <= target[1]:
        return image
    return image.resize(target, Image.Resampling.LANCZOS)


@router.delete("/overlay", response_model=EventConfig)
def delete_overlay(runtime: Runtime = Depends(get_runtime)) -> EventConfig:
    """Retire le branding de l'événement.

    Le pendant du téléversement : sans lui, l'opérateur qui a mis un cadre par erreur ne
    pourrait que le remplacer, ou éditer le JSON à la main — ce que le portail existe
    précisément pour éviter.
    """
    runtime.event_store.save_config(runtime.event.config.model_copy(update={"overlay_file": None}))
    runtime.event_store.overlay_path.unlink(missing_ok=True)
    runtime.reload_event()
    logger.info("overlay retiré")
    return runtime.event.config


def _decoded(data: bytes) -> Image.Image:
    """Décode le fichier en RGBA, ou refuse.

    La conversion fait partie du décodage volontairement. `Image.open` est paresseux : il
    lit l'en-tête et rend la main, donc un PNG tronqué mais reconnaissable ne lève qu'au
    moment où on touche aux pixels. Décoder ailleurs qu'ici rendrait un 500 au lieu d'un
    refus explicable.

    Convertir en RGBA règle aussi le cas du PNG palettisé, qui porte sa transparence dans
    un bloc tRNS plutôt que dans une bande « A » : après conversion, il n'y a plus qu'un
    seul cas à examiner.

    Les bombes de décompression sont couvertes par le garde-fou de Pillow
    (`Image.MAX_IMAGE_PIXELS`, ~89 Mpx) : il lève au-delà du double, donc bien avant
    qu'une image forgée n'épuise la mémoire d'un Pi.
    """
    try:
        return Image.open(BytesIO(data)).convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        # Le message de Pillow part au journal et pas à l'écran : il porte le `repr` d'un
        # `BytesIO`, qui ne dit rien à l'opérateur et le laisserait croire à un bug.
        logger.warning("overlay illisible refusé : %s", exc)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="fichier illisible comme image — un PNG est attendu.",
        ) from exc


def _reject_if_opaque(image: Image.Image) -> None:
    """Un overlay entièrement opaque masquerait la photo.

    Le contrôle porte sur les pixels, pas sur le mode. Un JPEG aplati réexporté en PNG
    RGBA a bien un canal alpha — rempli de 255 : un contrôle de mode l'accepterait, et
    l'opérateur obtiendrait des photos entièrement recouvertes par son cadre. C'est
    précisément l'erreur qu'on attend d'un export mal réglé.

    `getextrema()` sur le canal alpha suffit et ne coûte qu'un balayage : si le minimum
    vaut 255, aucun pixel de la photo ne serait visible.
    """
    minimum_alpha, _ = image.getchannel("A").getextrema()
    if minimum_alpha < 255:
        return
    raise HTTPException(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=(
            "image entièrement opaque : un tel overlay masquerait la photo. "
            "Exporter en PNG avec un fond transparent."
        ),
    )


MAX_OVERLAY_RATIO_DRIFT = 0.05


def _normalize_overlay_ratio(image: Image.Image, runtime: Runtime) -> Image.Image:
    """Accepte un petit écart de proportions et le corrige par un recadrage central."""
    target = runtime.event.aspect_ratio
    width, height = image.size
    current = width / height
    same_orientation = (current > 1) == (target > 1)
    relative_drift = abs(current - target) / target
    if same_orientation and relative_drift <= MAX_OVERLAY_RATIO_DRIFT:
        return crop_to_aspect(image, target)

    raise HTTPException(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=(
            f"format incompatible : overlay au ratio {current:.3f} ({width}×{height}), "
            f"sortie au ratio {target:.3f} pour « {runtime.event.config.print_format.name} ». "
            "Utiliser une image de même orientation et de proportions proches."
        ),
    )


# --- Galerie de l'événement ------------------------------------------------------------

# Une page de grille. Borné parce que la valeur vient de l'URL : sans plafond, un `limit`
# démesuré ferait produire des centaines de vignettes pour une seule requête.
DEFAULT_PAGE_SIZE = 24
MAX_PAGE_SIZE = 100


class GalleryPage(BaseModel):
    """Le total accompagne la tranche : sans lui le frontend ne peut pas paginer."""

    total: int
    entries: list[GalleryEntry]


@router.get("/gallery", response_model=GalleryPage)
def read_gallery(
    offset: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    runtime: Runtime = Depends(get_runtime),
) -> GalleryPage:
    total, entries = list_sessions(runtime.settings.sessions_dir, offset=offset, limit=limit)
    return GalleryPage(total=total, entries=entries)


@router.get("/gallery/archive.zip")
def download_archive(runtime: Runtime = Depends(get_runtime)) -> StreamingResponse:
    """Toutes les photos de l'événement, en flux.

    Déclarée avant les routes à paramètre pour que « archive.zip » ne soit jamais pris
    pour un identifiant de session.

    Pas de `limit` ici, volontairement : l'archive de l'événement est l'archive de
    l'événement. C'est précisément pour pouvoir la servir entière sans la construire que
    `zip_stream` existe.
    """
    _, entries = list_sessions(runtime.settings.sessions_dir, offset=0, limit=_ALL)
    photos = [
        (entry.archive_name, runtime.settings.sessions_dir / entry.session_id / FINAL_NAME)
        for entry in entries
    ]
    name = f"{_slug(runtime.event.config.event_name)}.zip"
    logger.info("archive demandée : %d photo(s), %s", len(photos), name)
    return StreamingResponse(
        zip_stream(photos),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/gallery/{session_id}/thumbnail")
def read_thumbnail(session_id: str, runtime: Runtime = Depends(get_runtime)) -> Response:
    """Vignette produite à la demande, pas de fichier de cache à invalider."""
    return Response(
        content=thumbnail_jpeg(_photo_path(runtime, session_id)),
        media_type="image/jpeg",
        # Une minute : assez pour une pagination aller-retour, assez peu pour qu'un
        # `retake` sur la session en cours ne laisse pas une vignette périmée à l'écran.
        headers={"Cache-Control": "max-age=60"},
    )


@router.get("/gallery/{session_id}/photo")
def download_photo(session_id: str, runtime: Runtime = Depends(get_runtime)) -> FileResponse:
    """Téléchargement unitaire. Starlette se charge de l'encodage du nom de fichier."""
    return FileResponse(
        _photo_path(runtime, session_id),
        media_type="image/jpeg",
        filename=f"{_slug(runtime.event.config.event_name)}-{session_id}.jpg",
    )


@router.get("/gallery/{session_id}/view")
def view_photo(session_id: str, runtime: Runtime = Depends(get_runtime)) -> FileResponse:
    """Photo plein format affichable dans la lightbox, sans téléchargement forcé."""
    return FileResponse(
        _photo_path(runtime, session_id),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.delete("/gallery/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(session_id: str, runtime: Runtime = Depends(get_runtime)) -> Response:
    """Supprime définitivement toute la session associée à une photo.

    La session courante est protégée même si elle porte déjà un ``final.jpg`` : supprimer
    sous les pieds du kiosque ferait échouer un changement de filtre ou la confirmation.
    """
    active = runtime.machine.session
    if active is not None and active.id == session_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="impossible de supprimer la session en cours",
        )

    directory = _photo_path(runtime, session_id).parent
    try:
        shutil.rmtree(directory)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="photo introuvable") from None
    logger.info("session %s supprimée depuis la galerie", session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Sentinelle de tranche : `list_sessions` prend un `limit` obligatoire, et l'archive en
# veut la totalité.
_ALL = 1 << 30


def _photo_path(runtime: Runtime, session_id: str) -> Path:
    """Résout un identifiant de session en chemin, ou 404.

    Frontière de confiance, et le seul endroit où elle est franchie : les trois routes de
    la galerie passent par ici. `session_id` vient de l'URL, donc « .. », un chemin absolu
    ou un lien symbolique doivent tous mener au même refus. `resolve()` avant la
    comparaison est ce qui couvre les trois d'un coup.
    """
    root = runtime.settings.sessions_dir.resolve()
    path = (root / session_id / FINAL_NAME).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="photo introuvable")
    return path


def _slug(name: str) -> str:
    """Nom d'événement réduit à ce qui traverse sans dommage un nom de fichier.

    « Mariage Camille & Théo » devient « Mariage-Camille-Theo ». La substitution par
    groupes est ce qui évite « Camille--Theo » là où l'esperluette a disparu.

    L'alternative — garder l'UTF-8 et encoder l'en-tête selon la RFC 5987 — vaudrait pour
    un nom qu'on veut exact ; ici c'est un nom de fichier dans un dossier de
    téléchargements.
    """
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "-", ascii_only).strip("-") or "evenement"


# --- Découverte des caméras -------------------------------------------------------------


class CameraScan(BaseModel):
    """Deux listes, délibérément non appariées.

    Aucune API ne garantit que le troisième nom rendu par le système corresponde à l'index
    2 d'OpenCV. L'ordre coïncide souvent, et « souvent » n'a pas sa place dans une
    interface d'exploitation : un opérateur à qui on a menti sur un appariement débranche
    la mauvaise caméra.
    """

    probed: list[ProbedCamera]
    system_names: list[str]
    # Index détenu par le kiosque, donc non sondé : un capteur n'accepte qu'un propriétaire.
    skipped_index: int | None


@router.post("/cameras/scan", response_model=CameraScan)
def scan_cameras(runtime: Runtime = Depends(get_runtime)) -> CameraScan:
    """Sonde les index de caméra, sur action explicite de l'opérateur.

    `POST` et non `GET` parce que le sondage a un effet de bord bien réel : il ouvre chaque
    périphérique tour à tour. Jamais au démarrage, jamais au chargement de la page — un
    `GET` finirait par être appelé par un rafraîchissement automatique ou un préchargement
    de navigateur, et volerait le capteur au kiosque en pleine soirée.

    macOS journalise une erreur par index qui n'ouvre pas. Bruit attendu, pas une panne.
    """
    skipped = _kiosk_index(runtime)
    return CameraScan(
        probed=probe_indices(skip=skipped),
        system_names=system_camera_names(),
        skipped_index=skipped,
    )


def _kiosk_index(runtime: Runtime) -> int | None:
    """L'index que le kiosque occupe, s'il en occupe un.

    Seul le driver webcam en réserve un. Le capteur CSI du Pi n'a pas de sélection à faire,
    et la mire de synthèse n'ouvre aucun périphérique — dans les deux cas il n'y a rien à
    épargner, et tous les index sont sondables.
    """
    if runtime.camera.get_capabilities().driver_name != "opencv":
        return None
    device = runtime.settings.camera_device
    return device if isinstance(device, int) else None
