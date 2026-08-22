"""Interface imprimante.

Même frontière que pour la caméra : le driver est propriétaire de l'imprimante et rien
d'autre. Il reçoit un fichier déjà composé et un nombre de copies, et ne décide ni du
recadrage ni du format — c'est le ressort de `dropyourmoment.imaging` et du format de
sortie de l'événement.

Le contrat est **asynchrone** dès le pilote neutre : `print_image` rend un job, dont on
interroge ensuite l'état. Ce n'est pas de la sur-ingénierie pour un pilote qui répond
« terminé » immédiatement — c'est ce que le pilote CUPS exigera, la CP1500 étant une
sublimation quatre passes d'environ 40 secondes. Un contrat synchrone aujourd'hui serait à
réécrire, avec la machine à états et le polling du frontend derrière lui.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class JobState(StrEnum):
    PENDING = "pending"
    PRINTING = "printing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(frozen=True)
class PrintJob:
    """Un tirage demandé, et où il en est.

    `copies` voyage avec le job parce que c'est lui qui alimente le compteur de tirages à
    la fin : la configuration d'événement peut changer entre la demande et la sortie du
    papier, et c'est le nombre réellement demandé qui compte.
    """

    id: str
    state: JobState
    copies: int
    detail: str | None = None


class PrinterDriver(ABC):
    """Contrat commun à toutes les imprimantes.

    Contrairement au driver caméra, il n'y a pas de cycle de vie à ouvrir : une imprimante
    ne se réserve pas, elle se découvre au moment où on lui parle.
    """

    @abstractmethod
    def print_image(self, path: Path, copies: int) -> PrintJob:
        """Soumet un tirage et rend le job correspondant, sans attendre sa fin.

        Lève `PrinterOfflineError` si l'imprimante ne répond pas : un refus à la
        soumission est un cas différent d'un job accepté puis échoué, et le parcours
        visiteur les traite différemment.
        """

    @abstractmethod
    def get_job_status(self, job_id: str) -> PrintJob:
        """État courant d'un job déjà soumis.

        Un identifiant inconnu lève `PrintJobFailedError` : mieux vaut un écran d'erreur
        qu'une session bloquée en PRINTING pour l'éternité.
        """
