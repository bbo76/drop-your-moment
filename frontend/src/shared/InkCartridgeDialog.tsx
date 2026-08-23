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
      className="paper-stock-dialog"
      aria-labelledby="ink-cartridge-title"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="paper-stock-dialog-heading">
          <p className="paper-stock-eyebrow">Impression</p>
          <h2 id="ink-cartridge-title">Cassette d’encre remplacée</h2>
          <p>Quelle cassette neuve venez-vous d’installer dans la CP1500 ?</p>
        </div>

        <fieldset className="ink-capacity-choices">
          <legend>Capacité de la cassette</legend>
          {([36, 54] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="ink-capacity"
                value={value}
                checked={capacity === value}
                disabled={saving}
                onChange={() => setCapacity(value)}
              />
              <strong>{value}</strong>
              <span>tirages</span>
            </label>
          ))}
        </fieldset>

        <p className="paper-stock-note">
          KP-36 : 36 tirages · RP-54 et RP-108 : 54 tirages par cassette.
        </p>

        <div className="paper-stock-dialog-actions">
          <button type="button" disabled={saving} onClick={onClose}>Annuler</button>
          <button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Confirmer le remplacement"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
