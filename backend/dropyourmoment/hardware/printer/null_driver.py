"""Pilote neutre : journalise la demande et simule éventuellement un job lent.

C'est lui qui permet de livrer tout le parcours sans imprimante branchée. Sans délai il
répond immédiatement pour les tests ; avec un délai il garde le job en `PRINTING` assez
longtemps pour valider l'écran d'attente. Le pilote CUPS le remplacera au jalon 7.

Il ne se contente pas de rendre un succès : il conserve les jobs émis, pour que
`get_job_status` réponde honnêtement et qu'un identifiant inventé soit refusé comme le
ferait un vrai spouleur. Un mock qui dit oui à tout masquerait le bug qu'on cherche à voir.
"""

from __future__ import annotations

import itertools
import logging
import time
from collections.abc import Callable
from pathlib import Path

from dropyourmoment.core.errors import PrintJobFailedError
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob

logger = logging.getLogger(__name__)


class NullPrinterDriver(PrinterDriver):
    name = "pilote neutre — aucune imprimante branchée"

    def __init__(
        self,
        completion_delay_s: float = 0.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._counter = itertools.count(1)
        self._jobs: dict[str, PrintJob] = {}
        self._deadlines: dict[str, float] = {}
        self._completion_delay_s = max(0.0, completion_delay_s)
        self._clock = clock

    @property
    def submitted_jobs(self) -> int:
        """Nombre de tirages soumis depuis le démarrage. Rend les tests lisibles."""
        return len(self._jobs)

    def print_image(self, path: Path, copies: int) -> PrintJob:
        waiting = self._completion_delay_s > 0
        job = PrintJob(
            id=f"null-{next(self._counter)}",
            state=JobState.PRINTING if waiting else JobState.COMPLETED,
            copies=copies,
            detail="pilote neutre — aucun tirage physique",
        )
        self._jobs[job.id] = job
        if waiting:
            self._deadlines[job.id] = self._clock() + self._completion_delay_s
        logger.info(
            "tirage simulé %s : %s × %d (pilote neutre, aucun papier consommé)",
            job.id,
            path.name,
            copies,
        )
        return job

    def get_job_status(self, job_id: str) -> PrintJob:
        try:
            job = self._jobs[job_id]
        except KeyError:
            raise PrintJobFailedError(f"job inconnu : {job_id}") from None
        deadline = self._deadlines.get(job_id)
        if deadline is not None and self._clock() >= deadline:
            job = PrintJob(
                id=job.id,
                state=JobState.COMPLETED,
                copies=job.copies,
                detail=job.detail,
            )
            self._jobs[job_id] = job
            del self._deadlines[job_id]
        return job
