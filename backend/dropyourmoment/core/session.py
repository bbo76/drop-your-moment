"""Machine à états de session : la source de vérité unique du parcours visiteur.

Le frontend n'est qu'un afficheur de cet état. Toute la logique de parcours vit ici, ce
qui permettra à un autre frontend (tablette, Mac) de consommer la même machine sans
réimplémenter de règles en JavaScript.

Une seule session est active à la fois : le photobooth est intrinsèquement mono-visiteur.

Le temps passe par une horloge injectable pour que les timeouts soient testables sans
attendre. L'horloge doit être monotone (`time.monotonic`), jamais l'heure murale : un
ajustement NTP en pleine soirée ne doit pas faire expirer une session.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

from dropyourmoment.core.errors import InvalidTransitionError


class SessionState(StrEnum):
    IDLE = "idle"
    PREVIEW = "preview"
    REVIEW = "review"
    PRINTING = "printing"
    DONE = "done"
    ERROR = "error"


class SessionEvent(StrEnum):
    START = "start"
    CAPTURE = "capture"
    CHOOSE_FILTER = "choose_filter"
    RETAKE = "retake"
    PRINT = "print"
    COMPLETE = "complete"
    FAIL = "fail"
    RESET = "reset"
    TIMEOUT = "timeout"


# Transitions autorisées. Toute combinaison absente lève InvalidTransitionError : la
# machine est fermée par défaut, ce qui fait remonter les bugs de parcours au lieu de
# les absorber silencieusement.
_TRANSITIONS: dict[tuple[SessionState, SessionEvent], SessionState] = {
    (SessionState.IDLE, SessionEvent.START): SessionState.PREVIEW,
    (SessionState.PREVIEW, SessionEvent.START): SessionState.PREVIEW,
    (SessionState.PREVIEW, SessionEvent.CAPTURE): SessionState.REVIEW,
    (SessionState.PREVIEW, SessionEvent.TIMEOUT): SessionState.IDLE,
    (SessionState.REVIEW, SessionEvent.CHOOSE_FILTER): SessionState.REVIEW,
    (SessionState.REVIEW, SessionEvent.RETAKE): SessionState.PREVIEW,
    (SessionState.REVIEW, SessionEvent.PRINT): SessionState.PRINTING,
    (SessionState.REVIEW, SessionEvent.TIMEOUT): SessionState.IDLE,
    (SessionState.REVIEW, SessionEvent.START): SessionState.PREVIEW,
    (SessionState.PRINTING, SessionEvent.COMPLETE): SessionState.DONE,
    (SessionState.DONE, SessionEvent.TIMEOUT): SessionState.IDLE,
    (SessionState.DONE, SessionEvent.START): SessionState.PREVIEW,
    (SessionState.ERROR, SessionEvent.TIMEOUT): SessionState.IDLE,
    (SessionState.ERROR, SessionEvent.START): SessionState.PREVIEW,
}

# FAIL et RESET s'appliquent depuis n'importe quel état : une panne matérielle ne
# demande pas la permission de la machine à états.
_UNIVERSAL_EVENTS: dict[SessionEvent, SessionState] = {
    SessionEvent.FAIL: SessionState.ERROR,
    SessionEvent.RESET: SessionState.IDLE,
}


@dataclass(frozen=True)
class StateTimeouts:
    """Durées d'inactivité au-delà desquelles un état retourne au repos, en secondes.

    PREVIEW et REVIEW sont les deux états où un visiteur peut s'éloigner et laisser la
    borne bloquée : sans ces timeouts, le photobooth demande une intervention manuelle
    au premier abandon. PRINTING n'en a pas — il dépend de l'imprimante, pas du
    visiteur, et c'est le driver qui porte son propre timeout de job.
    """

    preview: float = 60.0
    review: float = 90.0
    done: float = 8.0
    error: float = 15.0

    def for_state(self, state: SessionState) -> float | None:
        return {
            SessionState.PREVIEW: self.preview,
            SessionState.REVIEW: self.review,
            SessionState.DONE: self.done,
            SessionState.ERROR: self.error,
        }.get(state)


@dataclass
class Session:
    """Artefacts et choix d'un passage visiteur.

    `raw_paths` est une liste alors que le MVP n'en produit qu'un seul : c'est le point
    d'entrée du futur mode bandeau multi-prises, qui remplira cette liste sans changer
    la forme de la session ni celle de l'API.
    """

    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    raw_paths: list[Path] = field(default_factory=list)
    final_path: Path | None = None
    selected_filter: str | None = None


class SessionMachine:
    def __init__(
        self,
        clock: Callable[[], float] = time.monotonic,
        timeouts: StateTimeouts | None = None,
    ) -> None:
        self._clock = clock
        self.timeouts = timeouts or StateTimeouts()
        self._state = SessionState.IDLE
        self._entered_at = clock()
        self._session: Session | None = None
        self._last_error: str | None = None

    @property
    def state(self) -> SessionState:
        return self._state

    @property
    def session(self) -> Session | None:
        return self._session

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def start(self) -> Session:
        """Ouvre une session, en écrasant celle en cours s'il en reste une.

        Écraser plutôt que refuser est délibéré : une session abandonnée en review ne
        doit jamais empêcher le visiteur suivant d'utiliser la borne.
        """
        self._dispatch(SessionEvent.START)
        self._session = Session()
        self._last_error = None
        return self._session

    def capture(self) -> Session:
        self._dispatch(SessionEvent.CAPTURE)
        assert self._session is not None  # garanti par la transition depuis PREVIEW
        return self._session

    def choose_filter(self, filter_name: str) -> Session:
        self._dispatch(SessionEvent.CHOOSE_FILTER)
        assert self._session is not None
        self._session.selected_filter = filter_name
        return self._session

    def retake(self) -> Session:
        self._dispatch(SessionEvent.RETAKE)
        assert self._session is not None
        self._session.raw_paths.clear()
        self._session.final_path = None
        self._session.selected_filter = None
        return self._session

    def print(self) -> Session:
        self._dispatch(SessionEvent.PRINT)
        assert self._session is not None
        return self._session

    def complete(self) -> None:
        self._dispatch(SessionEvent.COMPLETE)

    def fail(self, reason: str) -> None:
        self._dispatch(SessionEvent.FAIL)
        self._last_error = reason

    def reset(self) -> None:
        self._dispatch(SessionEvent.RESET)

    def tick(self) -> bool:
        """Applique le timeout de l'état courant s'il est expiré.

        Retourne True si un timeout a été appliqué. Appelée à la fois par le ticker de
        fond et à chaque lecture de statut, pour que l'état soit correct même si le
        ticker est en retard.
        """
        limit = self.timeouts.for_state(self._state)
        if limit is None or self._elapsed() < limit:
            return False
        self._dispatch(SessionEvent.TIMEOUT)
        return True

    def remaining_seconds(self) -> float | None:
        """Temps restant avant expiration, ou None si l'état courant n'expire pas."""
        limit = self.timeouts.for_state(self._state)
        if limit is None:
            return None
        return max(0.0, limit - self._elapsed())

    def _elapsed(self) -> float:
        return self._clock() - self._entered_at

    def _dispatch(self, event: SessionEvent) -> None:
        target = _UNIVERSAL_EVENTS.get(event)
        if target is None:
            try:
                target = _TRANSITIONS[(self._state, event)]
            except KeyError:
                raise InvalidTransitionError(self._state, event) from None

        self._state = target
        # Rechargé même sur une transition vers le même état : choisir un filtre est
        # une activité du visiteur, elle doit repousser le compte à rebours d'abandon.
        self._entered_at = self._clock()

        if target is SessionState.IDLE:
            self._session = None
            self._last_error = None
