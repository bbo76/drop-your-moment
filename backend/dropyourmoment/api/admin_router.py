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
import shutil
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from dropyourmoment.api.kiosk_router import get_runtime
from dropyourmoment.core.event_config import OVERLAY_FILENAME, EventConfig
from dropyourmoment.core.session import SessionState
from dropyourmoment.imaging.steps import overlay_matches_ratio
from dropyourmoment.runtime import Runtime
from dropyourmoment.storage.atomic import write_atomic
from dropyourmoment.storage.counters import Counters

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
    )


@router.post("/counters/reset", response_model=CounterReading)
def reset_cartridge_counter(runtime: Runtime = Depends(get_runtime)) -> CounterReading:
    """Réarme le compteur de cartouche. Le cumul de l'événement ne bouge pas.

    Le bouton sans lequel le second compteur n'aurait aucune raison d'exister : il
    vaudrait toujours exactement le cumul.
    """
    return _reading(runtime.counters.reset_cartridge())


def _reading(counters: Counters) -> CounterReading:
    # `vars()` plutôt qu'une recopie champ par champ : les deux structures sont un miroir
    # l'une de l'autre, et un champ ajouté d'un côté seulement lèvera au lieu de manquer
    # en silence.
    return CounterReading(**vars(counters))


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
    _reject_if_wrong_ratio(image, runtime)

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


def _reject_if_wrong_ratio(image: Image.Image, runtime: Runtime) -> None:
    """Le format de sortie est l'autorité : c'est lui qui fixe le ratio attendu."""
    target = runtime.event.aspect_ratio
    if overlay_matches_ratio(image.size, target):
        return

    width, height = image.size
    raise HTTPException(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=(
            f"overlay au ratio {width / height:.3f} ({width}×{height}), "
            f"attendu {target:.3f} pour le format « {runtime.event.config.print_format.name} ». "
            "Recadrer ou réexporter avant de téléverser."
        ),
    )
