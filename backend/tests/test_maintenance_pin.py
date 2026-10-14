"""Le PIN modifiable reste persistant sans apparaître en clair sur disque."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from dropyourmoment.config import Settings
from dropyourmoment.storage.maintenance_pin import PIN_FILENAME, MaintenancePinStore


def test_utilise_le_pin_de_deploiement_sans_fichier(tmp_path: Path) -> None:
    store = MaintenancePinStore(tmp_path, "258025")

    assert store.verify("258025") is True
    assert store.verify("000000") is False


def test_le_nouveau_pin_est_persistant_et_non_lisible(tmp_path: Path) -> None:
    MaintenancePinStore(tmp_path, "258025").replace("739125")

    reloaded = MaintenancePinStore(tmp_path, "258025")
    contents = (tmp_path / PIN_FILENAME).read_text(encoding="utf-8")
    assert reloaded.verify("739125") is True
    assert reloaded.verify("258025") is False
    assert "739125" not in contents


def test_un_fichier_corrompu_retombe_sur_le_pin_de_deploiement(tmp_path: Path) -> None:
    (tmp_path / PIN_FILENAME).write_text("pas du JSON", encoding="utf-8")

    assert MaintenancePinStore(tmp_path, "258025").verify("258025") is True


def test_la_configuration_utilise_six_chiffres_et_accepte_un_ancien_pin() -> None:
    assert Settings().maintenance_pin == "258025"
    assert Settings(maintenance_pin="2580").maintenance_pin == "2580"
    with pytest.raises(ValidationError):
        Settings(maintenance_pin="25800")
