"""Contrat du driver imprimante, et pilote neutre.

Le contrat compte plus que l'implémentation d'aujourd'hui : c'est lui qui garantit que le
pilote CUPS du jalon 7 se branchera sans restructuration.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from dropyourmoment.core.errors import PrintJobFailedError
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob
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


def test_le_pilote_neutre_peut_simuler_un_tirage_lent(tmp_path: Path) -> None:
    now = [10.0]
    driver = NullPrinterDriver(completion_delay_s=8.0, clock=lambda: now[0])
    job = driver.print_image(tmp_path / "final.jpg", copies=1)

    assert job.state is JobState.PRINTING
    now[0] += 8.0
    assert driver.get_job_status(job.id).state is JobState.COMPLETED


def test_un_job_inconnu_est_refuse() -> None:
    """Mieux vaut un écran d'erreur qu'une session bloquée en PRINTING pour l'éternité."""
    with pytest.raises(PrintJobFailedError):
        NullPrinterDriver().get_job_status("job-inexistant")
