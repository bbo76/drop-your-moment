"""Comptage des flux de preview réellement actifs.

Pourquoi ne pas simplement incrémenter un compteur à l'ouverture et le décrémenter dans
un `finally` : quand un client HTTP se déconnecte, Starlette annule la tâche qui pompe le
générateur, mais **ne ferme pas** le générateur synchrone. Celui-ci reste suspendu sur
son `yield` jusqu'au passage du ramasse-miettes, donc son `finally` peut ne s'exécuter
que bien plus tard. Un compteur fondé sur le cycle de vie sur-déclare pendant tout ce
délai, et déclencherait de fausses alertes.

Bonne nouvelle mesurée au passage : un générateur ainsi abandonné ne consomme plus rien
— il n'est plus pompé, donc plus aucune frame n'est encodée. Le risque d'une connexion
MJPEG oubliée par le navigateur est donc un compteur faux, pas une fuite de CPU.

D'où ce comptage par *activité* : un flux compte comme actif s'il a consommé une frame
récemment. Un flux abandonné disparaît de lui-même, sans dépendre d'une finalisation.
"""

from __future__ import annotations

import itertools
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager

DEFAULT_IDLE_AFTER_S = 1.0


class PreviewActivity:
    def __init__(
        self,
        idle_after_s: float = DEFAULT_IDLE_AFTER_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._idle_after_s = idle_after_s
        self._clock = clock
        self._lock = threading.Lock()
        self._ids = itertools.count()
        self._last_seen: dict[int, float] = {}

    @contextmanager
    def track(self) -> Iterator[Callable[[], None]]:
        """Suit un flux et fournit le battement à appeler à chaque frame servie."""
        with self._lock:
            stream_id = next(self._ids)
            self._last_seen[stream_id] = self._clock()

        def heartbeat() -> None:
            with self._lock:
                self._last_seen[stream_id] = self._clock()

        try:
            yield heartbeat
        finally:
            with self._lock:
                self._last_seen.pop(stream_id, None)

    @property
    def active(self) -> int:
        with self._lock:
            self._prune()
            return len(self._last_seen)

    def _prune(self) -> None:
        cutoff = self._clock() - self._idle_after_s
        for stream_id in [sid for sid, seen in self._last_seen.items() if seen < cutoff]:
            del self._last_seen[stream_id]
