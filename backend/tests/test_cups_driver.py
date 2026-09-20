"""Pilote CUPS exercé sans démon ni imprimante."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import ModuleType

import pytest
from fastapi.testclient import TestClient

from dropyourmoment.config import Settings
from dropyourmoment.core.errors import PrinterOfflineError, PrintJobFailedError
from dropyourmoment.hardware.printer.base import JobState
from dropyourmoment.hardware.printer.factory import (
    PrinterDriverName,
    PrinterSelection,
    build_printer_driver,
    load_printer_selection,
)
from dropyourmoment.runtime import Runtime


class FakeConnection:
    def __init__(self) -> None:
        self.state = 3
        self.submission: tuple[object, ...] | None = None

    def getDefault(self) -> str:
        return "Canon_CP1500"

    def getPrinters(self) -> dict[str, object]:
        return {"Secondaire": {}, "Canon_CP1500": {}}

    def printFile(self, *args: object) -> int:
        self.submission = args
        return 42

    def getJobAttributes(self, job_id: int) -> dict[str, object]:
        assert job_id == 42
        return {"job-state": self.state, "job-state-reasons": ["none"]}


def fake_cups(monkeypatch: pytest.MonkeyPatch) -> FakeConnection:
    connection = FakeConnection()
    module = ModuleType("cups")
    module.IPPError = RuntimeError  # type: ignore[attr-defined]
    module.IPP_JOB_PENDING = 3  # type: ignore[attr-defined]
    module.IPP_JOB_HELD = 4  # type: ignore[attr-defined]
    module.IPP_JOB_PROCESSING = 5  # type: ignore[attr-defined]
    module.IPP_JOB_STOPPED = 6  # type: ignore[attr-defined]
    module.IPP_JOB_CANCELED = 7  # type: ignore[attr-defined]
    module.IPP_JOB_ABORTED = 8  # type: ignore[attr-defined]
    module.IPP_JOB_COMPLETED = 9  # type: ignore[attr-defined]
    module.Connection = lambda: connection  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "cups", module)
    return connection


def test_soumet_et_suit_un_job(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    connection = fake_cups(monkeypatch)
    driver = build_printer_driver(PrinterDriverName.CUPS)

    path = tmp_path / "final.jpg"
    job = driver.print_image(path, copies=2)

    assert connection.submission == (
        "Canon_CP1500",
        str(path),
        "final",
        {"copies": "2"},
    )
    assert job == driver.get_job_status("cups-42")
    assert job.state is JobState.PENDING

    connection.state = 5
    assert driver.get_job_status("cups-42").state is JobState.PRINTING
    connection.state = 9
    assert driver.get_job_status("cups-42").state is JobState.COMPLETED
    connection.state = 8
    assert driver.get_job_status("cups-42").state is JobState.FAILED


def test_liste_les_imprimantes_et_respecte_le_nom_configure(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    connection = fake_cups(monkeypatch)
    driver = build_printer_driver(PrinterDriverName.CUPS, "Secondaire")

    assert driver.list_printers() == ["Canon_CP1500", "Secondaire"]  # type: ignore[attr-defined]
    driver.print_image(tmp_path / "photo.jpg", 1)
    assert connection.submission and connection.submission[0] == "Secondaire"


def test_un_job_inconnu_est_refuse(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_cups(monkeypatch)
    driver = build_printer_driver(PrinterDriverName.CUPS)

    with pytest.raises(PrintJobFailedError):
        driver.get_job_status("cups-999")


def test_pycups_absent_est_une_imprimante_hors_ligne(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delitem(sys.modules, "cups", raising=False)
    module = importlib.import_module("dropyourmoment.hardware.printer.cups_driver")
    real_import = __import__

    def without_cups(name: str, *args: object, **kwargs: object) -> object:
        if name == "cups":
            raise ImportError
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", without_cups)
    with pytest.raises(PrinterOfflineError):
        module.CupsPrinterDriver()


def test_la_configuration_selectionne_cups() -> None:
    assert Settings(printer_driver="cups").printer_driver is PrinterDriverName.CUPS


def test_le_portail_selectionne_et_conserve_l_imprimante(
    admin: TestClient,
    runtime: Runtime,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_cups(monkeypatch)

    available = admin.get("/admin/printer")
    assert available.status_code == 200
    assert available.json()["available_printers"] == ["Canon_CP1500", "Secondaire"]

    changed = admin.put(
        "/admin/printer",
        json={"driver": "cups", "printer_name": "Canon_CP1500"},
    )

    assert changed.status_code == 200
    assert runtime.printer.name == "CUPS — Canon_CP1500"
    assert load_printer_selection(
        runtime.settings.data_dir,
        PrinterSelection(PrinterDriverName.NULL),
    ) == PrinterSelection(PrinterDriverName.CUPS, "Canon_CP1500")


def test_le_portail_refuse_une_file_cups_inconnue(
    admin: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_cups(monkeypatch)

    response = admin.put(
        "/admin/printer",
        json={"driver": "cups", "printer_name": "Fantôme"},
    )

    assert response.status_code == 409
    assert "inconnue" in response.json()["detail"]
