"""Contrat du driver imprimante, et pilote neutre.

Le contrat compte plus que l'implémentation d'aujourd'hui : c'est lui qui garantit que le
pilote CUPS du jalon 7 se branchera sans restructuration.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from dropyourmoment.core.errors import PrintJobFailedError
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob
from dropyourmoment.hardware.printer.factory import PrinterDriverName, build_printer_driver
from dropyourmoment.hardware.printer.null_driver import NullPrinterDriver


def test_un_pilote_incomplet_est_refuse() -> None:
    """Oublier une méthode doit échouer à l'instanciation, pas en pleine soirée."""

    class PiloteBancal(PrinterDriver):
        def print_image(self, path: Path, copies: int) -> PrintJob:  # pragma: no cover
            raise NotImplementedError

    with pytest.raises(TypeError):
        PiloteBancal()  # type: ignore[abstract]


def test_le_pilote_neutre_satisfait_le_contrat() -> None:
    assert isinstance(NullPrinterDriver(), PrinterDriver)


def test_la_fabrique_rend_le_pilote_neutre() -> None:
    assert isinstance(build_printer_driver(PrinterDriverName.NULL), NullPrinterDriver)


def test_le_job_est_termine_immediatement(tmp_path: Path) -> None:
    driver = NullPrinterDriver()

    job = driver.print_image(tmp_path / "final.jpg", copies=2)

    assert job.state is JobState.COMPLETED
    assert job.copies == 2
    assert driver.submitted_jobs == 1


def test_l_etat_du_job_reste_consultable(tmp_path: Path) -> None:
    driver = NullPrinterDriver()
    job = driver.print_image(tmp_path / "final.jpg", copies=1)

    assert driver.get_job_status(job.id) == job


def test_un_job_inconnu_est_refuse() -> None:
    """Mieux vaut un écran d'erreur qu'une session bloquée en PRINTING pour l'éternité."""
    with pytest.raises(PrintJobFailedError):
        NullPrinterDriver().get_job_status("job-inexistant")


def test_le_pilote_neutre_se_declare_pret() -> None:
    status = NullPrinterDriver().get_status()

    assert status.ready
    assert status.driver_name == "null"
    assert NullPrinterDriver().list_available_printers() == []


def test_les_etats_finaux() -> None:
    assert JobState.COMPLETED.is_final and JobState.FAILED.is_final
    assert not JobState.PENDING.is_final and not JobState.PRINTING.is_final
