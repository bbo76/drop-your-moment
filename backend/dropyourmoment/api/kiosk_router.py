"""API consommée par l'écran tactile.

Exposée uniquement sur la boucle locale. Le frontend est un afficheur : il lit l'état,
déclenche des transitions, et ne détient aucune règle de parcours.

Les routes sont déclarées en `def` et non `async def` : FastAPI les exécute alors dans un
threadpool, ce qui permet aux appels bloquants — capture du capteur, composition Pillow —
de ne pas figer la boucle d'événements, et donc le flux d'aperçu servi en parallèle.
"""

from __future__ import annotations

import logging
import shutil
import time
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, model_validator

from dropyourmoment.core.errors import CameraError, InvalidTransitionError, PrinterError
from dropyourmoment.core.event_config import LaunchFont
from dropyourmoment.core.session import Session, SessionState
from dropyourmoment.hardware.camera.base import AutofocusSettings
from dropyourmoment.hardware.system_metrics import read_system_metrics
from dropyourmoment.imaging.filters import FilterName
from dropyourmoment.imaging.pipeline import CompositionError, save_jpeg
from dropyourmoment.runtime import Runtime
from dropyourmoment.storage.paths import final_path, raw_path, session_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

MJPEG_BOUNDARY = "dymframe"


def get_runtime(request: Request) -> Runtime:
    """Le Runtime est un singleton du process, jamais reconstruit par requête.

    Passe par `Depends` uniquement pour que les tests puissent le remplacer via
    `app.dependency_overrides`.
    """
    return request.app.state.runtime


class PowerTransition(BaseModel):
    action: str
    execute_at: float


class SessionStatus(BaseModel):
    state: SessionState
    session_id: str | None = None
    selected_filter: FilterName | None = None
    remaining_seconds: float | None = None
    error: str | None = None
    # Porte déjà la révision : l'URL change à chaque recomposition.
    photo_url: str | None = None
    output_mode: str | None = None
    output_copies: int = 0
    power_transition: PowerTransition | None = None


class SystemStatus(BaseModel):
    camera_ok: bool
    printer_ok: bool
    operator_attention: bool
    prints_remaining: int
    camera_driver: str
    preview_size: tuple[int, int]
    still_size: tuple[int, int]


class CameraDiagnosticsStatus(BaseModel):
    driver_name: str
    autofocus_state: str | None = None
    lens_position: float | None = None
    focus_fom: float | None = None
    exposure_time_us: int | None = None
    analogue_gain: float | None = None
    autofocus_controls_supported: bool = False
    autofocus_settings: CameraAutofocusRequest | None = None


class CameraAutofocusRequest(BaseModel):
    mode: Literal["continuous", "auto"] = "continuous"
    range: Literal["normal", "macro", "full"] = "normal"
    speed: Literal["normal", "fast"] = "normal"
    window: tuple[
        Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)],
        Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)],
        Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)],
        Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)],
    ] = Field(default=(1 / 3, 1 / 3, 1 / 3, 1 / 3))

    @model_validator(mode="after")
    def validate_window(self) -> CameraAutofocusRequest:
        x, y, width, height = self.window
        if min(x, y, width, height) < 0 or x + width > 1 or y + height > 1:
            raise ValueError("la zone autofocus doit rester dans le cadre, entre 0 et 100 %")
        if width == 0 or height == 0:
            raise ValueError("la zone autofocus doit avoir une taille positive")
        return self


class AutofocusTriggerStatus(BaseModel):
    focused: bool


class EventInfo(BaseModel):
    """Ce qui dépend de l'événement, non du matériel.

    Séparé du statut système parce que ces valeurs sont modifiables depuis le portail
    d'administration : le frontend devra les relire, alors que les capacités du capteur ne
    changent qu'au rebranchement.
    """

    event_name: str
    launch_message: str
    launch_font: LaunchFont
    accent_color: str
    available_filters: list[FilterName]
    print_format_name: str
    print_aspect_ratio: float
    overlay_url: str | None
    default_shot_timer_seconds: int
    capture_paused: bool
    pause_message: str


def _status(runtime: Runtime) -> SessionStatus:
    machine = runtime.machine
    # poll() puis tick() à chaque lecture de statut : c'est le seul endroit où le temps
    # avance, et le frontend interroge deux fois par seconde. Dans cet ordre, parce qu'un
    # job qui se termine fait entrer en DONE, dont le timeout ne doit courir qu'à partir
    # de là.
    runtime.print_flow.poll()
    previous = machine.session
    if (
        not runtime.capture_in_progress
        and machine.tick()
        and previous is not None
        and machine.session is None
    ):
        _remove_temporary_raw(previous)
    session = machine.session
    return SessionStatus(
        state=machine.state,
        session_id=session.id if session else None,
        selected_filter=FilterName(session.selected_filter)
        if session and session.selected_filter
        else None,
        remaining_seconds=machine.remaining_seconds(),
        error=machine.last_error,
        photo_url=_photo_url(session),
        output_mode=session.output_mode if session else None,
        output_copies=session.output_copies if session else 0,
        power_transition=PowerTransition(**vars(pending))
        if (pending := runtime.system_power.pending)
        else None,
    )


def _photo_url(session: Session | None) -> str | None:
    if session is None or session.final_path is None:
        return None
    return f"/api/session/{session.id}/photo?v={session.photo_revision}"


def _require_session(runtime: Runtime, session_id: str) -> Session:
    """Récupère la session active, en refusant un identifiant qui n'est plus le bon.

    Le cas se produit vraiment : un visiteur abandonne, le timeout ramène la borne au
    repos, et l'onglet resté ouvert continue d'agir sur une session disparue.
    """
    session = runtime.machine.session
    if session is None or session.id != session_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="cette session n'est plus active",
        )
    return session


@router.get("/status", response_model=SessionStatus)
def read_status(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    return _status(runtime)


@router.get("/system/status", response_model=SystemStatus)
def read_system_status(runtime: Runtime = Depends(get_runtime)) -> SystemStatus:
    caps = runtime.camera.get_capabilities()
    disk = shutil.disk_usage(runtime.settings.data_dir)
    camera_ok = runtime.camera.is_available()
    prints_remaining = runtime.counters.read().paper_remaining
    power = read_system_metrics()
    return SystemStatus(
        camera_ok=camera_ok,
        # Le pilote neutre est disponible. Le pilote CUPS remplacera cette constante par
        # son état de liaison réel lorsqu'il sera branché.
        printer_ok=True,
        # Le kiosque n'expose ici qu'un signal discret. Les causes et les actions
        # restent derrière le PIN de maintenance.
        operator_attention=(
            not camera_ok
            or disk.free / disk.total <= 0.1
            or prints_remaining <= 5
            or power.undervoltage_now is True
            or power.undervoltage_occurred is True
            or power.throttled_now is True
            or power.throttled_occurred is True
        ),
        prints_remaining=prints_remaining,
        camera_driver=caps.driver_name,
        preview_size=caps.preview_size,
        still_size=caps.still_size,
    )


@router.get("/camera/diagnostics", response_model=CameraDiagnosticsStatus)
def read_camera_diagnostics(
    runtime: Runtime = Depends(get_runtime),
) -> CameraDiagnosticsStatus:
    autofocus_settings = runtime.camera.get_autofocus_settings()
    return CameraDiagnosticsStatus(
        **vars(runtime.camera.get_diagnostics()),
        autofocus_controls_supported=autofocus_settings is not None,
        autofocus_settings=(
            CameraAutofocusRequest(**vars(autofocus_settings))
            if autofocus_settings is not None
            else None
        ),
    )


@router.post("/camera/autofocus", response_model=CameraAutofocusRequest)
def configure_camera_autofocus(
    settings: CameraAutofocusRequest,
    runtime: Runtime = Depends(get_runtime),
) -> AutofocusSettings:
    try:
        applied = runtime.camera.set_autofocus_settings(
            AutofocusSettings(
                mode=settings.mode,
                range=settings.range,
                speed=settings.speed,
                window=settings.window,
            )
        )
        return CameraAutofocusRequest(
            mode=applied.mode,
            range=applied.range,
            speed=applied.speed,
            window=applied.window,
        )
    except NotImplementedError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except CameraError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


@router.post("/camera/autofocus/trigger", response_model=AutofocusTriggerStatus)
def trigger_camera_autofocus(
    runtime: Runtime = Depends(get_runtime),
) -> AutofocusTriggerStatus:
    try:
        return AutofocusTriggerStatus(focused=runtime.camera.trigger_autofocus())
    except NotImplementedError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except CameraError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


@router.get("/event", response_model=EventInfo)
def read_event(runtime: Runtime = Depends(get_runtime)) -> EventInfo:
    config = runtime.event.config
    return EventInfo(
        event_name=config.event_name,
        launch_message=config.launch_message,
        launch_font=config.launch_font,
        accent_color=config.accent_color,
        available_filters=config.available_filters,
        print_format_name=config.print_format.name,
        print_aspect_ratio=config.print_format.aspect_ratio,
        overlay_url=_overlay_url(runtime),
        default_shot_timer_seconds=config.default_shot_timer_seconds,
        capture_paused=config.capture_paused,
        pause_message=config.pause_message,
    )


def _overlay_url(runtime: Runtime) -> str | None:
    path = _overlay_path(runtime)
    if path is None:
        return None
    return f"/api/event/overlay?v={path.stat().st_mtime_ns}"


def _overlay_path(runtime: Runtime) -> Path | None:
    filename = runtime.event.config.overlay_file
    if runtime.event.overlay is None or filename is None:
        return None
    path = runtime.event_store.config_path.parent / filename
    return path if path.is_file() else None


@router.get("/event/overlay")
def read_event_overlay(runtime: Runtime = Depends(get_runtime)) -> FileResponse:
    path = _overlay_path(runtime)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="aucun overlay configuré")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/session", response_model=SessionStatus)
def start_session(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Ouvre une session, en écrasant celle en cours s'il en reste une abandonnée."""
    if runtime.system_power.pending is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                "la borne va s’arrêter ou redémarrer ; aucune nouvelle session ne peut commencer"
            ),
        )
    if runtime.event.config.capture_paused:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="les prises de photo sont temporairement en pause",
        )
    if runtime.machine.session is not None:
        previous = runtime.machine.session
        _remove_temporary_raw(previous)
        if previous.final_path is not None:
            previous.final_path.unlink(missing_ok=True)
            previous.final_path = None
        runtime.machine.reset()
    session = runtime.machine.start()
    logger.info("session %s démarrée", session.id)
    return _status(runtime)


@router.post("/session/cancel", response_model=SessionStatus)
def cancel_session(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    if runtime.capture_in_progress and runtime.machine.session is not None:
        runtime.capture_cancelled_session_id = runtime.machine.session.id
    if runtime.machine.session is not None:
        _remove_temporary_raw(runtime.machine.session)
    runtime.machine.reset()
    return _status(runtime)


@router.post("/session/{session_id}/capture", response_model=SessionStatus)
def capture(session_id: str, runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Déclenche la prise, puis compose immédiatement une image affichable.

    Composer tout de suite plutôt que d'attendre un choix de filtre permet à l'écran de
    review d'afficher quelque chose sans aller-retour supplémentaire.
    """
    if not runtime.capture_lock.acquire(blocking=False):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="une capture est déjà en cours")
    runtime.capture_in_progress = True
    try:
        return _capture(session_id, runtime)
    finally:
        runtime.capture_in_progress = False
        runtime.capture_cancelled_session_id = None
        runtime.capture_lock.release()


def _capture(session_id: str, runtime: Runtime) -> SessionStatus:
    session = _require_session(runtime, session_id)
    captured_at = datetime.now()
    session.photo_date = captured_at.strftime("%Y-%m-%d")
    session.photo_name = captured_at.strftime("%Y%m%d-%H%M%S-%f")
    # Le pipeline et les artefacts de session restent sur la SD.
    destination = raw_path(runtime.settings.sessions_dir, session.id, session.photo_date)

    try:
        capture_started_at = time.monotonic()
        logger.info("capture démarrée pour la session %s", session.id)
        runtime.camera.capture_still(destination)
    except CameraError as exc:
        logger.error("capture échouée pour la session %s : %s", session.id, exc)
        runtime.machine.fail(str(exc))
        return _status(runtime)

    session.raw_path = destination
    logger.info(
        "capture caméra terminée pour la session %s en %.2f s",
        session.id,
        time.monotonic() - capture_started_at,
    )
    if runtime.capture_cancelled_session_id == session_id or runtime.machine.session is not session:
        _remove_temporary_raw(session)
        return _status(runtime)
    try:
        runtime.machine.capture()
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    logger.info("composition photo démarrée pour la session %s", session.id)
    _compose(runtime, session, runtime.default_filter)
    logger.info("composition photo terminée pour la session %s", session.id)
    return _status(runtime)


@router.post("/session/{session_id}/capture/prepare", response_model=SessionStatus)
def prepare_capture(session_id: str, runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Garde la session en prévisualisation pendant le compte à rebours tactile."""
    _require_session(runtime, session_id)
    try:
        runtime.machine.keep_alive()
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _status(runtime)


class FilterChoice(BaseModel):
    name: FilterName


@router.post("/session/{session_id}/filter", response_model=SessionStatus)
def choose_filter(
    session_id: str,
    choice: FilterChoice,
    runtime: Runtime = Depends(get_runtime),
) -> SessionStatus:
    """Applique un filtre à la photo déjà prise. Rejouable autant que voulu."""
    session = _require_session(runtime, session_id)

    if choice.name not in runtime.event.config.available_filters:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"filtre non proposé pour cet événement : {choice.name}",
        )

    try:
        runtime.machine.choose_filter(choice.name)
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    _compose(runtime, session, choice.name)
    return _status(runtime)


@router.post("/session/{session_id}/retake", response_model=SessionStatus)
def retake(session_id: str, runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Repart en aperçu et efface la prise précédente.

    Effacer tout de suite plutôt que de compter sur la politique de rétention : une photo
    dont le visiteur ne voulait pas n'a pas à traîner dans la galerie de l'événement.
    """
    session = _require_session(runtime, session_id)
    _remove_temporary_raw(session)
    if session.final_path is not None:
        session.final_path.unlink(missing_ok=True)
        session.final_path = None
    _purge(runtime, session)

    try:
        runtime.machine.retake()
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return _status(runtime)


class PrintRequest(BaseModel):
    copies: int = Field(ge=1, le=10)


@router.post("/session/{session_id}/print", response_model=SessionStatus)
def print_photo(
    session_id: str,
    request: PrintRequest | None = None,
    runtime: Runtime = Depends(get_runtime),
) -> SessionStatus:
    """Fige la photo et lance le tirage. `REVIEW → PRINTING`, puis `DONE` à la fin du job.

    Figer ne demande aucune recomposition : `_compose` a déjà écrit `final.jpg` à la
    capture et à chaque changement de filtre, et le passage en PRINTING ferme la porte à
    un CHOOSE_FILTER supplémentaire — la machine à états est fermée par défaut. Il reste à
    vérifier que le fichier est bien là.

    La réponse ne dit pas forcément PRINTING : le pilote décide si le job est encore en
    cours. En développement, le pilote neutre configuré simule cette attente.
    """
    session = _require_session(runtime, session_id)
    if session.final_path is None or not session.final_path.is_file():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="aucune photo à enregistrer")

    copies = request.copies if request else runtime.event.config.copies_per_print

    try:
        runtime.machine.print(copies)
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    try:
        runtime.print_flow.submit(session.final_path, copies)
    except PrinterError as exc:
        # Un écran d'erreur, jamais une exception : le visiteur n'a pas à voir un code
        # d'imprimante, et le timeout d'ERROR le ramènera à l'accueil.
        logger.error("tirage refusé pour la session %s : %s", session.id, exc)
        runtime.machine.fail(str(exc))

    return _status(runtime)


@router.post("/session/{session_id}/save", response_model=SessionStatus)
def save_photo(session_id: str, runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Conserve la photo dans la galerie sans demander de tirage."""
    session = _require_session(runtime, session_id)
    if session.final_path is None or not session.final_path.is_file():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="aucune photo à enregistrer")

    try:
        runtime.machine.save()
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    runtime.purge_sessions()
    return _status(runtime)


@router.get("/session/{session_id}/photo")
def read_photo(session_id: str, runtime: Runtime = Depends(get_runtime)) -> FileResponse:
    session = _require_session(runtime, session_id)
    if session.final_path is None or not session.final_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="aucune photo composée")
    return FileResponse(
        session.final_path,
        media_type="image/jpeg",
        # L'URL porte déjà une révision, mais le no-store évite qu'un proxy ou le
        # navigateur conserve une image après un retake.
        headers={"Cache-Control": "no-store"},
    )


@router.get("/preview/stream")
def preview_stream(runtime: Runtime = Depends(get_runtime)) -> StreamingResponse:
    """Flux MJPEG affichable directement dans une balise `<img>`.

    Starlette itère un générateur synchrone dans un threadpool, donc la cadence imposée
    par le driver ne bloque pas la boucle d'événements.
    """
    return StreamingResponse(
        _mjpeg_frames(runtime),
        media_type=f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY}",
        headers={
            # Sans cela Chromium peut resservir une frame mise en cache au retour sur
            # l'écran preview, ce qui se voit à l'écran comme une image gelée.
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Age": "0",
        },
    )


def _compose(runtime: Runtime, session: Session, filter_name: FilterName) -> None:
    """Recompose l'image finale depuis la prise brute et l'écrit sur disque.

    Toujours depuis la prise brute, jamais depuis une image déjà composée : c'est ce qui
    garantit qu'un aller-retour entre filtres redonne exactement le même résultat, et
    qu'aucune compression JPEG ne s'empile.
    """
    assert session.raw_path is not None  # garanti par la transition depuis PREVIEW
    try:
        image = runtime.pipeline.compose(session.raw_path, filter_name)
    except CompositionError as exc:
        logger.error("composition échouée pour la session %s : %s", session.id, exc)
        runtime.machine.fail(str(exc))
        return

    previous_destination = session.final_path
    root = runtime.photo_storage.ensure_destination()
    destination = final_path(root, session.id, session.photo_date, session.photo_name)
    if (
        session.final_path is not None
        and session.final_path.parent.parent == root
        and root == runtime.photo_storage.status.root
    ):
        destination = session.final_path
    runtime.photo_storage.begin_write()
    try:
        # La destination peut disparaître après détection, entre la composition et le
        # commit atomique. Dans ce cas on publie le JPG final sur SD, jamais le RAW.
        save_jpeg(image, destination)
    except OSError as exc:
        if destination.parent.parent == runtime.settings.sessions_dir:
            runtime.machine.fail(f"impossible d’enregistrer la photo sur la carte SD : {exc}")
            return
        logger.warning("écriture photo externe échouée, repli SD : %s", exc)
        if destination.parent.parent != runtime.settings.sessions_dir:
            destination = final_path(
                runtime.settings.sessions_dir, session.id, session.photo_date, session.photo_name
            )
            save_jpeg(image, destination)
    finally:
        runtime.photo_storage.end_write()
    if previous_destination is not None and previous_destination != destination:
        try:
            previous_destination.unlink(missing_ok=True)
        except OSError:
            logger.warning("ancienne version photo non supprimée (support inaccessible)")
    session.final_path = destination
    session.selected_filter = filter_name
    session.photo_revision += 1


def _purge(runtime: Runtime, session: Session) -> None:
    directory = session_dir(runtime.settings.sessions_dir, session.id, session.photo_date)
    for path in (session.raw_path, session.final_path):
        if path is not None:
            path.unlink(missing_ok=True)
    if directory.is_dir() and not any(directory.iterdir()):
        directory.rmdir()


def _remove_temporary_raw(session: Session) -> None:
    if session.raw_path is None:
        return
    session.raw_path.unlink(missing_ok=True)
    temporary_dir = session.raw_path.parent
    try:
        temporary_dir.rmdir()
    except OSError:
        pass
    session.raw_path = None


def _mjpeg_frames(runtime: Runtime) -> Iterator[bytes]:
    header = f"--{MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\n".encode()
    for frame in runtime.camera.preview_frames():
        yield header + f"Content-Length: {len(frame)}\r\n\r\n".encode() + frame + b"\r\n"
