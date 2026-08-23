"""API consommée par l'écran tactile.

Exposée uniquement sur la boucle locale. Le frontend est un afficheur : il lit l'état,
déclenche des transitions, et ne détient aucune règle de parcours.

Les routes sont déclarées en `def` et non `async def` : FastAPI les exécute alors dans un
threadpool, ce qui permet aux appels bloquants — capture du capteur, composition Pillow —
de ne pas figer la boucle d'événements, et donc le flux d'aperçu servi en parallèle.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from dropyourmoment.core.errors import CameraError, InvalidTransitionError, PrinterError
from dropyourmoment.core.event_config import LaunchFont
from dropyourmoment.core.session import Session, SessionState
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


class SessionStatus(BaseModel):
    state: SessionState
    session_id: str | None = None
    selected_filter: FilterName | None = None
    remaining_seconds: float | None = None
    error: str | None = None
    # Porte déjà la révision : le frontend n'a pas à fabriquer son propre anti-cache.
    photo_url: str | None = None


class SystemStatus(BaseModel):
    camera_ok: bool
    camera_driver: str
    preview_size: tuple[int, int]
    still_size: tuple[int, int]


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
    screen_flash_enabled: bool


def _status(runtime: Runtime) -> SessionStatus:
    machine = runtime.machine
    # poll() puis tick() à chaque lecture de statut : c'est le seul endroit où le temps
    # avance, et le frontend interroge deux fois par seconde. Dans cet ordre, parce qu'un
    # job qui se termine fait entrer en DONE, dont le timeout ne doit courir qu'à partir
    # de là.
    runtime.print_flow.poll()
    machine.tick()
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
    return SystemStatus(
        camera_ok=runtime.camera.is_available(),
        camera_driver=caps.driver_name,
        preview_size=caps.preview_size,
        still_size=caps.still_size,
    )


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
        screen_flash_enabled=config.screen_flash_enabled,
    )


@router.post("/session", response_model=SessionStatus)
def start_session(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Ouvre une session, en écrasant celle en cours s'il en reste une abandonnée."""
    session = runtime.machine.start()
    logger.info("session %s démarrée", session.id)
    return _status(runtime)


@router.post("/session/cancel", response_model=SessionStatus)
def cancel_session(runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    runtime.machine.reset()
    return _status(runtime)


@router.post("/session/{session_id}/capture", response_model=SessionStatus)
def capture(session_id: str, runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Déclenche la prise, puis compose immédiatement une image affichable.

    Composer tout de suite plutôt que d'attendre un choix de filtre permet à l'écran de
    review d'afficher quelque chose sans aller-retour supplémentaire.
    """
    session = _require_session(runtime, session_id)
    destination = raw_path(runtime.settings.sessions_dir, session.id)

    try:
        runtime.camera.capture_still(destination)
    except CameraError as exc:
        logger.error("capture échouée pour la session %s : %s", session.id, exc)
        runtime.machine.fail(str(exc))
        return _status(runtime)

    session.raw_path = destination
    try:
        runtime.machine.capture()
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    _compose(runtime, session, runtime.default_filter)
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
    _purge(runtime, session)

    try:
        runtime.machine.retake()
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return _status(runtime)


@router.post("/session/{session_id}/print", response_model=SessionStatus)
def print_photo(session_id: str, runtime: Runtime = Depends(get_runtime)) -> SessionStatus:
    """Fige la photo et lance le tirage. `REVIEW → PRINTING`, puis `DONE` à la fin du job.

    Figer ne demande aucune recomposition : `_compose` a déjà écrit `final.jpg` à la
    capture et à chaque changement de filtre, et le passage en PRINTING ferme la porte à
    un CHOOSE_FILTER supplémentaire — la machine à états est fermée par défaut. Il reste à
    vérifier que le fichier est bien là.

    La réponse ne dit pas forcément PRINTING : avec le pilote neutre le job est terminé
    avant même que `_status` le sonde, et le visiteur passe directement à la confirmation.
    C'est le comportement honnête — l'écran d'attente n'a de sens que quand il y a vraiment
    quelque chose à attendre.
    """
    session = _require_session(runtime, session_id)
    if session.final_path is None or not session.final_path.is_file():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="aucune photo à enregistrer")

    try:
        runtime.machine.print()
    except InvalidTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    try:
        runtime.print_flow.submit(session.final_path, runtime.event.config.copies_per_print)
    except PrinterError as exc:
        # Un écran d'erreur, jamais une exception : le visiteur n'a pas à voir un code
        # d'imprimante, et le timeout d'ERROR le ramènera à l'accueil.
        logger.error("tirage refusé pour la session %s : %s", session.id, exc)
        runtime.machine.fail(str(exc))

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

    destination = final_path(runtime.settings.sessions_dir, session.id)
    save_jpeg(image, destination)
    session.final_path = destination
    session.selected_filter = filter_name
    session.photo_revision += 1


def _purge(runtime: Runtime, session: Session) -> None:
    directory = session_dir(runtime.settings.sessions_dir, session.id)
    for path in (session.raw_path, session.final_path):
        if path is not None:
            path.unlink(missing_ok=True)
    if directory.is_dir() and not any(directory.iterdir()):
        directory.rmdir()


def _mjpeg_frames(runtime: Runtime) -> Iterator[bytes]:
    header = f"--{MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\n".encode()
    for frame in runtime.camera.preview_frames():
        yield header + f"Content-Length: {len(frame)}\r\n\r\n".encode() + frame + b"\r\n"
