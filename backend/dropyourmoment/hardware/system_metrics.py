"""Métriques légères de la machine hôte pour la page de santé."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import psutil

PI_THERMAL_ZONE = Path("/sys/class/thermal/thermal_zone0/temp")


@dataclass(frozen=True)
class SystemMetrics:
    cpu_percent: float
    memory_used_bytes: int
    memory_total_bytes: int
    memory_percent: float
    temperature_c: float | None


def read_system_metrics() -> SystemMetrics:
    """Lecture instantanée sans intervalle bloquant.

    ``cpu_percent(interval=None)`` compare avec l'appel précédent ; la page de santé le
    rappelle toutes les deux secondes, ce qui fournit naturellement la fenêtre de mesure.
    """
    memory = psutil.virtual_memory()
    return SystemMetrics(
        cpu_percent=psutil.cpu_percent(interval=None),
        memory_used_bytes=memory.used,
        memory_total_bytes=memory.total,
        memory_percent=memory.percent,
        temperature_c=_temperature_c(),
    )


def _temperature_c(thermal_zone: Path = PI_THERMAL_ZONE) -> float | None:
    """Température CPU si le système l'expose, sans rendre la santé fragile."""
    sensors = getattr(psutil, "sensors_temperatures", None)
    if sensors is not None:
        try:
            groups = sensors()
        except (OSError, RuntimeError):
            groups = {}
        preferred = ("cpu_thermal", "coretemp", "k10temp", "soc_thermal")
        for name in (*preferred, *groups):
            readings = groups.get(name, [])
            if readings and readings[0].current is not None:
                return float(readings[0].current)

    # Raspberry Pi OS expose toujours ce fichier même si psutil ne remonte aucun groupe.
    try:
        return int(thermal_zone.read_text().strip()) / 1000
    except (OSError, ValueError):
        return None
