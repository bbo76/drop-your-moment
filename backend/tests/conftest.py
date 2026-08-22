from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
import uvicorn
from fastapi.testclient import TestClient

from dropyourmoment.apps import build_admin_app, build_kiosk_app
from dropyourmoment.config import Settings
from dropyourmoment.core.event_config import EventStore
from dropyourmoment.core.session import SessionMachine
from dropyourmoment.hardware.camera.factory import CameraDriverName
from dropyourmoment.hardware.camera.mock_driver import MockCameraDriver
from dropyourmoment.hardware.printer.base import PrinterDriver
from dropyourmoment.hardware.printer.null_driver import NullPrinterDriver
from dropyourmoment.runtime import Runtime


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Réglages isolés : chaque test écrit dans son propre répertoire de données."""
    return Settings(
        camera_driver=CameraDriverName.MOCK,
        data_dir=tmp_path / "data",
        frontend_dist_dir=tmp_path / "dist-absent",
    )


@pytest.fixture
def camera() -> MockCameraDriver:
    return MockCameraDriver(fps=60)  # cadence relevée pour ne pas ralentir les tests


@pytest.fixture
def printer() -> PrinterDriver:
    """Surchargeable par un test qui veut un tirage lent ou en panne."""
    return NullPrinterDriver()


@pytest.fixture
def runtime(
    settings: Settings, camera: MockCameraDriver, printer: PrinterDriver
) -> Iterator[Runtime]:
    store = EventStore(settings.event_dir)
    runtime = Runtime(
        settings=settings,
        camera=camera,
        printer=printer,
        machine=SessionMachine(timeouts=settings.state_timeouts()),
        event_store=store,
        event=store.load(),
    )
    runtime.start()
    yield runtime
    runtime.stop()


@pytest.fixture
def kiosk(runtime: Runtime) -> Iterator[TestClient]:
    with TestClient(build_kiosk_app(runtime)) as client:
        yield client


@pytest.fixture
def admin(runtime: Runtime) -> Iterator[TestClient]:
    with TestClient(build_admin_app(runtime)) as client:
        yield client


@pytest.fixture
def kiosk_url(runtime: Runtime) -> Iterator[str]:
    """Vrai serveur uvicorn sur un port éphémère.

    `TestClient` ne convient pas au flux MJPEG : il n'y a pas de vraie déconnexion
    réseau, donc l'application continue à tirer des frames d'un générateur infini et
    l'arrêt du client ne se termine jamais. Or la fermeture du flux à la déconnexion est
    exactement ce qu'on veut vérifier — il faut donc une vraie socket.
    """
    server = uvicorn.Server(
        uvicorn.Config(
            build_kiosk_app(runtime),
            host="127.0.0.1",
            port=0,
            log_level="warning",
            access_log=False,
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 10.0
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.02)
    assert server.started, "le serveur de test n'a pas démarré"

    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=10)
