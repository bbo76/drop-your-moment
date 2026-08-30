import { useEffect, useRef, useState, type FormEvent } from "react";

export function InkCartridgeDialog({
  open,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: (capacity: 36 | 54) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [capacity, setCapacity] = useState<36 | 54>(36);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onClose();
    onConfirm(capacity);
  };

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] max-w-none rounded-2xl border border-edge bg-ink p-0 text-body shadow-[0_1.5rem_4rem_rgb(0_0_0/28%)] backdrop:bg-[rgb(9_15_23/62%)] backdrop:backdrop-blur-[3px]"
      aria-labelledby="ink-cartridge-title"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-5 p-6 max-[480px]:p-5">
        <div>
          <p className="text-[0.78rem] font-bold tracking-[0.08em] text-muted uppercase">Impression</p>
          <h2 id="ink-cartridge-title" className="mt-1 text-2xl leading-[1.15] font-bold">Cassette d’encre remplacée</h2>
          <p className="mt-2 leading-[1.45] text-muted">Quelle cassette neuve venez-vous d’installer dans la CP1500 ?</p>
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-2 text-[0.78rem] font-bold tracking-[0.08em] text-muted uppercase">Capacité de la cassette</legend>
          {([36, 54] as const).map((value) => (
            <label key={value} className="grid min-h-18 cursor-pointer grid-cols-[1.25rem_1fr] items-center rounded-panel border-2 border-edge p-3 has-checked:border-signal has-checked:bg-[color-mix(in_srgb,var(--color-signal)_10%,transparent)]">
              <input
                type="radio"
                name="ink-capacity"
                value={value}
                checked={capacity === value}
                disabled={saving}
                onChange={() => setCapacity(value)}
                className="col-start-1 row-span-2 m-0 size-4"
              />
              <strong className="col-start-2 row-start-1 text-[1.35rem] leading-none">{value}</strong>
              <span className="col-start-2 row-start-2 text-sm text-muted">tirages</span>
            </label>
          ))}
        </fieldset>

        <p className="leading-[1.45] text-muted">
          KP-36 : 36 tirages · RP-54 et RP-108 : 54 tirages par cassette.
        </p>

        <div className="flex justify-end gap-2.5 max-[480px]:grid">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-[2.85rem] rounded-[0.7rem] border border-edge px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50">Annuler</button>
          <button type="submit" disabled={saving} className="min-h-[2.85rem] rounded-[0.7rem] border border-signal bg-signal px-4 font-bold text-signal-ink disabled:cursor-not-allowed disabled:opacity-50 max-[480px]:row-start-1">
            {saving ? "Enregistrement…" : "Confirmer le remplacement"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
