"""Les deux applications servent le même build, mais un document différent.

Un seul projet Vite produit `index.html` (kiosque) et `admin.html` (administration),
appuyés sur des `assets/` communs. Ce câblage casse silencieusement — on obtient une page
blanche, ou le kiosque qui sert l'administration — d'où ces garde-fous.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from dropyourmoment.apps import build_admin_app, build_kiosk_app
from dropyourmoment.config import Settings
from dropyourmoment.core.print_format import BUILTIN_FORMATS, DEFAULT_FORMAT_KEY
from dropyourmoment.core.session import SessionMachine
from dropyourmoment.hardware.camera.mock_driver import MockCameraDriver
from dropyourmoment.runtime import Runtime


@pytest.fixture
def built_runtime(tmp_path: Path) -> Runtime:
    """Runtime pointant sur un faux build Vite, avec les deux points d'entrée."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<title>kiosque</title>")
    (dist / "admin.html").write_text("<title>administration</title>")
    (dist / "assets" / "app.css").write_text("body{color:red}")

    settings = Settings(data_dir=tmp_path / "data", frontend_dist_dir=dist)
    return Runtime(
        settings=settings,
        camera=MockCameraDriver(fps=60),
        machine=SessionMachine(timeouts=settings.state_timeouts()),
        print_format=BUILTIN_FORMATS[DEFAULT_FORMAT_KEY],
    )


def test_le_kiosque_sert_son_propre_document(built_runtime: Runtime) -> None:
    with TestClient(build_kiosk_app(built_runtime)) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert "kiosque" in response.text


def test_l_admin_sert_son_propre_document(built_runtime: Runtime) -> None:
    with TestClient(build_admin_app(built_runtime)) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert "administration" in response.text, "l'admin ne doit pas servir le kiosque"


def test_les_assets_partages_sont_servis(built_runtime: Runtime) -> None:
    """Les deux documents référencent le même répertoire d'assets."""
    for build_app in (build_kiosk_app, build_admin_app):
        with TestClient(build_app(built_runtime)) as client:
            response = client.get("/assets/app.css")

        assert response.status_code == 200
        assert "color:red" in response.text


def test_l_api_reste_prioritaire_sur_le_frontend(built_runtime: Runtime) -> None:
    """Le montage à la racine ne doit pas masquer les routes d'API."""
    with TestClient(build_kiosk_app(built_runtime)) as client:
        assert client.get("/api/status").status_code == 200

    with TestClient(build_admin_app(built_runtime)) as client:
        assert client.get("/admin/system/health").status_code == 200


def test_backend_utilisable_sans_frontend_construit(tmp_path: Path) -> None:
    """Tant que `npm run build` n'a pas tourné, l'API doit rester exploitable."""
    settings = Settings(data_dir=tmp_path / "data", frontend_dist_dir=tmp_path / "absent")
    runtime = Runtime(
        settings=settings,
        camera=MockCameraDriver(fps=60),
        machine=SessionMachine(timeouts=settings.state_timeouts()),
        print_format=BUILTIN_FORMATS[DEFAULT_FORMAT_KEY],
    )

    with TestClient(build_kiosk_app(runtime)) as client:
        assert client.get("/api/status").status_code == 200
        assert client.get("/").status_code == 404
