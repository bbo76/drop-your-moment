"""Tests du comptage de flux de preview par activité."""

from __future__ import annotations

from dropyourmoment.hardware.camera.preview_activity import PreviewActivity


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_aucun_flux_au_depart() -> None:
    assert PreviewActivity().active == 0


def test_un_flux_suivi_est_actif() -> None:
    activity = PreviewActivity()

    with activity.track():
        assert activity.active == 1


def test_sortie_propre_retire_le_flux() -> None:
    activity = PreviewActivity()

    with activity.track():
        pass

    assert activity.active == 0


def test_flux_silencieux_cesse_d_etre_compte() -> None:
    """Cas du générateur abandonné : jamais fermé, mais plus alimenté.

    C'est exactement ce que fait Starlette à une déconnexion client. Le comptage doit
    s'en apercevoir sans dépendre du ramasse-miettes.
    """
    clock = FakeClock()
    activity = PreviewActivity(idle_after_s=1.0, clock=clock)

    tracker = activity.track()
    tracker.__enter__()
    assert activity.active == 1

    clock.advance(1.5)

    assert activity.active == 0, "un flux qui ne consomme plus ne doit plus compter"


def test_le_battement_maintient_le_flux_actif() -> None:
    clock = FakeClock()
    activity = PreviewActivity(idle_after_s=1.0, clock=clock)

    with activity.track() as heartbeat:
        clock.advance(0.9)
        heartbeat()
        clock.advance(0.9)

        assert activity.active == 1


def test_plusieurs_flux_comptes_separement() -> None:
    activity = PreviewActivity()

    with activity.track(), activity.track():
        assert activity.active == 2
