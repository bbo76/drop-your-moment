from __future__ import annotations

import threading

from dropyourmoment.system_power import SystemPower


def test_une_action_programmee_attend_avant_execution() -> None:
    executed = threading.Event()
    actions: list[str] = []
    power = SystemPower(
        executor=lambda action: (actions.append(action), executed.set()),
        available=True,
    )

    pending = power.schedule("reboot", 0.01)

    assert pending.action == "reboot"
    assert actions == []
    assert executed.wait(1)
    assert actions == ["reboot"]
    assert power.pending is None
