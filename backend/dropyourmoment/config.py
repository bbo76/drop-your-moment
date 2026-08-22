"""Réglages du backend, surchargeables par variables d'environnement `DYM_*`."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from dropyourmoment.core.session import StateTimeouts
from dropyourmoment.hardware.camera.factory import CameraDriverName
from dropyourmoment.hardware.printer.factory import PrinterDriverName
from dropyourmoment.storage.retention import RetentionPolicy

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DYM_", extra="ignore")

    camera_driver: CameraDriverName = CameraDriverName.AUTO

    # `null` pendant toute la phase numérique : le parcours va jusqu'au bout sans
    # imprimante branchée. `cups` s'ajoutera au jalon 7 sans rien changer d'autre.
    printer_driver: PrinterDriverName = PrinterDriverName.NULL

    # Le kiosque n'écoute que sur la boucle locale et l'admin sur toutes les interfaces.
    # C'est cette paire d'adresses de bind — et non une frontière de process — qui porte
    # l'isolation réseau : l'admin reste joignable depuis le PC du LAN, le kiosque non.
    kiosk_host: str = "127.0.0.1"
    kiosk_port: int = 8000
    admin_host: str = "0.0.0.0"  # noqa: S104 — exposition LAN volontaire
    admin_port: int = 8001

    # Timeouts d'inactivité, réglables sur site : la bonne valeur dépend du rythme d'un
    # événement et se mesure en observant de vrais visiteurs, pas en la devinant ici.
    preview_timeout_s: float = 60.0
    review_timeout_s: float = 90.0
    done_timeout_s: float = 8.0
    error_timeout_s: float = 15.0

    data_dir: Path = REPO_ROOT / "data"

    # Rétention : deux garde-fous distincts, l'âge pour ce que l'opérateur règle, le
    # plafond pour éviter le disque plein en pleine soirée (~2 Go par événement).
    retention_max_age_days: float = 30.0
    retention_max_total_gb: float = 8.0

    # Sortie du build Vite. Un seul projet frontend produit les deux points d'entrée :
    # `index.html` pour le kiosque, `admin.html` pour l'administration, avec les mêmes
    # jetons de design et le même client d'API.
    frontend_dist_dir: Path = REPO_ROOT / "frontend" / "dist"

    # Cadence du ticker qui applique les timeouts d'inactivité. `tick()` est aussi appelé
    # à chaque lecture de statut, donc ce ticker n'est qu'un filet de sécurité au cas où
    # le frontend ne poserait plus de question.
    tick_interval_s: float = 1.0

    def retention_policy(self) -> RetentionPolicy:
        return RetentionPolicy.from_gb(
            max_age_days=self.retention_max_age_days,
            max_total_gb=self.retention_max_total_gb,
        )

    def state_timeouts(self) -> StateTimeouts:
        return StateTimeouts(
            preview=self.preview_timeout_s,
            review=self.review_timeout_s,
            done=self.done_timeout_s,
            error=self.error_timeout_s,
        )

    @property
    def sessions_dir(self) -> Path:
        return self.data_dir / "sessions"

    @property
    def event_dir(self) -> Path:
        return self.data_dir / "events" / "current"


def load_settings() -> Settings:
    return Settings()
