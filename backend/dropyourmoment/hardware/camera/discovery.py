"""Découverte des caméras branchées, sur demande explicite de l'opérateur.

`DYM_CAMERA_DEVICE` existe depuis le driver webcam universel, mais rien ne disait quoi y
mettre : l'opérateur changeait l'index, relançait, et lisait la ligne de démarrage.
Acceptable en développement, pénible sur site.

Deux sources, et **elles ne répondent pas à la même question** :

- Le **sondage OpenCV** donne les index, qui sont exactement ce que `DYM_CAMERA_DEVICE`
  attend. C'est la seule source qui le donne, et elle coûte cher : ouvrir un périphérique
  le réserve le temps du test, et macOS journalise une erreur par échec.
- Les **noms système** (`system_profiler` sur macOS, `v4l2-ctl` sur Linux) donnent ce que
  l'opérateur veut lire — « Caméra MacBook Pro » plutôt que « 0 ».

Les deux ne sont **pas appariés**, volontairement. Aucune API ne garantit que le troisième
nom rendu par `system_profiler` corresponde à l'index 2 d'AVFoundation ; l'ordre coïncide
souvent, et « souvent » n'a pas sa place dans une interface d'exploitation. Un opérateur
qui lit deux listes honnêtes s'en sort ; un opérateur à qui on a menti sur un appariement
débranche la mauvaise caméra.

Rien ici n'est appelé au démarrage ni au chargement d'une page : voler le capteur au
kiosque pendant un événement serait exactement le bug que le process unique évite.
"""

from __future__ import annotations

import json
import logging
import subprocess
import sys
from collections.abc import Iterable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Six index suffisent : au-delà, on paie six ouvertures de périphérique pour un cas
# — plus de six caméras sur une borne photo — qui n'existe pas.
PROBE_RANGE = range(6)

# Un sondage qui traîne bloque la page. Les deux commandes rendent en quelques dizaines de
# millisecondes ; au-delà, quelque chose ne va pas et l'absence de noms est préférable.
COMMAND_TIMEOUT_S = 5.0


@dataclass(frozen=True)
class ProbedCamera:
    """Un index qui s'ouvre, et la taille que le pilote y annonce.

    La taille sert à distinguer deux caméras dont on n'a pas les noms : une webcam interne
    et une externe négocient rarement le même mode.
    """

    index: int
    size: tuple[int, int]


def probe_indices(
    skip: int | None = None, indices: Iterable[int] = PROBE_RANGE
) -> list[ProbedCamera]:
    """Ouvre chaque index tour à tour et retient ceux qui répondent.

    `skip` est l'index déjà détenu par le kiosque. Le sonder le lui volerait : un capteur
    n'accepte qu'un propriétaire, c'est toute la raison du process unique. On ne le teste
    donc pas, et l'appelant le signale comme occupé.

    Sans OpenCV installé — le cas de la borne, dont le capteur CSI passe par picamera2 —
    il n'y a rien à sonder.
    """
    try:
        import cv2
    except ImportError:
        logger.info("sondage des caméras impossible : OpenCV n'est pas installé")
        return []

    found: list[ProbedCamera] = []
    for index in indices:
        if index == skip:
            continue
        capture = cv2.VideoCapture(index)
        try:
            if not capture.isOpened():
                continue
            found.append(
                ProbedCamera(
                    index=index,
                    size=(
                        int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
                        int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                    ),
                )
            )
        finally:
            # Libérer immédiatement : un périphérique laissé ouvert par le sondage serait
            # indisponible pour le kiosque juste après.
            capture.release()

    logger.info("sondage des caméras : %d index disponible(s)", len(found))
    return found


def system_camera_names() -> list[str]:
    """Noms des caméras vus par le système, sans ouvrir aucun périphérique."""
    if sys.platform == "darwin":
        return parse_system_profiler(_run(["system_profiler", "-json", "SPCameraDataType"]))
    if sys.platform.startswith("linux"):
        return parse_v4l2(_run(["v4l2-ctl", "--list-devices"]))
    return []


def parse_system_profiler(output: str) -> list[str]:
    """Extrait les `_name` de `system_profiler -json SPCameraDataType`.

    Fonction pure et séparée de l'appel : c'est la partie qui peut se tromper, donc celle
    qu'un test doit pouvoir exercer sans caméra branchée.
    """
    try:
        payload = json.loads(output)
    except json.JSONDecodeError:
        return []
    entries = payload.get("SPCameraDataType", []) if isinstance(payload, dict) else []
    return [name for entry in entries if (name := entry.get("_name"))]


def parse_v4l2(output: str) -> list[str]:
    """Extrait les noms de `v4l2-ctl --list-devices`.

    Le format alterne un nom en début de ligne, terminé par « : », et les chemins
    `/dev/videoN` indentés en dessous. La parenthèse de bus — « (usb-0000:00:14.0-1) » —
    est retirée : elle n'aide pas à reconnaître une caméra du regard.
    """
    names = []
    for line in output.splitlines():
        if not line or line[0].isspace() or not line.rstrip().endswith(":"):
            continue
        name = line.rstrip().removesuffix(":").split(" (")[0].strip()
        if name:
            names.append(name)
    return names


def _run(command: list[str]) -> str:
    """Sortie standard de la commande, ou une chaîne vide.

    Commande absente, code de retour non nul, sortie illisible : dans tous les cas
    l'absence de noms n'est pas une panne. Les index restent la réponse utile.
    """
    try:
        result = subprocess.run(  # noqa: S603 — commande fixe, aucun argument d'utilisateur
            command,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_S,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.info("noms de caméras indisponibles (%s) : %s", command[0], exc)
        return ""
    return result.stdout if result.returncode == 0 else ""
