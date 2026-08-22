"""API du portail d'administration, exposée sur le LAN.

Squelette au jalon 1 : il n'existe que pour que l'architecture à deux sockets soit
exercée et testable dès maintenant (notamment l'isolation réseau). Config d'événement,
upload d'overlay et galerie arrivent au jalon 5.

Pas d'authentification : risque assumé, l'accès est censé rester limité au LAN pendant un
événement. À revoir si l'usage sort de ce cadre.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dropyourmoment.api.kiosk_router import get_runtime
from dropyourmoment.core.session import SessionState
from dropyourmoment.runtime import Runtime

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
