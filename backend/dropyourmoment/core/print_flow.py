"""Suivi du tirage en cours : de la soumission à la fin du job.

Le flux est asynchrone dès le pilote neutre. `submit()` rend la main tout de suite, et
c'est `poll()` qui constate la fin et fait avancer la machine à états. Ce n'est pas de la
sur-ingénierie pour un pilote qui répond « terminé » immédiatement : la CP1500 est une
sublimation quatre passes d'environ 40 secondes, et un endpoint bloquant serait à réécrire
au jalon 7 — avec la machine à états et le polling du frontend derrière lui.

`poll()` est appelé au même endroit que `SessionMachine.tick()` : à chaque lecture de
statut. Même raison — c'est la seule horloge dont l'état a besoin, et les tests n'ont pas
à faire tourner une boucle asyncio.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path

from dropyourmoment.core.errors import InsufficientPaperError, PrinterError
from dropyourmoment.core.session import SessionMachine, SessionState
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob
from dropyourmoment.storage.atomic import write_atomic
from dropyourmoment.storage.counters import CounterStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PrintProgress:
    batch_id: str
    requested: int
    current_index: int
    completed: int
    phase: str
    job_state: str | None = None
    job_id: str | None = None
    elapsed_s: float | None = None
    error: str | None = None


class PrintFlow:
    def __init__(
        self,
        machine: SessionMachine,
        printer: PrinterDriver,
        counters: CounterStore,
        on_completed: Callable[[], None] | None = None,
        completion_delay_s: float = 0.0,
        job_timeout_s: float = 120.0,
        clock: Callable[[], float] = time.monotonic,
        batch_timeout_s: float | None = None,
    ) -> None:
        self._machine = machine
        self._printer = printer
        self._counters = counters
        self._on_completed = on_completed
        self._lock = threading.RLock()
        self._journal = counters.data_dir / "print-batch.json"
        self._job: PrintJob | None = None
        self._complete_session = True
        self._source_path: Path | None = None
        self._last_error: str | None = None
        self._completion_delay_s = max(0.0, completion_delay_s)
        self._job_timeout_s = max(0.0, job_timeout_s)
        self._batch_timeout_s = batch_timeout_s
        self._clock = clock
        self._completed_at: float | None = None
        self._submitted_at: float | None = None
        self._batch_started_at: float | None = None
        self._progress: PrintProgress | None = None
        if self._journal.exists():
            try:
                stored = PrintProgress(**json.loads(self._journal.read_text(encoding="utf-8")))
                self._progress = stored
                if stored.phase not in ("completed", "failed", "cancelled"):
                    self._last_error = "tirage interrompu : vérifier les jobs CUPS et le stock"
                    self._progress = PrintProgress(
                        **{
                            **asdict(stored),
                            "phase": "uncertain",
                            "error": self._last_error,
                        }
                    )
                    self._persist()
            except (OSError, ValueError, TypeError, KeyError):
                self._last_error = "journal de tirage illisible : rapprochement requis"
                self._progress = PrintProgress(
                    "unknown", 1, 1, 0, "uncertain", error=self._last_error
                )

    @property
    def job(self) -> PrintJob | None:
        """Job en cours, ou None. Alimentera la page de santé de l'administration."""
        return self._job

    @property
    def progress(self) -> PrintProgress | None:
        with self._lock:
            return self._progress

    @property
    def busy(self) -> bool:
        with self._lock:
            return self._progress is not None and self._progress.phase in (
                "submitting",
                "pending",
                "printing",
                "settling",
                "uncertain",
            )

    @property
    def source_path(self) -> Path | None:
        return self._source_path

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def _persist(self) -> None:
        assert self._progress is not None
        write_atomic(self._journal, (json.dumps(asdict(self._progress)) + "\n").encode("utf-8"))

    @contextmanager
    def supply_guard(self) -> Iterator[None]:
        """Serialize operator stock changes with job submission and accounting."""
        with self._lock:
            if self.busy:
                raise PrinterError("tirage en cours ou à rapprocher")
            yield

    def _update(self, **changes: object) -> None:
        assert self._progress is not None
        previous = self._progress
        self._progress = PrintProgress(**{**asdict(previous), **changes})
        if asdict(previous) | {"elapsed_s": None} != asdict(self._progress) | {"elapsed_s": None}:
            self._persist()

    def acknowledge_uncertain(self) -> None:
        """Operator has reconciled CUPS and physical stock; never retry the batch."""
        with self._lock:
            if self._progress is None or self._progress.phase != "uncertain":
                raise PrinterError("aucun tirage incertain à rapprocher")
            self._update(phase="failed")
            self._job = None
            self._source_path = None

    def cancel(self) -> None:
        with self._lock:
            if not self.busy or self._progress.phase == "uncertain":
                return
            # Persist the stop before asking the printer: a simultaneous poll cannot
            # queue the next copy, even when cancelJob raises or a restart intervenes.
            self._update(phase="uncertain", error="annulation CUPS à vérifier")
            job = self._job
            if job is not None:
                try:
                    self._printer.cancel_job(job.id)
                except PrinterError as exc:
                    self._fail(f"annulation CUPS incertaine : {exc}", uncertain=True)
                    return
            self._fail("impression annulée", phase="cancelled")

    def submit(self, image_path: Path, copies: int, *, complete_session: bool = True) -> PrintJob:
        """Soumet le tirage. Lève `PrinterError` si l'imprimante refuse la demande."""
        with self._lock:
            if self.busy:
                raise PrinterError("une impression est déjà en cours ou à rapprocher")
            if copies < 1:
                raise PrinterError("nombre d'exemplaires invalide")
            if copies > self._counters.read().paper_remaining:
                raise InsufficientPaperError(
                    "papier insuffisant : rechargez le bac ou augmentez le stock papier"
                )
            self._complete_session = complete_session
            self._source_path = image_path
            self._last_error = None
            self._batch_started_at = self._clock()
            self._progress = PrintProgress(uuid.uuid4().hex, copies, 1, 0, "submitting")
            self._persist()
            return self._submit_next()

    def _submit_next(self) -> PrintJob:
        assert self._progress is not None and self._source_path is not None
        self._update(
            phase="submitting",
            current_index=self._progress.completed + 1,
            job_id=None,
            job_state=None,
            elapsed_s=None,
        )
        # Reserve the remaining copies against the *latest* stock reading. An operator
        # may have changed stock between two jobs. Never submit a partial surprise job.
        if (
            self._progress.requested - self._progress.completed
            > self._counters.read().paper_remaining
        ):
            self._fail("papier insuffisant pour finir le lot")
            raise InsufficientPaperError("papier insuffisant pour finir le lot")
        try:
            job = self._printer.print_image(self._source_path, 1)
        except PrinterError as exc:
            # printFile may have accepted the job even when its response was lost.
            self._fail(str(exc), uncertain=True)
            raise
        self._job = job
        self._submitted_at = self._clock()
        self._completed_at = None
        self._update(
            phase=job.state.value
            if job.state in (JobState.PENDING, JobState.PRINTING)
            else "pending",
            job_id=job.id,
            job_state=job.state.value,
            elapsed_s=0.0,
        )
        logger.info(
            "tirage %s exemplaire %d/%d soumis",
            job.id,
            self._progress.current_index,
            self._progress.requested,
        )
        return job

    def poll(self) -> None:
        """Constate l'avancement du job et fait avancer la machine à états."""
        with self._lock:
            if not self.busy or self._progress.phase == "uncertain":
                return
            if self._complete_session and self._machine.state is not SessionState.PRINTING:
                self.cancel()
                return
            job = self._job
            if job is None:
                self._fail("job CUPS absent : vérification requise", uncertain=True)
                return
            now = self._clock()
            batch_limit = self._batch_timeout_s
            if batch_limit is None:
                batch_limit = self._progress.requested * (
                    self._job_timeout_s + self._completion_delay_s
                )
            if (
                self._submitted_at is not None and now - self._submitted_at >= self._job_timeout_s
            ) or (
                self._batch_started_at is not None and now - self._batch_started_at >= batch_limit
            ):
                self._update(
                    phase="uncertain", error="délai d'impression dépassé : vérifiez l'imprimante"
                )
                try:
                    self._printer.cancel_job(job.id)
                except PrinterError as exc:
                    logger.warning(
                        "annulation du job %s impossible après timeout : %s", job.id, exc
                    )
                self._fail("délai d'impression dépassé : vérifiez l'imprimante", uncertain=True)
                return
            try:
                current = self._printer.get_job_status(job.id)
            except PrinterError as exc:
                self._fail(str(exc), uncertain=True)
                return
            self._job = current
            if current.state is JobState.FAILED:
                self._fail(current.detail or "le tirage a échoué")
                return
            if current.state is not JobState.COMPLETED:
                self._completed_at = None
                self._update(
                    phase=current.state.value,
                    job_state=current.state.value,
                    elapsed_s=now - self._submitted_at
                    if current.state is JobState.PRINTING
                    else None,
                )
                return
            if self._completed_at is None:
                self._completed_at = now
            if now - self._completed_at < self._completion_delay_s:
                self._update(phase="settling", job_state=current.state.value, elapsed_s=None)
                return
            # Counter write is idempotent by batch/index, even after a crash between
            # the counter write and journal update. Recovery still requires an operator.
            self._counters.record_print_job(self._progress.batch_id, self._progress.current_index)
            completed = self._progress.completed + 1
            self._update(completed=completed)
            self._job = None
            self._submitted_at = None
            self._completed_at = None
            if completed == self._progress.requested:
                self._update(phase="completed", job_state=JobState.COMPLETED.value, elapsed_s=None)
                self._source_path = None
                if self._complete_session:
                    self._machine.complete()
                if self._on_completed is not None:
                    self._on_completed()
            else:
                try:
                    self._submit_next()
                except PrinterError:
                    pass

    def _fail(self, reason: str, *, uncertain: bool = False, phase: str = "failed") -> None:
        logger.error("tirage échoué : %s", reason)
        self._update(phase="uncertain" if uncertain else phase, error=reason, elapsed_s=None)
        self._job = None
        self._source_path = None
        self._completed_at = None
        self._submitted_at = None
        self._last_error = reason
        if self._complete_session and self._machine.state is SessionState.PRINTING:
            self._machine.fail(reason)
