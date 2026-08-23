"""Le PIN modifiable reste persistant sans apparaître en clair sur disque."""

from pathlib import Path

from dropyourmoment.storage.maintenance_pin import PIN_FILENAME, MaintenancePinStore


def test_utilise_le_pin_de_deploiement_sans_fichier(tmp_path: Path) -> None:
    store = MaintenancePinStore(tmp_path, "2580")

    assert store.verify("2580") is True
    assert store.verify("0000") is False


def test_le_nouveau_pin_est_persistant_et_non_lisible(tmp_path: Path) -> None:
    MaintenancePinStore(tmp_path, "2580").replace("7391")

    reloaded = MaintenancePinStore(tmp_path, "2580")
    contents = (tmp_path / PIN_FILENAME).read_text(encoding="utf-8")
    assert reloaded.verify("7391") is True
    assert reloaded.verify("2580") is False
    assert "7391" not in contents


def test_un_fichier_corrompu_retombe_sur_le_pin_de_deploiement(tmp_path: Path) -> None:
    (tmp_path / PIN_FILENAME).write_text("pas du JSON", encoding="utf-8")

    assert MaintenancePinStore(tmp_path, "2580").verify("2580") is True
