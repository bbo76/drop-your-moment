"""Construction des deux applications FastAPI servies par le même process."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from dropyourmoment.api import admin_router, kiosk_router
from dropyourmoment.runtime import Runtime

logger = logging.getLogger(__name__)


def build_kiosk_app(runtime: Runtime) -> FastAPI:
    app = FastAPI(title="Drop Your Moment — kiosque", lifespan=_ticker_lifespan)
    app.state.runtime = runtime
    app.include_router(kiosk_router.router)
    _mount_frontend(app, runtime.settings.kiosk_frontend_dir)
    return app


def build_admin_app(runtime: Runtime) -> FastAPI:
    app = FastAPI(title="Drop Your Moment — administration")
    app.state.runtime = runtime
    app.include_router(admin_router.router)
    _mount_frontend(app, runtime.settings.admin_frontend_dir)
    return app


def build_apps(runtime: Runtime) -> tuple[FastAPI, FastAPI]:
    return build_kiosk_app(runtime), build_admin_app(runtime)


@contextlib.asynccontextmanager
async def _ticker_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Applique périodiquement les timeouts d'inactivité.

    Filet de sécurité : `tick()` est déjà appelé à chaque lecture de statut, mais si le
    frontend cesse d'interroger le backend (onglet planté, écran figé), c'est ce ticker
    qui ramène la borne au repos.
    """
    runtime: Runtime = app.state.runtime
    task = asyncio.create_task(_tick_forever(runtime))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


async def _tick_forever(runtime: Runtime) -> None:
    interval = runtime.settings.tick_interval_s
    while True:
        await asyncio.sleep(interval)
        if runtime.machine.tick():
            logger.info("timeout d'inactivité — retour à %s", runtime.machine.state)


def _mount_frontend(app: FastAPI, directory: Path) -> None:
    """Sert le frontend statique à la racine, après les routes d'API.

    Absent en test ou avant que le frontend existe : on n'échoue pas pour autant, l'API
    reste utilisable seule.
    """
    if not directory.is_dir():
        logger.warning("frontend absent : %s", directory)
        return
    app.mount("/", StaticFiles(directory=directory, html=True), name="frontend")
