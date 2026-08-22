"""Suivi du tirage en cours : de la soumission à la fin du job.

Le flux est asynchrone dès le pilote neutre. `submit()` rend la main tout de suite, et
c'est `poll()` qui constate la fin et fait avancer la machine à états. Ce n'est pas de la
sur-ingénierie pour un pilote qui répond « terminé » immédiatement : la CP1500 est une
sublimation quatre passes d'environ 40 secondes, et un endpoint bloquant serait à réécrire
au jalon 7 — avec la machine à états et le polling du frontend derrière lui.

`poll()` est appelé aux mêmes deux endroits que `SessionMachine.tick()` : à chaque lecture
de statut *et* par le ticker de fond. Même raison — l'état reste juste sans dépendre de la
cadence du ticker, et les tests n'ont pas besoin de faire tourner une boucle asyncio.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from dropyourmoment.core.errors import PrinterError
from dropyourmoment.core.session import SessionMachine, SessionState
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob
from dropyourmoment.storage.counters import CounterStore

logger = logging.getLogger(__name__)


class PrintFlow:
    def __init__(
        self,
        machine: SessionMachine,
        printer: PrinterDriver,
        counters: CounterStore,
        on_completed: Callable[[], None] | None = None,
    ) -> None:
        self._machine = machine
        self._printer = printer
        self._counters = counters
        self._on_completed = on_completed
        self._job: PrintJob | None = None

    @property
    def job(self) -> PrintJob | None:
        """Job en cours, ou None. Alimentera la page de santé de l'administration."""
        return self._job

    def submit(self, image_path: Path, copies: int) -> PrintJob:
        """Soumet le tirage. Lève `PrinterError` si l'imprimante refuse la demande."""
        job = self._printer.print_image(image_path, copies)
        self._job = job
        logger.info("tirage %s soumis (%d copie(s))", job.id, job.copies)
        return job

    def poll(self) -> None:
        """Constate l'avancement du job et fait avancer la machine à états."""
        if self._machine.state is not SessionState.PRINTING:
            # Annulation, panne, ou simple absence de tirage : le job n'a plus de
            # destinataire. Le jalon 7 ajoutera ici l'annulation côté CUPS — un point,
            # pas une refonte.
            self._job = None
            return

        job = self._job
        if job is None:
            return

        try:
            current = self._printer.get_job_status(job.id)
        except PrinterError as exc:
            self._fail(str(exc))
            return

        if current.state is JobState.FAILED:
            self._fail(current.detail or "le tirage a échoué")
            return
        if current.state is not JobState.COMPLETED:
            return

        self._job = None
        self._counters.record_prints(job.copies)
        self._machine.complete()
        if self._on_completed is not None:
            self._on_completed()

    def _fail(self, reason: str) -> None:
        logger.error("tirage échoué : %s", reason)
        self._job = None
        self._machine.fail(reason)
