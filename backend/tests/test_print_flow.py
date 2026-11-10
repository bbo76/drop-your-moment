"""Parcours de sortie : review → tirage → confirmation → nouvelle photo.

Le pilote de test peut répondre immédiatement (comme le pilote neutre), garder le job en
cours (comme le fera CUPS pendant ~40 s), ou refuser la demande. Ce sont les trois formes
que le flux doit encaisser sans que la machine à états s'égare.
"""

from __future__ import annotations

import os
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

    def cancel_job(self, job_id: str) -> None:
        self.jobs.pop(job_id)

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


def test_un_job_termine_attend_le_delai_residuel(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    now = [100.0]
    runtime.print_flow._completion_delay_s = 40.0
    runtime.print_flow._clock = lambda: now[0]
    session_id = capture(kiosk)
    body = kiosk.post(f"/api/session/{session_id}/print").json()

    assert body["state"] == SessionState.PRINTING
    assert runtime.counters.read().prints_total == 0

    now[0] += 39.9
    assert kiosk.get("/api/status").json()["state"] == SessionState.PRINTING
    assert runtime.counters.read().prints_total == 0

    now[0] += 0.1
    assert kiosk.get("/api/status").json()["state"] == SessionState.DONE
    assert runtime.counters.read().prints_total == 1


def test_le_delai_residuel_ne_redemarre_pas_a_chaque_poll(
    kiosk: TestClient, runtime: Runtime
) -> None:
    now = [100.0]
    runtime.print_flow._completion_delay_s = 10.0
    runtime.print_flow._clock = lambda: now[0]
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print")

    now[0] += 5.0
    assert kiosk.get("/api/status").json()["state"] == SessionState.PRINTING
    now[0] += 5.0
    assert kiosk.get("/api/status").json()["state"] == SessionState.DONE


def test_un_job_bloque_finit_en_erreur_apres_timeout(kiosk: TestClient, runtime: Runtime) -> None:
    now = [100.0]
    runtime.print_flow._job_timeout_s = 30.0
    runtime.print_flow._clock = lambda: now[0]
    session_id = capture(kiosk)
    runtime.printer.mode = "spooling"  # type: ignore[attr-defined]
    kiosk.post(f"/api/session/{session_id}/print")

    now[0] += 30.0
    status = kiosk.get("/api/status").json()

    assert status["state"] == SessionState.ERROR
    assert status["error"] == "délai d'impression dépassé : vérifiez l'imprimante"


def test_le_tirage_transmet_le_fichier_fige(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    session_id = capture(kiosk)

    kiosk.post(f"/api/session/{session_id}/print")

    assert runtime.machine.session is not None
    assert printer.printed == [(runtime.machine.session.final_path, 1)]


def test_le_visiteur_choisit_le_nombre_d_exemplaires(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    session_id = capture(kiosk)

    body = kiosk.post(f"/api/session/{session_id}/print", json={"copies": 3}).json()

    assert body["output_copies"] == 3
    assert runtime.machine.session is not None
    kiosk.get("/api/status")
    assert printer.printed == [(runtime.machine.session.final_path, 1)] * 3
    kiosk.get("/api/status")
    assert runtime.counters.read().prints_total == 3


def test_lot_sequentiel_attend_chaque_job_et_compte_un_par_un(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    session_id = capture(kiosk)
    response = kiosk.post(f"/api/session/{session_id}/print", json={"copies": 3}).json()
    assert response["print_progress"]["requested"] == 3
    assert response["print_progress"]["current_index"] == 1
    assert len(printer.printed) == 1
    for index in (1, 2, 3):
        assert kiosk.get("/api/status").json()["print_progress"]["completed"] == index - 1
        printer.settle(JobState.COMPLETED)
        status = kiosk.get("/api/status").json()
        assert runtime.counters.read().prints_total == index
        assert len(printer.printed) == (index if index == 3 else index + 1)
        assert status["state"] == ("done" if index == 3 else "printing")
        assert status["print_progress"]["completed"] == index
    assert all(copies == 1 for _, copies in printer.printed)


def test_double_poll_ne_soumet_qu_un_suivant(runtime: Runtime, printer: FakePrinterDriver) -> None:
    from concurrent.futures import ThreadPoolExecutor

    printer.mode = "spooling"
    runtime.print_flow.submit(
        runtime.settings.sessions_dir / "final.jpg", 2, complete_session=False
    )
    printer.settle(JobState.COMPLETED)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: runtime.print_flow.poll(), range(2)))
    assert len(printer.printed) == 2
    assert runtime.counters.read().prints_total == 1


def test_echec_partiel_conserve_le_compte_et_interdit_la_suite(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print", json={"copies": 3})
    printer.settle(JobState.COMPLETED)
    kiosk.get("/api/status")
    printer.settle(JobState.FAILED, "bourrage")
    status = kiosk.get("/api/status").json()
    assert status["state"] == "error"
    assert status["print_progress"]["completed"] == 1
    assert status["print_progress"]["phase"] == "failed"
    assert runtime.counters.read().prints_total == 1
    assert len(printer.printed) == 2
    kiosk.get("/api/status")
    assert len(printer.printed) == 2


def test_annulation_kiosque_empeche_toute_soumission_suivante(
    kiosk: TestClient, admin: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print", json={"copies": 3})
    active = runtime.print_flow.job
    assert active is not None
    assert admin.post("/admin/counters/cassette/reload").status_code == 409
    kiosk.post("/api/session/cancel")
    assert active.id not in printer.jobs
    assert len(printer.printed) == 1
    assert runtime.counters.read().prints_total == 0


def test_redemarrage_met_en_quarantaine_un_job_sans_le_relancer(
    runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    path = runtime.settings.sessions_dir / "final.jpg"
    runtime.print_flow.submit(path, 2, complete_session=False)
    recovered = type(runtime.print_flow)(runtime.machine, printer, runtime.counters)
    assert recovered.progress is not None
    assert recovered.progress.phase == "uncertain"
    with pytest.raises(Exception, match="cours|rapprocher"):
        recovered.submit(path, 2, complete_session=False)
    assert len(printer.printed) == 1


def test_maintenance_retirage_retourne_lot_sans_attendre_la_fin(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver, monkeypatch: pytest.MonkeyPatch
) -> None:
    from dropyourmoment.api import maintenance_router

    printer.mode = "spooling"
    path = runtime.settings.sessions_dir / "final.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()
    monkeypatch.setattr(maintenance_router, "_photo_path", lambda *_args: path)
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "258025"}).status_code == 204
    response = kiosk.post("/api/maintenance/gallery/archived/print", json={"copies": 2})
    assert response.status_code == 202
    assert response.json()["requested"] == 2
    assert response.json()["completed"] == 0
    assert len(printer.printed) == 1


def test_maintenance_annule_le_job_et_conserve_la_progression(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    path = runtime.settings.sessions_dir / "final.jpg"
    runtime.print_flow.submit(path, 3, complete_session=False)
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "258025"}).status_code == 204
    assert kiosk.post("/api/maintenance/print/cancel").status_code == 204
    progress = kiosk.get("/api/maintenance/status").json()["print_progress"]
    assert progress["phase"] == "cancelled"
    assert progress["completed"] == 0
    assert len(printer.printed) == 1


def test_soumission_ambigue_bloque_et_exige_rapprochement(
    runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "offline"
    path = runtime.settings.sessions_dir / "final.jpg"
    with pytest.raises(PrinterOfflineError):
        runtime.print_flow.submit(path, 2, complete_session=False)
    assert runtime.print_flow.busy
    assert runtime.print_flow.progress is not None
    assert runtime.print_flow.progress.phase == "uncertain"
    with pytest.raises(Exception, match="cours|rapprocher"):
        runtime.print_flow.submit(path, 2, complete_session=False)
    runtime.print_flow.acknowledge_uncertain()
    assert not runtime.print_flow.busy


def test_rapprochement_api_debloque_sans_relancer(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "offline"
    with pytest.raises(PrinterOfflineError):
        runtime.print_flow.submit(
            runtime.settings.sessions_dir / "final.jpg", 2, complete_session=False
        )
    assert kiosk.post("/api/maintenance/unlock", json={"pin": "258025"}).status_code == 204
    assert kiosk.get("/api/maintenance/status").json()["print_busy"] is True
    assert kiosk.post("/api/maintenance/print/reconcile").status_code == 204
    assert kiosk.get("/api/maintenance/status").json()["print_busy"] is False
    assert len(printer.printed) == 0


def test_stock_revalide_avant_le_job_suivant(runtime: Runtime, printer: FakePrinterDriver) -> None:
    printer.mode = "spooling"
    path = runtime.settings.sessions_dir / "final.jpg"
    runtime.print_flow.submit(path, 3, complete_session=False)
    runtime.counters.record_prints(16)
    printer.settle(JobState.COMPLETED)
    runtime.print_flow.poll()
    assert runtime.print_flow.progress is not None
    assert runtime.print_flow.progress.phase == "failed"
    assert runtime.print_flow.progress.completed == 1
    assert runtime.print_flow.progress.current_index == 2
    assert len(printer.printed) == 1


def test_statut_cups_inaccessible_ne_resoumet_pas(
    runtime: Runtime, printer: FakePrinterDriver, monkeypatch: pytest.MonkeyPatch
) -> None:
    printer.mode = "spooling"
    runtime.print_flow.submit(
        runtime.settings.sessions_dir / "final.jpg", 2, complete_session=False
    )

    def unavailable(_job_id: str) -> PrintJob:
        raise PrinterOfflineError("statut CUPS inaccessible")

    monkeypatch.setattr(printer, "get_job_status", unavailable)
    runtime.print_flow.poll()
    runtime.print_flow.poll()
    assert runtime.print_flow.progress is not None
    assert runtime.print_flow.progress.phase == "uncertain"
    assert runtime.counters.read().prints_total == 0
    assert len(printer.printed) == 1


def test_lot_pending_printing_settling_et_timeout_par_job(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    now = [100.0]
    runtime.print_flow._clock = lambda: now[0]
    runtime.print_flow._completion_delay_s = 5
    runtime.print_flow._job_timeout_s = 30
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print", json={"copies": 2})
    printer.settle(JobState.PENDING)
    assert kiosk.get("/api/status").json()["print_progress"]["phase"] == "pending"
    now[0] += 10
    printer.settle(JobState.PRINTING)
    assert kiosk.get("/api/status").json()["print_progress"]["elapsed_s"] == 10
    printer.settle(JobState.COMPLETED)
    assert kiosk.get("/api/status").json()["print_progress"]["phase"] == "settling"
    assert runtime.counters.read().prints_total == 0
    now[0] += 5
    assert kiosk.get("/api/status").json()["print_progress"]["completed"] == 1
    assert len(printer.printed) == 2
    now[0] += 30
    result = kiosk.get("/api/status").json()
    assert result["print_progress"]["phase"] == "uncertain"
    assert result["print_progress"]["completed"] == 1
    assert len(printer.printed) == 2


def test_timeout_global_arrete_lot_meme_si_job_reste_dans_son_delai(
    runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    now = [100.0]
    runtime.print_flow._clock = lambda: now[0]
    runtime.print_flow._job_timeout_s = 30
    runtime.print_flow._batch_timeout_s = 20
    runtime.print_flow.submit(
        runtime.settings.sessions_dir / "final.jpg", 2, complete_session=False
    )
    now[0] += 15
    printer.settle(JobState.COMPLETED)
    runtime.print_flow.poll()
    assert len(printer.printed) == 2
    now[0] += 5
    runtime.print_flow.poll()
    assert runtime.print_flow.progress is not None
    assert runtime.print_flow.progress.phase == "uncertain"
    assert runtime.print_flow.progress.completed == 1


def test_le_kiosque_refuse_plus_de_dix_exemplaires(
    kiosk: TestClient, printer: FakePrinterDriver
) -> None:
    session_id = capture(kiosk)

    response = kiosk.post(f"/api/session/{session_id}/print", json={"copies": 11})

    assert response.status_code == 422
    assert printer.printed == []


def test_le_compteur_suit_le_nombre_de_copies(kiosk: TestClient, runtime: Runtime) -> None:
    """Le stock papier déclaré est décrémenté exactement du nombre de copies."""
    runtime.event.config = EventConfig(copies_per_print=3)
    session_id = capture(kiosk)

    kiosk.post(f"/api/session/{session_id}/print")
    kiosk.get("/api/status")
    kiosk.get("/api/status")

    assert runtime.counters.read().prints_total == 3


def test_le_compteur_ne_bouge_pas_sans_tirage(kiosk: TestClient, runtime: Runtime) -> None:
    capture(kiosk)

    assert runtime.counters.read().prints_total == 0


def test_un_retirage_de_maintenance_ne_change_pas_la_session(
    runtime: Runtime, printer: FakePrinterDriver
) -> None:
    printer.mode = "spooling"
    path = runtime.settings.sessions_dir / "archive" / "final.jpg"
    path.parent.mkdir(parents=True)
    path.touch()

    runtime.print_flow.submit(path, 2, complete_session=False)
    printer.settle(JobState.COMPLETED)
    runtime.print_flow.poll()
    printer.settle(JobState.COMPLETED)
    runtime.print_flow.poll()

    assert runtime.machine.state is SessionState.IDLE
    assert runtime.counters.read().prints_total == 2


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
    session = runtime.machine.session
    assert session is not None

    kiosk.post(f"/api/session/{session_id}/print")

    assert session.raw_path is None
    assert session.final_path is not None and session.final_path.is_file()


def test_enregistrer_conserve_la_photo_sans_imprimer(
    kiosk: TestClient, runtime: Runtime, printer: FakePrinterDriver
) -> None:
    session_id = capture(kiosk)

    body = kiosk.post(f"/api/session/{session_id}/save").json()

    assert body["state"] == SessionState.DONE
    assert body["output_mode"] == "save"
    assert printer.printed == []
    assert runtime.machine.session is not None
    assert runtime.machine.session.final_path is not None
    assert runtime.machine.session.final_path.is_file()


def test_la_confirmation_prepare_automatiquement_une_nouvelle_photo(
    kiosk: TestClient, runtime: Runtime
) -> None:
    """La confirmation expire vers une session neuve, prête à photographier."""
    session_id = capture(kiosk)
    kiosk.post(f"/api/session/{session_id}/print")
    runtime.machine.timeouts = StateTimeouts(done=0.0)

    body = kiosk.get("/api/status").json()

    assert body["state"] == SessionState.PREVIEW
    assert body["session_id"] != session_id
    assert body["photo_url"] is None


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
    ancienne = runtime.photo_storage.sessions_root / "2026-09-01" / "ancienne-session"
    ancienne.mkdir(parents=True)
    photo_ancienne = ancienne / "ancienne.jpg"
    photo_ancienne.write_bytes(b"x")
    os.utime(photo_ancienne, (0, 0))
    runtime.settings.retention_max_age_days = 0.0

    session_id = capture(kiosk)
    result = kiosk.post(f"/api/session/{session_id}/print").json()
    assert result["state"] == "done"

    assert not ancienne.exists()
    assert runtime.machine.session is not None
    assert runtime.machine.session.final_path is not None
    assert runtime.machine.session.final_path.is_file(), (
        "la session qui vient d'être tirée est épargnée"
    )
