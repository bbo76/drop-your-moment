"""Tests de la machine à états de session.

Le temps est injecté : les timeouts d'inactivité sont testés sans attendre 90 s réelles.
"""

import pytest

from dropyourmoment.core.errors import InvalidTransitionError
from dropyourmoment.core.session import SessionMachine, SessionState, StateTimeouts


class FakeClock:
    """Horloge monotone contrôlée par le test."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def timeouts() -> StateTimeouts:
    return StateTimeouts()


@pytest.fixture
def machine(clock: FakeClock, timeouts: StateTimeouts) -> SessionMachine:
    return SessionMachine(clock=clock, timeouts=timeouts)


def test_demarre_au_repos(machine: SessionMachine) -> None:
    assert machine.state is SessionState.IDLE
    assert machine.session is None


def test_start_cree_une_session_et_passe_en_preview(machine: SessionMachine) -> None:
    session = machine.start()

    assert machine.state is SessionState.PREVIEW
    assert machine.session is session
    assert session.id


def test_parcours_nominal_jusqu_a_la_confirmation(machine: SessionMachine) -> None:
    machine.start()
    machine.capture()
    assert machine.state is SessionState.REVIEW

    machine.choose_filter("bw")
    assert machine.state is SessionState.REVIEW
    assert machine.session is not None
    assert machine.session.selected_filter == "bw"

    machine.print()
    assert machine.state is SessionState.PRINTING

    machine.complete()
    assert machine.state is SessionState.DONE


def test_retake_revient_en_preview_sans_perdre_la_session(machine: SessionMachine) -> None:
    session = machine.start()
    machine.capture()
    machine.retake()

    assert machine.state is SessionState.PREVIEW
    assert machine.session is session, "un retake continue la même session"


def test_capture_refusee_hors_preview(machine: SessionMachine) -> None:
    with pytest.raises(InvalidTransitionError):
        machine.capture()


def test_print_refuse_hors_review(machine: SessionMachine) -> None:
    machine.start()
    with pytest.raises(InvalidTransitionError):
        machine.print()


def test_preview_abandonne_revient_au_repos(
    machine: SessionMachine, clock: FakeClock, timeouts: StateTimeouts
) -> None:
    """Un visiteur qui lance une session puis s'éloigne ne doit pas bloquer la borne."""
    machine.start()

    clock.advance(timeouts.preview + 1)
    machine.tick()

    assert machine.state is SessionState.IDLE
    assert machine.session is None


def test_review_abandonnee_revient_au_repos(
    machine: SessionMachine, clock: FakeClock, timeouts: StateTimeouts
) -> None:
    machine.start()
    machine.capture()

    clock.advance(timeouts.review + 1)
    machine.tick()

    assert machine.state is SessionState.IDLE


def test_tick_ne_fait_rien_avant_expiration(
    machine: SessionMachine, clock: FakeClock, timeouts: StateTimeouts
) -> None:
    machine.start()

    clock.advance(timeouts.preview - 1)
    machine.tick()

    assert machine.state is SessionState.PREVIEW


def test_choisir_un_filtre_repousse_le_timeout(
    machine: SessionMachine, clock: FakeClock, timeouts: StateTimeouts
) -> None:
    """Changer de filtre est une activité : le compte à rebours d'abandon repart de zéro."""
    machine.start()
    machine.capture()

    clock.advance(timeouts.review - 5)
    machine.choose_filter("sepia")

    clock.advance(10)  # dépasse le timeout initial, mais pas celui rechargé
    machine.tick()

    assert machine.state is SessionState.REVIEW


def test_impression_sans_timeout_d_inactivite(machine: SessionMachine, clock: FakeClock) -> None:
    """PRINTING dépend de l'imprimante, pas du visiteur : pas d'expiration par inactivité."""
    machine.start()
    machine.capture()
    machine.print()

    clock.advance(3600)
    machine.tick()

    assert machine.state is SessionState.PRINTING


def test_confirmation_retourne_au_repos_automatiquement(
    machine: SessionMachine, clock: FakeClock, timeouts: StateTimeouts
) -> None:
    machine.start()
    machine.capture()
    machine.print()
    machine.complete()

    clock.advance(timeouts.done + 1)
    machine.tick()

    assert machine.state is SessionState.IDLE


def test_echec_bascule_en_erreur_depuis_n_importe_quel_etat(machine: SessionMachine) -> None:
    machine.start()
    machine.fail("caméra déconnectée")

    assert machine.state is SessionState.ERROR
    assert machine.last_error == "caméra déconnectée"


def test_erreur_expire_vers_le_repos(
    machine: SessionMachine, clock: FakeClock, timeouts: StateTimeouts
) -> None:
    """Un écran d'erreur ne reste pas affiché indéfiniment devant les invités."""
    machine.start()
    machine.fail("échec de capture")

    clock.advance(timeouts.error + 1)
    machine.tick()

    assert machine.state is SessionState.IDLE
    assert machine.last_error is None, "l'erreur est purgée en repartant au repos"


def test_reset_manuel_depuis_l_erreur(machine: SessionMachine) -> None:
    machine.start()
    machine.fail("boum")
    machine.reset()

    assert machine.state is SessionState.IDLE
    assert machine.session is None


def test_nouvelle_session_ecrase_la_precedente(machine: SessionMachine) -> None:
    """Une session abandonnée ne doit pas empêcher le visiteur suivant de démarrer."""
    abandonnee = machine.start()
    machine.capture()

    nouvelle = machine.start()

    assert machine.state is SessionState.PREVIEW
    assert nouvelle.id != abandonnee.id
    assert machine.session is nouvelle


def test_remaining_seconds_decroit(
    machine: SessionMachine, clock: FakeClock, timeouts: StateTimeouts
) -> None:
    """Le frontend a besoin du temps restant pour prévenir avant l'abandon."""
    machine.start()
    assert machine.remaining_seconds() == pytest.approx(timeouts.preview)

    clock.advance(10)
    assert machine.remaining_seconds() == pytest.approx(timeouts.preview - 10)


def test_remaining_seconds_absent_quand_aucun_timeout(machine: SessionMachine) -> None:
    assert machine.remaining_seconds() is None, "IDLE n'expire pas"
