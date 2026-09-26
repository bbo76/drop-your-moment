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
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] max-w-none rounded-2xl border border-edge bg-ink p-0 text-body shadow-[0_1.5rem_4rem_rgb(0_0_0/28%)] backdrop:bg-[rgb(9_15_23/62%)] backdrop:backdrop-blur-[3px]"
      aria-labelledby="paper-stock-title"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-5 p-6 max-[480px]:p-5">
        <div>
          <p className="text-[0.78rem] font-bold tracking-[0.08em] text-muted uppercase">Impression</p>
          <h2 id="paper-stock-title" className="mt-1 text-2xl leading-[1.15] font-bold">Définir le stock papier</h2>
          <p className="mt-2 leading-[1.45] text-muted">
            Indiquez toutes les feuilles disponibles pour la suite de l’évènement,
            y compris celles déjà chargées dans le bac.
          </p>
        </div>

        <label className="grid gap-2">
          <span className="text-[0.78rem] font-bold tracking-[0.08em] text-muted uppercase">Feuilles disponibles</span>
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
            className="min-h-14 w-full rounded-panel border-2 border-edge bg-transparent px-3.5 text-2xl font-bold text-body tabular-nums focus-visible:border-signal focus-visible:outline-[3px] focus-visible:outline-[color-mix(in_srgb,var(--color-signal)_25%,transparent)] disabled:opacity-50"
          />
        </label>

        <p className="leading-[1.45] text-muted">
          Le bac de la CP1500 reste géré séparément et contient 18 feuilles maximum.
        </p>

        <div className="flex justify-end gap-2.5 max-[480px]:grid">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-[2.85rem] rounded-[0.7rem] border border-edge px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50">Annuler</button>
          <button type="submit" disabled={saving || !valid} className="min-h-[2.85rem] rounded-[0.7rem] border border-signal bg-signal px-4 font-bold text-signal-ink disabled:cursor-not-allowed disabled:opacity-50 max-[480px]:row-start-1">
            {saving ? "Enregistrement…" : "Enregistrer le stock"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
