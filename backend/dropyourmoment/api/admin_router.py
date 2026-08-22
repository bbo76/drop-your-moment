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

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dropyourmoment.api.kiosk_router import get_runtime
from dropyourmoment.core.event_config import EventConfig
from dropyourmoment.core.session import SessionState
from dropyourmoment.runtime import Runtime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin")


class AdminHealth(BaseModel):
    camera_ok: bool
    camera_driver: str
    session_state: SessionState
    event_name: str
    print_format_name: str
    print_aspect_ratio: float


@router.get("/system/health", response_model=AdminHealth)
def read_health(runtime: Runtime = Depends(get_runtime)) -> AdminHealth:
    caps = runtime.camera.get_capabilities()
    return AdminHealth(
        camera_ok=runtime.camera.is_available(),
        camera_driver=caps.driver_name,
        session_state=runtime.machine.state,
        event_name=runtime.event.config.event_name,
        print_format_name=runtime.event.config.print_format.name,
        print_aspect_ratio=runtime.event.config.print_format.aspect_ratio,
    )


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
