"""Contrat minimal avec l'API Picamera2 fournie par Raspberry Pi OS."""

from __future__ import annotations

import importlib
import sys
from enum import Enum
from types import ModuleType


def test_la_qualite_mjpeg_est_passee_a_start_recording(monkeypatch) -> None:
    """MJPEGEncoder n'accepte pas `q`; la qualité appartient à start_recording."""

    calls: dict[str, object] = {}

    class FakeQuality(Enum):
        HIGH = 3

    class FakeMJPEGEncoder:
        def __init__(self) -> None:
            pass

    class FakeFileOutput:
        def __init__(self, output: object) -> None:
            self.output = output

    class FakePicamera2:
        def create_video_configuration(self, **configuration: object) -> object:
            return configuration

        def configure(self, configuration: object) -> None:
            calls["configuration"] = configuration

        def start_recording(self, encoder: object, output: object, **options: object) -> None:
            calls.update(encoder=encoder, output=output, options=options)

    picamera2 = ModuleType("picamera2")
    picamera2.Picamera2 = FakePicamera2  # type: ignore[attr-defined]
    encoders = ModuleType("picamera2.encoders")
    encoders.MJPEGEncoder = FakeMJPEGEncoder  # type: ignore[attr-defined]
    encoders.Quality = FakeQuality  # type: ignore[attr-defined]
    outputs = ModuleType("picamera2.outputs")
    outputs.FileOutput = FakeFileOutput  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "picamera2", picamera2)
    monkeypatch.setitem(sys.modules, "picamera2.encoders", encoders)
    monkeypatch.setitem(sys.modules, "picamera2.outputs", outputs)
    sys.modules.pop("dropyourmoment.hardware.camera.picamera2_driver", None)

    driver_module = importlib.import_module("dropyourmoment.hardware.camera.picamera2_driver")
    driver_module.Picamera2Driver().start()

    assert isinstance(calls["encoder"], FakeMJPEGEncoder)
    assert calls["options"] == {"quality": FakeQuality.HIGH, "name": "lores"}
