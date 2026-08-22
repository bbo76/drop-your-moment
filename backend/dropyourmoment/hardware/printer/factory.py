"""Sélection du pilote imprimante.

Même forme que la sélection du driver caméra, et pour la même raison : le jalon 7 ajoutera
`CUPS` à cette énumération avec un import tardif de pycups, sans toucher au reste. Le
backend doit démarrer sur une machine sans démon CUPS.
"""

from __future__ import annotations

from enum import StrEnum

from dropyourmoment.hardware.printer.base import PrinterDriver
from dropyourmoment.hardware.printer.null_driver import NullPrinterDriver


class PrinterDriverName(StrEnum):
    NULL = "null"


def build_printer_driver(name: PrinterDriverName) -> PrinterDriver:
    if name is PrinterDriverName.NULL:
        return NullPrinterDriver()
    raise ValueError(f"pilote imprimante inconnu : {name}")  # pragma: no cover
