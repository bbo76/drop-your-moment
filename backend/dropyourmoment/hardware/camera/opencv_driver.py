"""Driver webcam universel via OpenCV : macOS, Windows, n'importe quelle caméra USB.

`cv2.VideoCapture` sélectionne seul le backend de la plateforme — AVFoundation sur macOS,
MSMF ou DirectShow sur Windows, V4L2 sur Linux. Un seul driver couvre donc les trois, sans
la moindre branche par système.

Deux différences assumées avec le driver Pi :

1. **Un seul flux, donc `still_size == preview_size`.** Une webcam UVC n'expose pas de
   second flux basse résolution : la capture et le preview sortent de la même négociation
   de mode. La conséquence est une capture à 1280×720, soit 1066×720 après recadrage au
   ratio de tirage — en dessous des 1748×1181 d'une carte postale à 300 dpi. Sans
   importance : ce driver sert le développement et la démonstration sur poste de bureau,
   le tirage viendra du Pi. Monter la résolution coûterait la fluidité du preview, qui est
   précisément ce qu'on vient regarder ici.

2. **Aucun thread lecteur.** Le driver Pi maintient un tampon partagé parce que son
   encodeur MJPEG tourne de toute façon, en continu, dès `start_recording()`. Ici rien ne
   tourne si personne ne lit : les frames sont tirées à la demande dans le générateur de
   preview. Un thread lecteur n'économiserait rien et ajouterait un cycle de vie à gérer.

3. **Le périphérique n'est retenu que pendant qu'on le regarde.** Un capteur CSI est dédié
   à la borne ; une webcam est celle d'un poste de travail, avec une LED allumée et une
   visioconférence qui voudra peut-être la même caméra. Le driver la libère après un délai
   sans flux d'aperçu et la rouvre à la demande. Le driver Pi, lui, garde le comportement
   d'origine : rien à voler là-bas, et sa réouverture coûte un `start_recording()`.

Ce module importe cv2 au niveau global, comme le driver Pi importe picamera2 : il n'est
chargé que si la fabrique le sélectionne, ce qui garde le backend démarrable sans OpenCV
installé.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import cv2

from dropyourmoment.core.errors import CameraCaptureError, CameraNotAvailableError
from dropyourmoment.hardware.camera.base import (
    CameraCapabilities,
    CameraDriver,
    CaptureResult,
)
from dropyourmoment.hardware.camera.preview_activity import PreviewActivity

logger = logging.getLogger(__name__)

# Demandé, pas garanti : la webcam retiendra le mode supporté le plus proche. 720p est le
# mode que toute webcam sait tenir à cadence pleine, et le ratio 16:9 est celui du capteur
# Pi — le cadre de visée se comporte donc pareil des deux côtés.
REQUESTED_SIZE = (1280, 720)

PREVIEW_QUALITY = 75
STILL_QUALITY = 92

# Délai sans flux d'aperçu avant de rendre le périphérique. Assez long pour qu'un
# aller-retour entre l'écran de review et une nouvelle prise ne paie pas de réouverture,
# assez court pour que la LED s'éteigne quand on a fermé l'onglet. Réglable à la
# construction : la bonne valeur se mesure devant la borne, pas ici.
IDLE_RELEASE_S = 15.0

# Cadence du veilleur. Une seconde suffit : la libération n'est pas urgente à la frame près.
JANITOR_TICK_S = 1.0


class OpencvCameraDriver(CameraDriver):
    def __init__(
        self,
        device: int | str = 0,
        requested_size: tuple[int, int] = REQUESTED_SIZE,
        idle_release_s: float = IDLE_RELEASE_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._device = device
        self._requested_size = requested_size
        self._idle_release_s = idle_release_s
        self._clock = clock
        self._capture: cv2.VideoCapture | None = None
        self._size = requested_size
        # « La webcam existe », par opposition à « elle est ouverte en ce moment ». Les deux
        # coïncidaient tant que le périphérique était retenu du démarrage à l'arrêt.
        self._detected = False
        self._last_used = clock()
        self._shutdown = threading.Event()
        self._janitor: threading.Thread | None = None
        # ponytail: un seul verrou pour le preview et la capture. Deux plafonds connus —
        # chaque flux de preview supplémentaire paie son propre encodage JPEG, et une frame
        # peut être périmée si plus personne ne draine la file du pilote. Ni l'un ni l'autre
        # ne se produit dans le parcours réel : un seul kiosque lit, et la capture arrive à
        # la fin du décompte, preview vivant. Si ça change : thread lecteur + tampon partagé,
        # comme picamera2_driver.py.
        self._lock = threading.Lock()
        self._activity = PreviewActivity()

    def start(self) -> None:
        """Ouvre le périphérique et lance le veilleur qui le libérera. Idempotent."""
        self._shutdown.clear()
        self._ensure_open()
        if self._janitor is None:
            self._janitor = threading.Thread(
                target=self._release_when_idle,
                name="dym-camera-idle",
                daemon=True,
            )
            self._janitor.start()

    def _ensure_open(self) -> None:
        with self._lock:
            if self._capture is None:
                self._open_locked()

    def _open_locked(self) -> None:
        capture = cv2.VideoCapture(self._device)
        if not capture.isOpened():
            capture.release()
            raise CameraNotAvailableError(
                f"webcam {self._device!r} introuvable ou déjà utilisée "
                "(sur macOS, vérifier l'autorisation caméra du terminal)"
            )

        width, height = self._requested_size
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        # Relecture obligatoire : le mode demandé n'est qu'un vœu, le pilote retient le
        # mode supporté le plus proche sans le signaler. Annoncer la taille demandée
        # plutôt que la taille réelle ferait mentir le cadre de visée du frontend, qui se
        # dimensionne sur `preview_size`.
        self._size = (
            int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
        self._capture = capture
        self._detected = True
        self._last_used = self._clock()

        if self._size != self._requested_size:
            logger.info(
                "webcam %r : %s demandé, %s négocié", self._device, self._requested_size, self._size
            )
        logger.info("webcam %r ouverte : %s", self._device, self._size)

    def stop(self) -> None:
        self._shutdown.set()
        janitor, self._janitor = self._janitor, None
        if janitor is not None:
            janitor.join(timeout=2.0)
        with self._lock:
            if self._capture is not None:
                self._release_locked("arrêt")

    def is_available(self) -> bool:
        """La webcam est utilisable, pas forcément ouverte à cet instant.

        La nuance vient de la libération à l'inactivité. L'écran d'accueil se sert de cette
        réponse pour activer « Commencer » : la lier à « ouverte maintenant » désactiverait
        le bouton dès que la LED s'éteint, c'est-à-dire tout le temps.

        Une webcam débranchée pendant que le périphérique était rendu reste donc annoncée
        présente jusqu'à la tentative d'ouverture suivante. C'est le bon arbitrage : le
        parcours échoue alors avec un écran d'erreur, là où un bouton grisé sans explication
        laisserait l'opérateur sans piste.
        """
        return self._detected

    @property
    def holds_device(self) -> bool:
        """Le périphérique est retenu en ce moment. Sert au diagnostic, pas au parcours."""
        return self._capture is not None

    def _release_when_idle(self) -> None:
        """Rend le périphérique quand plus personne ne regarde.

        Un thread, et non un contrôle à la lecture du statut comme pour la machine à états :
        la LED doit s'éteindre même quand aucun navigateur n'interroge le backend. C'est
        précisément le cas gênant — un `task run` laissé dans un terminal pendant qu'on
        travaille, aucun onglet ouvert, et donc rien qui viendrait déclencher le contrôle.
        """
        while not self._shutdown.wait(JANITOR_TICK_S):
            with self._lock:
                if self._should_release_locked():
                    self._release_locked("inactivité")

    def _should_release_locked(self, now: float | None = None) -> bool:
        """Vrai si le périphérique est retenu pour rien depuis assez longtemps.

        Le test sur les flux actifs est ce qui empêche de couper un aperçu vivant sous les
        pieds d'un visiteur : `PreviewActivity` compte par activité, donc un générateur
        pompé bat à chaque frame et ne peut pas être pris pour inactif.
        """
        if self._capture is None or self._activity.active > 0:
            return False
        return (self._clock() if now is None else now) - self._last_used >= self._idle_release_s

    def _release_locked(self, reason: str) -> None:
        capture, self._capture = self._capture, None
        try:
            capture.release()
        finally:
            logger.info("webcam %r libérée (%s)", self._device, reason)

    def get_capabilities(self) -> CameraCapabilities:
        return CameraCapabilities(
            driver_name="opencv",
            still_size=self._size,
            preview_size=self._size,
            supports_live_preview=True,
        )

    @property
    def active_streams(self) -> int:
        return self._activity.active

    def preview_frames(self) -> Iterator[bytes]:
        try:
            self._ensure_open()
        except CameraNotAvailableError as exc:
            # Terminer le flux plutôt que lever : la réponse HTTP est déjà commencée, et le
            # frontend ne ferait rien de mieux d'une exception que d'un flux vide. Une
            # webcam qui a disparu se lit sur la page de santé, pas dans un flux MJPEG.
            logger.warning("flux d'aperçu impossible : %s", exc)
            return
        with self._activity.track() as heartbeat:
            if self._activity.active > 1:
                logger.warning("%d flux de preview actifs simultanément", self._activity.active)
            # Pas de temporisation : `read()` bloque jusqu'à la frame suivante, c'est le
            # capteur qui cadence le flux. La condition porte sur l'arrêt du driver et non
            # sur `_capture`, que le veilleur pourrait remettre à None — il ne le fera pas
            # tant que ce générateur bat, mais lire la même variable des deux côtés
            # inviterait la confusion.
            while not self._shutdown.is_set():
                frame = self._read_frame()
                if frame is None:
                    # Webcam débranchée en cours de route : terminer le générateur plutôt
                    # que laisser la requête HTTP pendue.
                    logger.warning("lecture de frame échouée — arrêt du flux de preview")
                    return
                heartbeat()
                yield _encode_jpeg(frame, PREVIEW_QUALITY)

    def capture_still(self, dest: Path) -> CaptureResult:
        # Ici on laisse remonter : le routeur en fait un écran d'erreur, ce qui est la
        # bonne réponse à « le visiteur a appuyé et rien n'est sorti ».
        self._ensure_open()
        frame = self._read_frame()
        if frame is None:
            raise CameraCaptureError(f"lecture de frame échouée sur la webcam {self._device!r}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_encode_jpeg(frame, STILL_QUALITY))
        return CaptureResult(path=dest, size=self._size)

    def _read_frame(self):
        """Une frame BGR, ou None si la webcam ne répond plus."""
        with self._lock:
            capture = self._capture
            if capture is None:
                return None
            ok, frame = capture.read()
            if ok:
                self._last_used = self._clock()
        return frame if ok else None


def _encode_jpeg(frame, quality: int) -> bytes:
    # cv2 travaille en BGR et `imencode` l'attend dans cet ordre : aucune conversion.
    ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise CameraCaptureError("encodage JPEG échoué")
    return buffer.tobytes()
