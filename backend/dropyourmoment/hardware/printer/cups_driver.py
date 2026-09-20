"""Pilote d'impression CUPS via les bindings système pycups."""

from __future__ import annotations

from pathlib import Path
from types import ModuleType
from typing import Any

from dropyourmoment.core.errors import PrinterOfflineError, PrintJobFailedError
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob


def list_cups_printers() -> list[str]:
    try:
        import cups
    except ImportError as exc:
        raise PrinterOfflineError(
            "pycups indisponible (installer le paquet système python3-cups)"
        ) from exc
    try:
        return sorted(cups.Connection().getPrinters())
    except (cups.IPPError, RuntimeError) as exc:
        raise PrinterOfflineError(f"liste des imprimantes CUPS inaccessible : {exc}") from exc


class CupsPrinterDriver(PrinterDriver):
    def __init__(self, printer_name: str | None = None) -> None:
        try:
            import cups
        except ImportError as exc:
            raise PrinterOfflineError(
                "pycups indisponible (installer le paquet système python3-cups)"
            ) from exc

        self._cups: ModuleType = cups
        try:
            self._connection: Any = cups.Connection()
            self._printer_name = printer_name or self._connection.getDefault()
        except (cups.IPPError, RuntimeError) as exc:
            raise PrinterOfflineError(f"connexion à CUPS impossible : {exc}") from exc
        if not self._printer_name:
            raise PrinterOfflineError("aucune imprimante CUPS par défaut")
        if self._printer_name not in self.list_printers():
            raise PrinterOfflineError(f"imprimante CUPS inconnue : {self._printer_name}")
        self.name = f"CUPS — {self._printer_name}"
        self._copies: dict[int, int] = {}

    def list_printers(self) -> list[str]:
        try:
            return sorted(self._connection.getPrinters())
        except (self._cups.IPPError, RuntimeError) as exc:
            raise PrinterOfflineError(f"liste des imprimantes CUPS inaccessible : {exc}") from exc

    def print_image(self, path: Path, copies: int) -> PrintJob:
        try:
            job_id = self._connection.printFile(
                self._printer_name,
                str(path),
                path.stem,
                {"copies": str(copies)},
            )
        except (self._cups.IPPError, RuntimeError) as exc:
            raise PrinterOfflineError(f"soumission CUPS refusée : {exc}") from exc
        self._copies[job_id] = copies
        return PrintJob(id=f"cups-{job_id}", state=JobState.PENDING, copies=copies)

    def get_job_status(self, job_id: str) -> PrintJob:
        try:
            cups_id = int(job_id.removeprefix("cups-"))
            copies = self._copies[cups_id]
            attributes = self._connection.getJobAttributes(cups_id)
        except (ValueError, KeyError):
            raise PrintJobFailedError(f"job inconnu : {job_id}") from None
        except (self._cups.IPPError, RuntimeError) as exc:
            raise PrintJobFailedError(f"statut CUPS inaccessible pour {job_id} : {exc}") from exc

        cups_state = attributes.get("job-state")
        if cups_state in (self._cups.IPP_JOB_PENDING, self._cups.IPP_JOB_HELD):
            state = JobState.PENDING
        elif cups_state == self._cups.IPP_JOB_PROCESSING:
            state = JobState.PRINTING
        elif cups_state == self._cups.IPP_JOB_COMPLETED:
            state = JobState.COMPLETED
        else:
            state = JobState.FAILED

        reasons = attributes.get("job-state-reasons")
        if isinstance(reasons, (list, tuple)):
            detail = ", ".join(reason for reason in reasons if reason != "none") or None
        else:
            detail = reasons if reasons != "none" else None
        return PrintJob(id=job_id, state=state, copies=copies, detail=detail)
