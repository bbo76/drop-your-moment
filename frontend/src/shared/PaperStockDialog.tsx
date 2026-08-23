import { useEffect, useRef, useState, type FormEvent } from "react";

const MAX_PAPER_STOCK = 9_999;

export function PaperStockDialog({
  open,
  initialValue,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initialValue: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: (total: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(String(initialValue));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue(String(initialValue));
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [initialValue, open]);

  const total = Number(value);
  const valid = Number.isInteger(total) && total >= 1 && total <= MAX_PAPER_STOCK;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onClose();
    onConfirm(total);
  };

  return (
    <dialog
      ref={dialogRef}
      className="paper-stock-dialog"
      aria-labelledby="paper-stock-title"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="paper-stock-dialog-heading">
          <p className="paper-stock-eyebrow">Impression</p>
          <h2 id="paper-stock-title">Définir le stock papier</h2>
          <p>
            Indiquez toutes les feuilles disponibles pour la suite de l’évènement,
            y compris celles déjà chargées dans le bac.
          </p>
        </div>

        <label className="paper-stock-field">
          <span>Feuilles disponibles</span>
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min="1"
            max={MAX_PAPER_STOCK}
            step="1"
            value={value}
            disabled={saving}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        <p className="paper-stock-note">
          Le bac de la CP1500 reste géré séparément et contient 18 feuilles maximum.
        </p>

        <div className="paper-stock-dialog-actions">
          <button type="button" disabled={saving} onClick={onClose}>Annuler</button>
          <button type="submit" disabled={saving || !valid}>
            {saving ? "Enregistrement…" : "Enregistrer le stock"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
