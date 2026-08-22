"""Compteur de tirages, persisté sur disque.

L'état de session vit en mémoire et se perd au redémarrage — sans gravité, le visiteur
recommence. Le compteur de tirages, lui, ne peut pas se le permettre : les cartouches de
la Canon Selphy CP1500 font 36, 54 ou 108 tirages, et sans compteur l'opérateur découvre
la fin de cartouche en pleine soirée.

Un seul compteur tant que rien ne sait le remettre à zéro. Le compteur de cartouche —
« me reste-t-il du papier », donc un second compteur *et* le bouton qui le réarme —
arrive avec la page de santé de l'administration, au jalon 5.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, replace
from pathlib import Path

logger = logging.getLogger(__name__)

COUNTERS_FILENAME = "counters.json"


@dataclass(frozen=True)
class Counters:
    prints_total: int = 0


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
            return Counters(prints_total=int(payload["prints_total"]))
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError) as exc:
            # Repartir de zéro plutôt que refuser de démarrer : même arbitrage que pour la
            # configuration d'événement. Un compteur faux se corrige, une borne éteinte
            # en pleine soirée non.
            logger.error("compteur de tirages illisible (%s) — repart de zéro", exc)
            return Counters()

    def record_prints(self, copies: int) -> Counters:
        current = self.read()
        updated = replace(current, prints_total=current.prints_total + copies)
        self._write(updated)
        logger.info("compteur de tirages : +%d (total %d)", copies, updated.prints_total)
        return updated

    def _write(self, counters: Counters) -> None:
        """Écriture atomique : une coupure ne doit pas laisser un JSON tronqué.

        `os.replace` est atomique sur le même système de fichiers, ce qui est le cas d'un
        temporaire déposé dans le répertoire de destination.
        """
        self._path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._path.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(counters.__dict__, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, self._path)
