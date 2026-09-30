"""Accès au portail par code de session, persistant tant que le hotspot reste actif."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path

from dropyourmoment.storage.atomic import write_atomic

PBKDF2_ITERATIONS = 200_000


@dataclass
class OperatorAccess:
    data_dir: Path
    max_attempts: int = 5
    attempt_window_s: float = 60.0
    _code: str | None = field(default=None, init=False, repr=False)
    _salt: bytes = field(default=b"", init=False, repr=False)
    _digest: bytes = field(default=b"", init=False, repr=False)
    _sessions: set[str] = field(default_factory=set, init=False, repr=False)
    _attempts: dict[str, list[float]] = field(default_factory=dict, init=False, repr=False)

    def __post_init__(self) -> None:
        self._load()

    @property
    def path(self) -> Path:
        return self.data_dir / "operator-access.json"

    @property
    def active(self) -> bool:
        return self._code is not None

    @property
    def code(self) -> str | None:
        return self._code

    def activate(self) -> str:
        if self._code is not None:
            return self._code
        self._code = f"{secrets.randbelow(1_000_000):06d}"
        self._salt = secrets.token_bytes(16)
        self._digest = self._hash(self._code)
        self._sessions.clear()
        self._attempts.clear()
        self._save()
        return self._code

    def authenticate(self, code: str, client: str) -> str | None:
        now = time.monotonic()
        attempts = [
            stamp for stamp in self._attempts.get(client, []) if now - stamp < self.attempt_window_s
        ]
        if len(attempts) >= self.max_attempts:
            self._attempts[client] = attempts
            raise RuntimeError("trop de tentatives ; réessayez dans une minute")
        if not self.active or not hmac.compare_digest(self._hash(code), self._digest):
            attempts.append(now)
            self._attempts[client] = attempts
            return None
        self._attempts.pop(client, None)
        token = secrets.token_urlsafe(32)
        self._sessions.add(self._token_hash(token))
        self._save()
        return token

    def authorize(self, token: str | None) -> bool:
        return not self.active or (token is not None and self._token_hash(token) in self._sessions)

    def deactivate(self) -> None:
        self._code = None
        self._salt = b""
        self._digest = b""
        self._sessions.clear()
        self._attempts.clear()
        self._save()

    def _hash(self, code: str) -> bytes:
        return hashlib.pbkdf2_hmac("sha256", code.encode(), self._salt, PBKDF2_ITERATIONS)

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def _save(self) -> None:
        payload = {
            "code": self._code,
            "salt": self._salt.hex(),
            "digest": self._digest.hex(),
            "sessions": sorted(self._sessions),
        }
        write_atomic(self.path, json.dumps(payload, separators=(",", ":")).encode())
        self.path.chmod(0o600)

    def _load(self) -> None:
        try:
            payload = json.loads(self.path.read_text())
            code = payload.get("code")
            self._code = code if isinstance(code, str) and len(code) == 6 else None
            self._salt = bytes.fromhex(payload.get("salt", ""))
            self._digest = bytes.fromhex(payload.get("digest", ""))
            self._sessions = set(payload.get("sessions", []))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            self._code = None
            self._salt = b""
            self._digest = b""
            self._sessions = set()
