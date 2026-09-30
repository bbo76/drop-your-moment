from __future__ import annotations

import json
import subprocess

from dropyourmoment.journal import read_journal, sanitize


def test_le_journal_est_classe_borne_et_nettoye() -> None:
    records = [
        {
            "__REALTIME_TIMESTAMP": "1700000000000000",
            "PRIORITY": "3",
            "SYSLOG_IDENTIFIER": "dropyourmoment",
            "MESSAGE": "hotspot refusé password=secret token:abc123\ntrace privée",
            "_SYSTEMD_UNIT": "dropyourmoment.service",
        },
        {
            "__REALTIME_TIMESTAMP": "1699999999000000",
            "PRIORITY": "6",
            "MESSAGE": "capture terminée",
        },
    ]

    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        assert "--unit=dropyourmoment.service" in command
        return subprocess.CompletedProcess(command, 0, "\n".join(map(json.dumps, records)), "")

    page = read_journal(limit=10, run=run)

    assert [entry.component for entry in page.entries] == ["reseau", "camera"]
    assert page.entries[0].level == "error"
    assert page.entries[0].message == (
        "hotspot refusé password=[masqué] token:[masqué]\ntrace privée"
    )
    assert page.entries[0].context == {
        "unité": "dropyourmoment.service",
        "source": "dropyourmoment",
    }
    assert page.next_offset is None


def test_la_vue_kiosque_supprime_trace_et_borne_le_message() -> None:
    record = {
        "__REALTIME_TIMESTAMP": "1700000000000000",
        "PRIORITY": "4",
        "MESSAGE": f"{'x' * 230}\nTraceback: cookie=session",
    }

    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 0, json.dumps(record), "")

    entry = read_journal(limit=1, detail=False, run=run).entries[0]
    assert len(entry.message) == 220
    assert entry.message.endswith("…")
    assert "Traceback" not in entry.message
    assert entry.context == {}


def test_les_secrets_courants_sont_masques() -> None:
    cleaned = sanitize(
        "Authorization: Bearer abc.def password=hunter2 https://borne/?token=abc&pin=2580"
    )
    assert "abc.def" not in cleaned
    assert "hunter2" not in cleaned
    assert "2580" not in cleaned
    assert cleaned.count("[masqué]") >= 4


def test_un_gros_journal_reste_borne_et_ignore_une_rotation_incomplete() -> None:
    records = [
        {
            "__REALTIME_TIMESTAMP": str(1_700_000_000_000_000 - index),
            "PRIORITY": "6",
            "MESSAGE": f"événement {index}",
        }
        for index in range(1_000)
    ]

    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        assert "--lines=1000" in command
        output = "\n".join(
            [json.dumps(records[0]), "journal tronqué", *map(json.dumps, records[1:])]
        )
        return subprocess.CompletedProcess(command, 0, output, "")

    page = read_journal(offset=900, limit=50, search="événement", run=run)
    assert len(page.entries) == 50
    assert page.entries[0].message == "événement 900"
    assert page.next_offset == 950
