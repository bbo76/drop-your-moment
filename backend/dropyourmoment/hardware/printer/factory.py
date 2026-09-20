"""Sélection et persistance du pilote imprimante configuré."""

import json
import logging
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from dropyourmoment.hardware.printer.base import PrinterDriver
from dropyourmoment.hardware.printer.null_driver import NullPrinterDriver
from dropyourmoment.storage.atomic import write_atomic

logger = logging.getLogger(__name__)
PRINTER_CONFIG_FILENAME = "printer.json"


class PrinterDriverName(StrEnum):
    NULL = "null"
    CUPS = "cups"


@dataclass(frozen=True)
class PrinterSelection:
    driver: PrinterDriverName
    printer_name: str | None = None


def build_printer_driver(
    name: PrinterDriverName,
    printer_name: str | None = None,
    simulated_print_duration_s: float = 0.0,
) -> PrinterDriver:
    if name is PrinterDriverName.CUPS:
        from dropyourmoment.hardware.printer.cups_driver import CupsPrinterDriver

        return CupsPrinterDriver(printer_name)
    return NullPrinterDriver(completion_delay_s=simulated_print_duration_s)


def load_printer_selection(data_dir: Path, default: PrinterSelection) -> PrinterSelection:
    path = data_dir / PRINTER_CONFIG_FILENAME
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        driver = PrinterDriverName(payload["driver"])
        printer_name = payload.get("printer_name") if driver is PrinterDriverName.CUPS else None
        if printer_name is not None and not isinstance(printer_name, str):
            raise TypeError("printer_name doit être une chaîne")
        return PrinterSelection(driver, printer_name)
    except FileNotFoundError:
        return default
    except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError) as exc:
        logger.warning("configuration imprimante ignorée (%s) : %s", path, exc)
        return default


def save_printer_selection(data_dir: Path, selection: PrinterSelection) -> None:
    payload = {"driver": selection.driver.value, "printer_name": selection.printer_name}
    write_atomic(
        data_dir / PRINTER_CONFIG_FILENAME,
        (json.dumps(payload, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
    )
