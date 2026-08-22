from pathlib import Path
from types import SimpleNamespace

from dropyourmoment.hardware import system_metrics


def test_lecture_cpu_et_memoire(monkeypatch) -> None:
    monkeypatch.setattr(system_metrics.psutil, "cpu_percent", lambda interval=None: 37.5)
    monkeypatch.setattr(
        system_metrics.psutil,
        "virtual_memory",
        lambda: SimpleNamespace(used=3_000, total=8_000, percent=37.5),
    )
    monkeypatch.setattr(system_metrics, "_temperature_c", lambda: 54.25)

    metrics = system_metrics.read_system_metrics()

    assert metrics.cpu_percent == 37.5
    assert metrics.memory_used_bytes == 3_000
    assert metrics.memory_total_bytes == 8_000
    assert metrics.memory_percent == 37.5
    assert metrics.temperature_c == 54.25


def test_temperature_prefere_le_capteur_cpu(monkeypatch, tmp_path: Path) -> None:
    readings = {
        "autre": [SimpleNamespace(current=22.0)],
        "cpu_thermal": [SimpleNamespace(current=51.75)],
    }
    monkeypatch.setattr(
        system_metrics.psutil, "sensors_temperatures", lambda: readings, raising=False
    )

    assert system_metrics._temperature_c(tmp_path / "absent") == 51.75


def test_temperature_du_pi_en_repli(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(system_metrics.psutil, "sensors_temperatures", lambda: {}, raising=False)
    thermal_zone = tmp_path / "temp"
    thermal_zone.write_text("48750\n")

    assert system_metrics._temperature_c(thermal_zone) == 48.75


def test_temperature_indisponible_ne_fait_pas_echouer_la_sante(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(system_metrics.psutil, "sensors_temperatures", lambda: {}, raising=False)

    assert system_metrics._temperature_c(tmp_path / "absent") is None
