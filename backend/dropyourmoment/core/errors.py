"""Exceptions métier du photobooth.

Ces exceptions portent un message technique destiné aux logs serveur. Les routers les
traduisent en messages génériques et rassurants pour le visiteur : un détail de driver
ou un code CUPS n'a rien à faire sur l'écran tactile.
"""


class PhotoboothError(Exception):
    """Base de toutes les erreurs métier."""


class CameraError(PhotoboothError):
    """Base des erreurs caméra."""


class CameraNotAvailableError(CameraError):
    """Aucune caméra utilisable (absente, déjà ouverte, driver indisponible)."""


class CameraCaptureError(CameraError):
    """La capture a échoué alors que la caméra était disponible."""


class PrinterError(PhotoboothError):
    """Base des erreurs imprimante."""


class PrinterOfflineError(PrinterError):
    """L'imprimante ne répond pas."""


class PrintJobFailedError(PrinterError):
    """Le job a été accepté puis a échoué (bourrage, plus de papier, déconnexion)."""


class InsufficientPaperError(PrinterError):
    """Le stock estimé du bac ou de la cartouche ne couvre pas le tirage demandé."""


class InvalidTransitionError(PhotoboothError):
    """Événement inapplicable dans l'état courant de la session."""

    def __init__(self, state: object, event: object) -> None:
        super().__init__(f"transition impossible : {event} depuis l'état {state}")
        self.state = state
        self.event = event
