"""Maintenance tactile locale, protégée par PIN et absente de la socket LAN."""

from __future__ import annotations

import shutil
import subprocess
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
from dropyourmoment.core.errors import PrinterError
from dropyourmoment.core.event_config import LaunchFont
from dropyourmoment.core.session import SessionState
from dropyourmoment.hotspot import WifiNetwork, WifiProfile, development_portal_url
from dropyourmoment.journal import (
    JournalComponent,
    JournalLevel,
    JournalPage,
    JournalUnavailable,
    read_journal,
)
from dropyourmoment.runtime import Runtime
from dropyourmoment.storage.gallery import list_sessions, thumbnail_jpeg
from dropyourmoment.system_power import PowerAction

router = APIRouter(prefix="/api/maintenance")
COOKIE_NAME = "dym_maintenance"


class PinAttempt(BaseModel):
    pin: str = Field(pattern=r"^\d{4,8}$")


class MaintenanceSettings(BaseModel):
    default_shot_timer_seconds: Literal[3, 5, 10]
    screen_flash_enabled: bool
    accent_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    launch_font: LaunchFont


class HotspotStatus(BaseModel):
    available: bool
    active: bool
    ssid: str
    secret: str | None
    admin_code: str | None
    portal_url: str
    client_count: int


class WifiStatus(BaseModel):
    available: bool
    mode: Literal["hotspot", "client", "offline"]
    ssid: str | None
    connectivity: Literal["full", "limited", "portal", "none", "unknown"]


class WifiNetworkStatus(BaseModel):
    ssid: str
    signal: int
    security: str
    active: bool
    profile: str | None


class WifiProfileStatus(BaseModel):
    name: str
    ssid: str


class WifiCredentials(BaseModel):
    ssid: str = Field(min_length=1, max_length=32)
    password: str | None = Field(default=None, min_length=8, max_length=63)
    profile: str | None = Field(default=None, min_length=1, max_length=255)
    hidden: bool = False


class WifiProfileRequest(BaseModel):
    profile: str = Field(min_length=1, max_length=255)


class MaintenanceSnapshot(BaseModel):
    health: AdminHealth
    settings: MaintenanceSettings
    power_available: bool
    print_busy: bool
    print_error: str | None
    hotspot: HotspotStatus
    wifi: WifiStatus


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
    runtime.print_flow.poll()
    config = runtime.event.config
    return MaintenanceSnapshot(
        health=read_health(runtime),
        settings=MaintenanceSettings(
            default_shot_timer_seconds=config.default_shot_timer_seconds,
            screen_flash_enabled=config.screen_flash_enabled,
            accent_color=config.accent_color,
            launch_font=config.launch_font,
        ),
        power_available=runtime.system_power.available,
        print_busy=runtime.print_flow.job is not None,
        print_error=runtime.print_flow.last_error,
        hotspot=_hotspot_status(runtime),
        wifi=WifiStatus.model_validate(runtime.hotspot.wifi_status()),
    )


@router.get("/journal", response_model=JournalPage)
def maintenance_journal(
    offset: int = Query(0, ge=0, le=1_000),
    limit: int = Query(40, ge=1, le=80),
    incidents: bool = False,
    level: JournalLevel | None = None,
    component: JournalComponent | None = None,
    runtime: Runtime = Depends(_authorized),
) -> JournalPage:
    del runtime  # l'injection porte l'autorisation locale ; la lecture reste sans état.
    try:
        return read_journal(
            offset=offset,
            limit=limit,
            incidents=incidents,
            level=level,
            component=component,
            detail=False,
        )
    except JournalUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


def _hotspot_status(runtime: Runtime) -> HotspotStatus:
    development = not runtime.hotspot.available
    return HotspotStatus(
        available=runtime.hotspot.available and runtime.hotspot.secret is not None,
        active=runtime.hotspot.active(),
        ssid=runtime.hotspot.ssid,
        secret=runtime.hotspot.secret
        or (runtime.settings.hotspot_development_secret if development else None),
        admin_code=runtime.operator_access.code,
        portal_url=(
            development_portal_url(
                runtime.settings.admin_port,
                runtime.settings.hotspot_development_portal_url,
            )
            if development
            else runtime.hotspot.portal_url
        ),
        client_count=runtime.hotspot.client_count(),
    )


@router.post("/hotspot/{action}", response_model=HotspotStatus)
def change_hotspot(
    action: Literal["activate", "deactivate"],
    runtime: Runtime = Depends(_authorized),
) -> HotspotStatus:
    try:
        if action == "activate":
            runtime.hotspot.activate()
        else:
            runtime.hotspot.deactivate()
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return _hotspot_status(runtime)


@router.get("/wifi/scan", response_model=list[WifiNetworkStatus])
def scan_wifi(runtime: Runtime = Depends(_authorized)) -> list[WifiNetwork]:
    try:
        return runtime.hotspot.scan_wifi()
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/wifi/profiles", response_model=list[WifiProfileStatus])
def wifi_profiles(runtime: Runtime = Depends(_authorized)) -> list[WifiProfile]:
    try:
        return runtime.hotspot.wifi_profiles()
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.post("/wifi/connect", response_model=WifiStatus)
def connect_wifi(
    credentials: WifiCredentials,
    runtime: Runtime = Depends(_authorized),
) -> WifiStatus:
    try:
        runtime.hotspot.connect_wifi(
            credentials.ssid,
            credentials.password,
            profile=credentials.profile,
            hidden=credentials.hidden,
        )
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return WifiStatus.model_validate(runtime.hotspot.wifi_status())


@router.post("/wifi/disconnect", response_model=WifiStatus)
def disconnect_wifi(runtime: Runtime = Depends(_authorized)) -> WifiStatus:
    try:
        runtime.hotspot.disconnect_wifi()
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return WifiStatus.model_validate(runtime.hotspot.wifi_status())


@router.post("/wifi/forget", status_code=status.HTTP_204_NO_CONTENT)
def forget_wifi(
    request: WifiProfileRequest,
    runtime: Runtime = Depends(_authorized),
) -> None:
    try:
        runtime.hotspot.forget_wifi(request.profile)
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/hotspot/qr/{kind}")
def hotspot_qr(
    kind: Literal["wifi", "portal"], runtime: Runtime = Depends(_authorized)
) -> Response:
    development = not runtime.hotspot.available
    secret = runtime.hotspot.secret or (
        runtime.settings.hotspot_development_secret if development else None
    )
    if secret is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="secret Wi-Fi absent")
    content = (
        f"WIFI:T:WPA;S:{runtime.hotspot.ssid};P:{secret};;"
        if kind == "wifi"
        else (
            development_portal_url(
                runtime.settings.admin_port,
                runtime.settings.hotspot_development_portal_url,
            )
            if development
            else runtime.hotspot.portal_url
        )
    )
    try:
        return Response(runtime.hotspot.qr_png(content), media_type="image/png")
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.post("/power/{action}", status_code=status.HTTP_202_ACCEPTED)
def request_power_action(action: PowerAction, runtime: Runtime = Depends(_authorized)) -> None:
    if runtime.machine.state is not SessionState.IDLE or runtime.print_flow.job is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="une session photo ou une impression est en cours",
        )
    if not runtime.system_power.available:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="action disponible uniquement sur Raspberry Pi avec systemd",
        )
    try:
        if action == "poweroff" and runtime.hotspot.active():
            runtime.hotspot.deactivate()
        runtime.system_power.request(action)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except (OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="la commande système a échoué",
        ) from exc


@router.put("/settings", response_model=MaintenanceSettings)
def update_settings(
    settings: MaintenanceSettings, runtime: Runtime = Depends(_authorized)
) -> MaintenanceSettings:
    updated = runtime.event.config.model_copy(update=settings.model_dump())
    runtime.event_store.save_config(updated)
    runtime.reload_event()
    return settings


class InkCartridgeChange(BaseModel):
    capacity: Literal[36, 54]


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


class GalleryPrintRequest(BaseModel):
    copies: int = Field(ge=1, le=10)


@router.post("/gallery/{session_id}/print", status_code=status.HTTP_202_ACCEPTED)
def print_gallery_photo(
    session_id: str,
    request: GalleryPrintRequest,
    runtime: Runtime = Depends(_authorized),
) -> None:
    if runtime.machine.state is not SessionState.IDLE:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="une session photo est en cours")
    try:
        runtime.print_flow.submit(
            _photo_path(runtime, session_id), request.copies, complete_session=False
        )
    except PrinterError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.delete("/gallery/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gallery_photo(session_id: str, runtime: Runtime = Depends(_authorized)) -> Response:
    path = _photo_path(runtime, session_id)
    if runtime.print_flow.source_path == path:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="attendez la fin de l'impression avant de supprimer cette photo",
        )
    shutil.rmtree(path.parent)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
