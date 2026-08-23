"""PIN de maintenance persistant, salé et jamais stocké en clair."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from pathlib import Path

from dropyourmoment.storage.atomic import write_atomic

PIN_FILENAME = "maintenance_pin.json"
PBKDF2_ITERATIONS = 200_000


class MaintenancePinStore:
    def __init__(self, data_dir: Path, default_pin: str) -> None:
        self._path = data_dir / PIN_FILENAME
        self._default_pin = default_pin

    def verify(self, candidate: str) -> bool:
        stored = self._read()
        if stored is None:
            return hmac.compare_digest(candidate, self._default_pin)
        salt, expected = stored
        actual = _digest(candidate, salt)
        return hmac.compare_digest(actual, expected)

    def replace(self, pin: str) -> None:
        salt = secrets.token_bytes(16)
        payload = {
            "version": 1,
            "algorithm": "pbkdf2-sha256",
            "iterations": PBKDF2_ITERATIONS,
            "salt": salt.hex(),
            "digest": _digest(pin, salt).hex(),
        }
        write_atomic(
            self._path,
            (json.dumps(payload, indent=2) + "\n").encode("utf-8"),
        )

    def _read(self) -> tuple[bytes, bytes] | None:
        if not self._path.is_file():
            return None
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
            if (
                payload["version"] != 1
                or payload["algorithm"] != "pbkdf2-sha256"
                or payload["iterations"] != PBKDF2_ITERATIONS
            ):
                return None
            return bytes.fromhex(payload["salt"]), bytes.fromhex(payload["digest"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError):
            # Même arbitrage que les autres fichiers d'exploitation : une valeur abîmée
            # retombe sur le PIN de déploiement au lieu de condamner l'accès local.
            return None


def _digest(pin: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
