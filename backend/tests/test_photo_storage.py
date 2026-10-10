from pathlib import Path

from dropyourmoment.storage.photo_storage import PhotoStorage


def test_external_storage_is_preferred_and_scoped_to_app_folder(tmp_path: Path) -> None:
    sd = tmp_path / "data" / "sessions"
    usb = tmp_path / "usb"
    usb.mkdir()

    storage = PhotoStorage(sd, usb)
    storage.refresh()

    assert storage.status.mode == "external"
    assert storage.sessions_root == usb / "photobooth"
    assert storage.sessions_root.is_dir()


def test_storage_falls_back_to_sd_when_external_is_unavailable(tmp_path: Path) -> None:
    sd = tmp_path / "data" / "sessions"
    missing = tmp_path / "missing-usb"

    storage = PhotoStorage(sd, missing)
    storage.refresh()

    assert storage.status.mode == "sd"
    assert storage.sessions_root == sd


def test_selection_is_persisted_and_restored(tmp_path: Path) -> None:
    sd = tmp_path / "data" / "sessions"
    usb = tmp_path / "usb"
    usb.mkdir()

    PhotoStorage(sd, config_dir=tmp_path / "data").select(usb)
    restored = PhotoStorage(sd, config_dir=tmp_path / "data")

    assert restored.refresh().mode == "external"
    assert restored.sessions_root == usb / "photobooth"


def test_external_can_be_deselected_for_sd(tmp_path: Path) -> None:
    sd = tmp_path / "data" / "sessions"
    usb = tmp_path / "usb"
    usb.mkdir()
    storage = PhotoStorage(sd, config_dir=tmp_path / "data")
    storage.select(usb)

    status = storage.select(None)

    assert status.mode == "sd"
    assert storage.sessions_root == sd


def test_prepare_creates_app_directory_and_persists_selection(tmp_path: Path) -> None:
    sd = tmp_path / "data" / "sessions"
    usb = tmp_path / "usb"
    usb.mkdir()
    unrelated = usb / "keep.txt"
    unrelated.write_text("untouched")
    storage = PhotoStorage(sd, config_dir=tmp_path / "data")

    status = storage.prepare(usb)

    assert status.mode == "external"
    assert (usb / "photobooth").is_dir()
    assert unrelated.read_text() == "untouched"
    assert PhotoStorage(sd, config_dir=tmp_path / "data").refresh().mode == "external"


def test_destination_cannot_change_during_photo_write(tmp_path: Path) -> None:
    storage = PhotoStorage(tmp_path / "data" / "sessions")
    storage.begin_write()

    try:
        try:
            storage.select(None)
        except RuntimeError as exc:
            assert "écriture" in str(exc)
        else:
            raise AssertionError("selection changed while write is active")
    finally:
        storage.end_write()

    assert storage.select(None).mode == "sd"
