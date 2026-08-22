"""Point d'entrée : un process, deux sockets.

Le kiosque écoute sur la boucle locale, l'administration sur le LAN. L'isolation réseau
vient de ces deux adresses de bind, pas d'une frontière de process — et rester dans un
seul process garantit un unique propriétaire du capteur et un unique état en mémoire.
"""

from __future__ import annotations

import asyncio
import logging
import signal

import uvicorn

from dropyourmoment.apps import build_apps
from dropyourmoment.config import Settings, load_settings
from dropyourmoment.runtime import Runtime

logger = logging.getLogger(__name__)


def _build_servers(settings: Settings, runtime: Runtime) -> list[uvicorn.Server]:
    kiosk_app, admin_app = build_apps(runtime)
    configs = [
        uvicorn.Config(
            kiosk_app,
            host=settings.kiosk_host,
            port=settings.kiosk_port,
            log_level="info",
            access_log=False,  # le flux MJPEG noierait les logs
        ),
        uvicorn.Config(
            admin_app,
            host=settings.admin_host,
            port=settings.admin_port,
            log_level="info",
        ),
    ]
    servers = [uvicorn.Server(config) for config in configs]
    for server in servers:
        # uvicorn installe ses propres gestionnaires de signaux au démarrage ; avec deux
        # serveurs dans la même boucle, le second écrase le premier et Ctrl+C n'arrêterait
        # qu'une moitié du process. On les neutralise et on gère l'arrêt en un point.
        server.install_signal_handlers = lambda: None  # type: ignore[method-assign]
    return servers


def _install_shutdown(servers: list[uvicorn.Server]) -> None:
    loop = asyncio.get_running_loop()

    def request_stop() -> None:
        logger.info("arrêt demandé — fermeture des deux serveurs")
        for server in servers:
            server.should_exit = True

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, request_stop)


async def serve() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s — %(message)s",
    )
    settings = load_settings()
    runtime = Runtime.build(settings)
    runtime.start()

    caps = runtime.camera.get_capabilities()
    logger.info(
        "caméra « %s » — still %s, preview %s | kiosque http://%s:%d | admin http://%s:%d",
        caps.driver_name,
        caps.still_size,
        caps.preview_size,
        settings.kiosk_host,
        settings.kiosk_port,
        settings.admin_host,
        settings.admin_port,
    )

    servers = _build_servers(settings, runtime)
    _install_shutdown(servers)
    try:
        await asyncio.gather(*(server.serve() for server in servers))
    finally:
        runtime.stop()
        logger.info("arrêté proprement")


def main() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    main()
