"""Lecture bornée et nettoyée du journal systemd de la borne."""

from __future__ import annotations

import json
import re
import subprocess
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel

JournalLevel = Literal["critical", "error", "warning", "info", "debug"]
JournalComponent = Literal["borne", "camera", "impression", "reseau"]

ALLOWED_UNITS = ("dropyourmoment.service",)
MAX_OFFSET = 1_000
MAX_READ = 1_000

_KEYED_SECRET = re.compile(
    r"(?i)(password|passwd|secret|token|cookie|authorization|pin|code)(\s*[=:]\s*)([^\s,;&#?]+)"
)
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")
_URL_SECRET = re.compile(r"(?i)([?&](?:password|passwd|secret|token|code|pin)=)[^&#\s]+")


class JournalEntry(BaseModel):
    timestamp: datetime
    level: JournalLevel
    component: JournalComponent
    message: str
    context: dict[str, str]


class JournalPage(BaseModel):
    entries: list[JournalEntry]
    next_offset: int | None


class JournalUnavailable(RuntimeError):
    pass


def sanitize(value: str) -> str:
    value = _BEARER.sub("Bearer [masqué]", value)
    value = _KEYED_SECRET.sub(lambda match: f"{match[1]}{match[2]}[masqué]", value)
    return _URL_SECRET.sub(lambda match: f"{match[1]}[masqué]", value)


def read_journal(
    *,
    offset: int = 0,
    limit: int = 50,
    since: datetime | None = None,
    until: datetime | None = None,
    level: JournalLevel | None = None,
    incidents: bool = False,
    component: JournalComponent | None = None,
    search: str | None = None,
    detail: bool = True,
    run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> JournalPage:
    """Lit journald sans shell, puis applique les filtres sur une tranche plafonnée."""
    filtered = level is not None or incidents or component is not None or bool(search)
    fetch_limit = MAX_READ if filtered else min(MAX_READ, offset + limit + 1)
    command = [
        "journalctl",
        "--no-pager",
        "--output=json",
        "--reverse",
        f"--lines={fetch_limit}",
    ]
    for unit in ALLOWED_UNITS:
        command.append(f"--unit={unit}")
    if since:
        command.append(f"--since={since.isoformat()}")
    if until:
        command.append(f"--until={until.isoformat()}")
    try:
        result = run(command, capture_output=True, text=True, timeout=2, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        raise JournalUnavailable("Les journaux système sont indisponibles.") from exc
    if result.returncode:
        raise JournalUnavailable("Les journaux système sont indisponibles.")

    entries: list[JournalEntry] = []
    needle = search.casefold().strip() if search else None
    for line in result.stdout.splitlines():
        try:
            record = json.loads(line)
            entry = _entry(record, detail=detail)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            continue
        if level and entry.level != level:
            continue
        if incidents and entry.level not in {"critical", "error", "warning"}:
            continue
        if component and entry.component != component:
            continue
        searchable = f"{entry.message} {' '.join(entry.context.values())}".casefold()
        if needle and needle not in searchable:
            continue
        entries.append(entry)

    page = entries[offset : offset + limit]
    return JournalPage(
        entries=page,
        next_offset=offset + limit if len(entries) > offset + limit else None,
    )


def _entry(record: dict[str, object], *, detail: bool) -> JournalEntry:
    raw_message = sanitize(str(record["MESSAGE"]))
    message = raw_message if detail else raw_message.splitlines()[0]
    if not detail and len(message) > 220:
        message = f"{message[:219]}…"
    timestamp = datetime.fromtimestamp(
        int(str(record["__REALTIME_TIMESTAMP"])) / 1_000_000,
        tz=UTC,
    )
    identifier = str(record.get("SYSLOG_IDENTIFIER", ""))
    context = {}
    if detail:
        for source, target in (
            ("_SYSTEMD_UNIT", "unité"),
            ("SYSLOG_IDENTIFIER", "source"),
            ("CODE_FILE", "fichier"),
            ("CODE_FUNC", "fonction"),
            ("CODE_LINE", "ligne"),
        ):
            if value := record.get(source):
                context[target] = sanitize(str(value))[:300]
    return JournalEntry(
        timestamp=timestamp,
        level=_level(str(record.get("PRIORITY", "6"))),
        component=_component(identifier, raw_message),
        message=message,
        context=context,
    )


def _level(priority: str) -> JournalLevel:
    number = int(priority)
    if number <= 2:
        return "critical"
    if number == 3:
        return "error"
    if number == 4:
        return "warning"
    if number >= 7:
        return "debug"
    return "info"


def _component(identifier: str, message: str) -> JournalComponent:
    haystack = f"{identifier} {message}".casefold()
    if any(word in haystack for word in ("camera", "picamera", "opencv", "capture")):
        return "camera"
    if any(word in haystack for word in ("print", "imprim", "cups", "selphy", "papier")):
        return "impression"
    if any(word in haystack for word in ("wifi", "wi-fi", "hotspot", "réseau", "network")):
        return "reseau"
    return "borne"
