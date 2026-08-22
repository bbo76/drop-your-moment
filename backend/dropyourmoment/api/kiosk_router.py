"""API consommée par l'écran tactile.

Exposée uniquement sur la boucle locale. Le frontend est un afficheur : il lit l'état,
déclenche des transitions, et ne détient aucune règle de parcours.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from dropyourmoment.core.session import SessionState
from dropyourmoment.runtime import Runtime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

MJPEG_BOUNDARY = "dymframe"


def get_runtime(request: Request) -> Runtime:
    """Le Runtime est un singleton du process, jamais reconstruit par requête.

    Passe par `Depends` uniquement pour que les tests puissent le remplacer via
    `app.dependency_overrides`.
    """
    return request.app.state.runtime


class SessionStatus(BaseModel):
    state: SessionState
    session_id: str | None = None
    selected_filter: str | None = None
    remaining_seconds: float | None = None
    error: str | None = None


class SystemStatus(BaseModel):
    camera_ok: bool
    camera_driver: str
    preview_size: tuple[int, int]
    still_size: tuple[int, int]
    print_format_name: str
    print_aspect_ratio: float


def _status(runtime: Runtime) -> SessionStatus:
    machine = runtime.machine
    # tick() à chaque lecture : l'état reste juste même si le ticker de fond est en
    # retard, et les tests n'ont pas besoin de faire tourner une boucle asyncio.
    machine.tick()
    session = machine.session
    return SessionStatus(
        state=machine.state,
        session_id=session.id if session else None,
        selected_filter=session.selected_filter if session else None,
        remaining_seconds=machine.remaining_seconds(),
        error=machine.last_error,
    )


@router.get("/status", response_model=SessionStatus)
def read_status(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    return _status(runtime)


@router.get("/system/status", response_model=SystemStatus)
def read_system_status(runtime: Runtime = Depends(get_runtime)) -> SystemStatus:
    caps = runtime.camera.get_capabilities()
    return SystemStatus(
        camera_ok=runtime.camera.is_available(),
        camera_driver=caps.driver_name,
        preview_size=caps.preview_size,
        still_size=caps.still_size,
        print_format_name=runtime.print_format.name,
        print_aspect_ratio=runtime.print_format.aspect_ratio,
    )


@router.post("/session", response_model=SessionStatus)
def start_session(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Ouvre une session, en écrasant celle en cours s'il en reste une abandonnée."""
    session = runtime.machine.start()
    logger.info("session %s démarrée", session.id)
    return _status(runtime)


@router.post("/session/cancel", response_model=SessionStatus)
def cancel_session(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    runtime.machine.reset()
    return _status(runtime)


@router.get("/preview/stream")
def preview_stream(runtime: Runtime = Depends(get_runtime)) -> StreamingResponse:
    """Flux MJPEG affichable directement dans une balise `<img>`.

    Starlette itère un générateur synchrone dans un threadpool, donc la cadence imposée
    par le driver ne bloque pas la boucle d'événements.
    """
    return StreamingResponse(
        _mjpeg_frames(runtime),
        media_type=f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY}",
        headers={
            # Sans cela Chromium peut resservir une frame mise en cache au retour sur
            # l'écran preview, ce qui se voit à l'écran comme une image gelée.
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Age": "0",
        },
    )


def _mjpeg_frames(runtime: Runtime) -> Iterator[bytes]:
    header = f"--{MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\n".encode()
    for frame in runtime.camera.preview_frames():
        yield header + f"Content-Length: {len(frame)}\r\n\r\n".encode() + frame + b"\r\n"
