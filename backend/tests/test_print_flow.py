"""Parcours de sortie : review → tirage → confirmation → retour à l'accueil.

Le pilote de test peut répondre immédiatement (comme le pilote neutre), garder le job en
cours (comme le fera CUPS pendant ~40 s), ou refuser la demande. Ce sont les trois formes
que le flux doit encaisser sans que la machine à états s'égare.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from dropyourmoment.config import Settings
from dropyourmoment.core.errors import PrinterOfflineError
from dropyourmoment.core.event_config import EventConfig
from dropyourmoment.core.session import SessionState, StateTimeouts
from dropyourmoment.hardware.printer.base import JobState, PrinterDriver, PrintJob
from dropyourmoment.hardware.printer.null_driver import NullPrinterDriver
from dropyourmoment.runtime import Runtime
from dropyourmoment.storage.paths import final_path, raw_path


class FakePrinterDriver(PrinterDriver):
    """Imprimante pilotable depuis le test.

    `immediate` reproduit le pilote neutre, `spooling` un vrai tirage qui prend du temps,
    `offline` un refus à la soumission.
    """

    def __init__(self, mode: str = "immediate") -> None:
        self.mode = mode
        self.jobs: dict[str, PrintJob] = {}
        self.printed: list[tuple[Path, int]] = []

    def print_image(self, path: Path, copies: int) -> PrintJob:
        if self.mode == "offline":
            raise PrinterOfflineError("imprimante hors ligne")
        self.printed.append((path, copies))
        job = PrintJob(
            id=f"fake-{len(self.jobs) + 1}",
            state=JobState.COMPLETED if self.mode == "immediate" else JobState.PRINTING,
            copies=copies,
        )
        self.jobs[job.id] = job
        return job

    def get_job_status(self, job_id: str) -> PrintJob:
        return self.jobs[job_id]

    def settle(self, state: JobState, detail: str | None = None) -> None:
        """Fait aboutir (ou échouer) le dernier job soumis."""
        last = list(self.jobs)[-1]
        self.jobs[last] = PrintJob(
            id=last, state=state, copies=self.jobs[last].copies, detail=detail
        )


@pytest.fixture
def printer() -> FakePrinterDriver:
    return FakePrinterDriver()


def capture(kiosk: TestClient) -> str:
    session_id = kiosk.post("/api/session").json()["session_id"]
    kiosk.post(f"/api/session/{session_id}/capture")
    return session_id


def test_le_pilote_par_defaut_est_le_pilote_neutre(settings: Settings) -> None:
    """Toute la phase numérique tourne sans imprimante branchée."""
    assert isinstance(Runtime.build(settings).printer, NullPrinterDriver)


def test_le_tirage_mene_a_la_confirmation(kiosk: TestClient) -> None:
    """Job terminé d'emblée : le visiteur passe directement à l'écran de confirmation."""
    session_id = capture(kiosk)

    body = kiosk.post(f"/api/session/{session_id}/print").json()

    assert body["state"] == SessionState.DONE
    assert body["photo_url"], "la confirmation montre la photo"


def test_un_tirage_lent_affiche_l_ecran_d_attente(
    kiosk: TestClient, printer: FakePrinterDriver
) -> None:
    """Ce que fera CUPS au jalon 7 : PRINTING tant que le papier n'est pas sorti."""
    printer.mode = "spooling"
    session_id = capture(kiosk)

    body = kiosk.post(f"/api/session/{session_id}/print").json()
    assert body["state"] == SessionState.PRINTING
    assert kiosk.get("/api/status").json()["state"] == SessionState.PRINTING

    printer.settle(JobState.COMPLETED)

    assert kiosk.get("/api/status").json()["state"] == SessionState.DONE


def test_le_tirage_transmet_le_fichier_fige(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    session_id = capture(kiosk)

    kiosk.post(f"/api/session/{session_id}/print")

    assert printer.printed == [(final_path(runtime.settings.sessions_dir, session_id), 1)]


def test_le_compteur_suit_le_nombre_de_copies(kiosk: TestClient, runtime: Runtime) -> None:
    """Le stock papier déclaré est décrémenté exactement du nombre de copies."""
    runtime.event.config = EventConfig(copies_per_print=3)
    session_id = capture(kiosk)

    kiosk.post(f"/api/session/{session_id}/print")

    assert runtime.counters.read().prints_total == 3


def test_le_compteur_ne_bouge_pas_sans_tirage(kiosk: TestClient, runtime: Runtime) -> None:
    capture(kiosk)

    assert runtime.counters.read().prints_total == 0


def test_le_bac_cp1500_refuse_un_dix_neuvieme_tirage(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    runtime.counters.record_prints(18)
    session_id = capture(kiosk)

    body = kiosk.post(f"/api/session/{session_id}/print").json()

    assert body["state"] == SessionState.ERROR
    assert printer.printed == []


def test_le_tirage_conserve_les_fichiers(kiosk: TestClient, runtime: Runtime) -> None:
    """Contrairement à « refaire » : une photo tirée appartient à la galerie."""
    session_id = capture(kiosk)
    root = runtime.settings.sessions_dir

    kiosk.post(f"/api/session/{session_id}/print")

    assert raw_path(root, session_id).is_file()
    assert final_path(root, session_id).is_file()


def test_enregistrer_conserve_la_photo_sans_imprimer(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    session_id = capture(kiosk)

    body = kiosk.post(f"/api/session/{session_id}/save").json()

    assert body["state"] == SessionState.DONE
    assert body["output_mode"] == "save"
    assert printer.printed == []
    assert final_path(runtime.settings.sessions_dir, session_id).is_file()


def test_le_retour_a_l_accueil_est_automatique(kiosk: TestClient, runtime: Runtime) -> None:
    """Aucune action du visiteur : le timeout de DONE ramène la borne au repos."""
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print")
    runtime.machine.timeouts = StateTimeouts(done=0.0)

    assert kiosk.get("/api/status").json()["state"] == SessionState.IDLE


def test_tirage_refuse_hors_review(kiosk: TestClient) -> None:
    session_id = kiosk.post("/api/session").json()["session_id"]

    assert kiosk.post(f"/api/session/{session_id}/print").status_code == 409


def test_tirage_refuse_deux_fois(kiosk: TestClient) -> None:
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print")

    assert kiosk.post(f"/api/session/{session_id}/print").status_code == 409


def test_tirage_sur_une_session_perimee(kiosk: TestClient) -> None:
    capture(kiosk)
    kiosk.post("/api/session/cancel")

    assert kiosk.post("/api/session/jamais-existe/print").status_code == 409


def test_imprimante_hors_ligne_bascule_en_erreur(
    kiosk: TestClient, printer: FakePrinterDriver
) -> None:
    """Le visiteur voit un écran d'erreur, pas un code d'imprimante."""
    session_id = capture(kiosk)
    printer.mode = "offline"

    body = kiosk.post(f"/api/session/{session_id}/print").json()

    assert body["state"] == SessionState.ERROR
    assert body["error"] == "imprimante hors ligne"


def test_un_job_echoue_bascule_en_erreur(kiosk: TestClient, printer: FakePrinterDriver) -> None:
    """Bourrage ou fin de papier : accepté puis échoué, ce n'est pas le même cas."""
    printer.mode = "spooling"
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print")

    printer.settle(JobState.FAILED, detail="plus de papier")

    body = kiosk.get("/api/status").json()
    assert body["state"] == SessionState.ERROR
    assert body["error"] == "plus de papier"


def test_l_annulation_pendant_le_tirage_oublie_le_job(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print")

    kiosk.post("/api/session/cancel")

    assert kiosk.get("/api/status").json()["state"] == SessionState.IDLE
    assert runtime.print_flow.job is None
    assert runtime.counters.read().prints_total == 0, "un tirage annulé ne compte pas"


def test_la_purge_suit_un_tirage_termine(kiosk: TestClient, runtime: Runtime) -> None:
    """La rétention se déclenche pendant que le visiteur regarde sa confirmation."""
    ancienne = runtime.settings.sessions_dir / "ancienne-session"
    ancienne.mkdir(parents=True)
    (ancienne / "final.jpg").write_bytes(b"x")
    runtime.settings.retention_max_age_days = 0.0

    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print")

    assert not ancienne.exists()
    assert final_path(runtime.settings.sessions_dir, session_id).is_file(), (
        "la session qui vient d'être tirée est épargnée"
    )
