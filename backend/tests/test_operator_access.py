from __future__ import annotations

from pathlib import Path

import pytest

from dropyourmoment.operator_access import OperatorAccess


def test_code_et_session_survivent_au_redemarrage(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    code = access.activate()
    token = access.authenticate(code, "client")

    restored = OperatorAccess(tmp_path)

    assert len(code) == 6
    assert restored.code == code
    assert restored.authorize(token)


def test_desactivation_invalide_code_et_sessions(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path)
    token = access.authenticate(access.activate(), "client")

    access.deactivate()

    assert access.code is None
    assert access.authorize(token)  # portail non protégé lorsque le hotspot est coupé


def test_les_tentatives_sont_limitees(tmp_path: Path) -> None:
    access = OperatorAccess(tmp_path, max_attempts=2)
    access.activate()
    assert access.authenticate("000000", "client") is None
    assert access.authenticate("000000", "client") is None
    with pytest.raises(RuntimeError):
        access.authenticate("000000", "client")
