"""Écriture de fichier qui ne laisse jamais un contenu tronqué.

Deux fichiers portent l'état persistant de la borne — la configuration d'événement et le
compteur de tirages — et tous deux sont réécrits pendant qu'un événement se déroule. Un
`write_text` direct sur un fichier existant le vide d'abord : une coupure entre les deux
laisse un JSON tronqué, que le prochain démarrage jettera pour repartir sur les valeurs
par défaut. Perdre le nom de l'événement ou le compteur de cartouche parce que quelqu'un
a débranché la borne au mauvais moment est évitable pour trois lignes.

Le geste complet est donc : écrire à côté, forcer les octets sur le disque, remplacer d'un
seul `rename`. `os.replace` est atomique quand la source et la destination sont sur le même
système de fichiers, ce qui est garanti ici puisque le temporaire est déposé dans le
répertoire de destination.

Le `fsync` porte sur le fichier temporaire, pas sur le répertoire. La différence compte :
sans lui, une coupure peut laisser un fichier renommé mais vide — le pire des cas, puisque
c'est celui qu'on cherche à éviter. Sans `fsync` du répertoire, en revanche, le pire des
cas est un renommage qui n'a pas eu lieu : l'ancien contenu, intact. Une valeur périmée se
rattrape, un fichier vide non.
"""

from __future__ import annotations

import os
from pathlib import Path


def write_atomic(path: Path, data: bytes) -> None:
    """Remplace `path` par `data`, sans état intermédiaire visible.

    En octets et non en texte : les appelants JSON encodent en UTF-8 d'une méthode, et
    l'overlay téléversé s'écrit sans conversion. Une seule signature suffit aux deux.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
