"""Maintenance tactile locale, protégée par PIN et absente de la socket LAN."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from dropyourmoment.api.admin_router import (
    AdminHealth,
    CounterReading,
    GalleryPage,
    _photo_path,
    _reading,
    read_health,
)
from dropyourmoment.api.kiosk_router import get_runtime
from dropyourmoment.core.event_config import LaunchFont
from dropyourmoment.runtime import Runtime
from dropyourmoment.storage.gallery import list_sessions, thumbnail_jpeg

router = APIRouter(prefix="/api/maintenance")
COOKIE_NAME = "dym_maintenance"


class PinAttempt(BaseModel):
    pin: str = Field(pattern=r"^\d{4,8}$")


class MaintenanceSettings(BaseModel):
    copies_per_print: int = Field(ge=1, le=10)
    default_shot_timer_seconds: Literal[3, 5, 10]
    screen_flash_enabled: bool
    accent_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    launch_font: LaunchFont


class MaintenanceSnapshot(BaseModel):
    health: AdminHealth
    settings: MaintenanceSettings


def _authorized(
    runtime: Runtime = Depends(get_runtime),
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Runtime:
    if not runtime.authorize_maintenance(token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="session de maintenance expirée")
    return runtime


@router.post("/unlock", status_code=status.HTTP_204_NO_CONTENT)
def unlock(
    attempt: PinAttempt, response: Response, runtime: Runtime = Depends(get_runtime)
) -> None:
    token = runtime.unlock_maintenance(attempt.pin)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="code incorrect")
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(runtime.settings.maintenance_session_timeout_s),
        httponly=True,
        samesite="strict",
        secure=False,  # socket locale en HTTP ; le cookie ne quitte jamais la borne
        path="/api/maintenance",
    )


@router.post("/lock", status_code=status.HTTP_204_NO_CONTENT)
def lock(response: Response, runtime: Runtime = Depends(_authorized)) -> None:
    runtime.lock_maintenance()
    response.delete_cookie(COOKIE_NAME, path="/api/maintenance")


@router.get("/status", response_model=MaintenanceSnapshot)
def maintenance_status(runtime: Runtime = Depends(_authorized)) -> MaintenanceSnapshot:
    config = runtime.event.config
    return MaintenanceSnapshot(
        health=read_health(runtime),
        settings=MaintenanceSettings(
            copies_per_print=config.copies_per_print,
            default_shot_timer_seconds=config.default_shot_timer_seconds,
            screen_flash_enabled=config.screen_flash_enabled,
            accent_color=config.accent_color,
            launch_font=config.launch_font,
        ),
    )


@router.put("/settings", response_model=MaintenanceSettings)
def update_settings(
    settings: MaintenanceSettings, runtime: Runtime = Depends(_authorized)
) -> MaintenanceSettings:
    updated = runtime.event.config.model_copy(update=settings.model_dump())
    runtime.event_store.save_config(updated)
    runtime.reload_event()
    return settings


class PaperStockChange(BaseModel):
    capacity: int = Field(ge=1, le=9_999)


class InkCartridgeChange(BaseModel):
    capacity: Literal[36, 54]


@router.post("/paper-stock", response_model=CounterReading)
def set_paper_stock(
    change: PaperStockChange, runtime: Runtime = Depends(_authorized)
) -> CounterReading:
    return _reading(runtime.counters.set_paper_stock(change.capacity))


@router.post("/cassette/reload", response_model=CounterReading)
def reload_paper_cassette(runtime: Runtime = Depends(_authorized)) -> CounterReading:
    return _reading(runtime.counters.reload_cassette())


@router.post("/ink/replace", response_model=CounterReading)
def replace_ink_cartridge(
    change: InkCartridgeChange, runtime: Runtime = Depends(_authorized)
) -> CounterReading:
    return _reading(runtime.counters.replace_ink_cartridge(change.capacity))


@router.get("/gallery", response_model=GalleryPage)
def read_gallery(
    offset: int = Query(0, ge=0),
    limit: int = Query(8, ge=1, le=24),
    runtime: Runtime = Depends(_authorized),
) -> GalleryPage:
    total, entries = list_sessions(runtime.settings.sessions_dir, offset=offset, limit=limit)
    return GalleryPage(total=total, entries=entries)


@router.get("/gallery/{session_id}/thumbnail")
def read_gallery_thumbnail(session_id: str, runtime: Runtime = Depends(_authorized)) -> Response:
    return Response(
        content=thumbnail_jpeg(_photo_path(runtime, session_id)),
        media_type="image/jpeg",
        headers={"Cache-Control": "max-age=60"},
    )


@router.get("/gallery/{session_id}/view")
def read_gallery_photo(session_id: str, runtime: Runtime = Depends(_authorized)) -> FileResponse:
    return FileResponse(
        _photo_path(runtime, session_id),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )
