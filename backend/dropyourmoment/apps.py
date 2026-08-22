"""Construction des deux applications FastAPI servies par le même process."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from dropyourmoment.api import admin_router, kiosk_router
from dropyourmoment.runtime import Runtime

logger = logging.getLogger(__name__)


def build_kiosk_app(runtime: Runtime) -> FastAPI:
    app = FastAPI(title="Drop Your Moment — kiosque", lifespan=_ticker_lifespan)
    app.state.runtime = runtime
    app.include_router(kiosk_router.router)
    _mount_frontend(app, runtime.settings.frontend_dist_dir, document="index.html")
    return app


def build_admin_app(runtime: Runtime) -> FastAPI:
    app = FastAPI(title="Drop Your Moment — administration")
    app.state.runtime = runtime
    app.include_router(admin_router.router)
    _mount_frontend(app, runtime.settings.frontend_dist_dir, document="admin.html")
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


def _mount_frontend(app: FastAPI, directory: Path, document: str) -> None:
    """Sert le frontend construit à la racine, après les routes d'API.

    Les deux applications servent le même répertoire mais un document différent : un
    build Vite unique produit `index.html` (kiosque) et `admin.html` (administration),
    tous deux appuyés sur les mêmes fichiers d'`assets/`.

    Absent en test ou tant que `npm run build` n'a pas tourné : on n'échoue pas pour
    autant, l'API reste utilisable seule.
    """
    if not directory.is_dir():
        logger.warning("frontend non construit : %s (lancer `npm run build`)", directory)
        return

    entrypoint = directory / document
    if not entrypoint.is_file():
        logger.warning("point d'entrée absent du build : %s", entrypoint)
        return

    # Route explicite avant le montage : Starlette résout dans l'ordre de déclaration,
    # donc la racine renvoie le bon document tandis que le montage sert les assets.
    @app.get("/", include_in_schema=False)
    async def _index() -> FileResponse:
        return FileResponse(entrypoint)

    app.mount("/", StaticFiles(directory=directory), name="frontend")
