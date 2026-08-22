"""Pilote neutre : journalise la demande et rend un job déjà terminé.

C'est lui qui permet de livrer tout le parcours — état `PRINTING` et écran de confirmation
compris — sans imprimante branchée, pendant toute la phase numérique. Le pilote CUPS le
remplacera au jalon 7 sans que l'API ni la machine à états bougent.

Il ne se contente pas de rendre un succès : il conserve les jobs émis, pour que
`get_job_status` réponde honnêtement et qu'un identifiant inventé soit refusé comme le
ferait un vrai spouleur. Un mock qui dit oui à tout masquerait le bug qu'on cherche à voir.
"""

from __future__ import annotations

import itertools
import logging
from pathlib import Path

from dropyourmoment.core.errors import PrintJobFailedError
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob

logger = logging.getLogger(__name__)


class NullPrinterDriver(PrinterDriver):
    def __init__(self) -> None:
        self._counter = itertools.count(1)
        self._jobs: dict[str, PrintJob] = {}

    @property
    def submitted_jobs(self) -> int:
        """Nombre de tirages soumis depuis le démarrage. Rend les tests lisibles."""
        return len(self._jobs)

    def print_image(self, path: Path, copies: int) -> PrintJob:
        job = PrintJob(
            id=f"null-{next(self._counter)}",
            state=JobState.COMPLETED,
            copies=copies,
            detail="pilote neutre — aucun tirage physique",
        )
        self._jobs[job.id] = job
        logger.info(
            "tirage simulé %s : %s × %d (pilote neutre, aucun papier consommé)",
            job.id,
            path.name,
            copies,
        )
        return job

    def get_job_status(self, job_id: str) -> PrintJob:
        try:
            return self._jobs[job_id]
        except KeyError:
            raise PrintJobFailedError(f"job inconnu : {job_id}") from None
