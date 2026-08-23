"""Compteurs de tirages, persistés sur disque.

L'état de session vit en mémoire et se perd au redémarrage — sans gravité, le visiteur
recommence. Le compteur de tirages, lui, ne peut pas se le permettre : les cartouches de
la Canon Selphy CP1500 font 36, 54 ou 108 tirages, et sans compteur l'opérateur découvre
la fin de cartouche en pleine soirée.

Deux compteurs, parce que ce sont deux questions distinctes : « combien de photos cet
événement a-t-il produit » et « me reste-t-il du papier ». Ils n'ont existé ensemble
qu'une fois le bouton de remise à zéro disponible — sans lui, le second valait toujours
exactement le premier, avec un `reset_at` qui restait `null` à vie. Un compteur sans son
bouton n'est pas la moitié de la fonctionnalité, c'est une copie du cumul sous un autre nom.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path

from dropyourmoment.storage.atomic import write_atomic

logger = logging.getLogger(__name__)

COUNTERS_FILENAME = "counters.json"
PAPER_CASSETTE_CAPACITY = 18


@dataclass(frozen=True)
class Counters:
    prints_total: int = 0
    prints_since_reset: int = 0
    # Horodatage ISO de la dernière remise à zéro, `None` si elle n'a jamais eu lieu.
    # En chaîne et non en `datetime` : ce champ ne sert qu'à être affiché et sérialisé,
    # aucun calcul ne s'appuie dessus.
    reset_at: str | None = None
    cartridge_capacity: int = 108
    prints_since_cassette_reload: int = 0

    @property
    def paper_remaining(self) -> int:
        """Stock utilisable : le plus petit restant entre kit et bac physique."""
        return max(
            0,
            min(
                self.cartridge_capacity - self.prints_since_reset,
                PAPER_CASSETTE_CAPACITY - self.prints_since_cassette_reload,
            ),
        )


class CounterStore:
    """Lecture et écriture du compteur. Relit le fichier à chaque accès.

    Pas de cache en mémoire : un tirage par minute au grand maximum, et relire garantit
    qu'une remise à zéro faite à la main dans le fichier est prise en compte sans
    redémarrer la borne.
    """

    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / COUNTERS_FILENAME

    def read(self) -> Counters:
        if not self._path.is_file():
            return Counters()
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
            total = int(payload["prints_total"])
            reset_at = payload.get("reset_at")
            return Counters(
                prints_total=total,
                # Un fichier écrit avant l'arrivée du second compteur n'a que le cumul.
                # Le repli sur `total` est la lecture honnête : aucune remise à zéro n'a
                # eu lieu, donc la cartouche a vu passer tous les tirages.
                prints_since_reset=int(payload.get("prints_since_reset", total)),
                reset_at=None if reset_at is None else str(reset_at),
                cartridge_capacity=int(payload.get("cartridge_capacity", 108)),
                prints_since_cassette_reload=int(
                    payload.get("prints_since_cassette_reload", total)
                ),
            )
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError) as exc:
            # Repartir de zéro plutôt que refuser de démarrer : même arbitrage que pour la
            # configuration d'événement. Un compteur faux se corrige, une borne éteinte
            # en pleine soirée non.
            logger.error("compteur de tirages illisible (%s) — repart de zéro", exc)
            return Counters()

    def record_prints(self, copies: int) -> Counters:
        current = self.read()
        updated = replace(
            current,
            prints_total=current.prints_total + copies,
            prints_since_reset=current.prints_since_reset + copies,
            prints_since_cassette_reload=current.prints_since_cassette_reload + copies,
        )
        self._write(updated)
        logger.info(
            "compteur de tirages : +%d (total %d, cartouche %d)",
            copies,
            updated.prints_total,
            updated.prints_since_reset,
        )
        return updated

    def reset_cartridge(self, capacity: int | None = None) -> Counters:
        """Réarme le compteur de cartouche, sans toucher au cumul.

        Le geste que l'opérateur fait en changeant de papier. Le cumul, lui, répond à une
        autre question et n'a aucune raison de bouger — c'est bien pour ça qu'il en faut
        deux.
        """
        current = self.read()
        updated = replace(
            current,
            prints_since_reset=0,
            reset_at=datetime.now(UTC).isoformat(timespec="seconds"),
            cartridge_capacity=capacity if capacity is not None else current.cartridge_capacity,
            prints_since_cassette_reload=0,
        )
        self._write(updated)
        logger.info(
            "compteur de cartouche remis à zéro (cumul inchangé : %d)", updated.prints_total
        )
        return updated

    def reload_cassette(self) -> Counters:
        """Mémorise le rechargement du bac papier CP1500, limité à 18 feuilles."""
        current = self.read()
        updated = replace(current, prints_since_cassette_reload=0)
        self._write(updated)
        logger.info("bac papier CP1500 rechargé (%d feuilles max)", PAPER_CASSETTE_CAPACITY)
        return updated

    def _write(self, counters: Counters) -> None:
        write_atomic(
            self._path,
            (json.dumps(counters.__dict__, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
        )
