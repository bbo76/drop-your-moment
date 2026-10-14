import { useState } from "react";
import { Delete, KeyRound } from "lucide-react";

import { api } from "@/api/client";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "effacer", "0", "retour"] as const;

export function MaintenancePinView() {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = confirming ? confirmation : pin;
  const press = (key: (typeof DIGITS)[number]) => {
    setError(null);
    setMessage(null);
    if (key === "effacer") {
      if (confirming) setConfirmation("");
      else setPin("");
      return;
    }
    if (key === "retour") {
      if (confirming) {
        setConfirming(false);
        setConfirmation("");
      } else setPin((value) => value.slice(0, -1));
      return;
    }
    if (current.length >= 4) return;
    const next = `${current}${key}`;
    if (confirming) {
      setConfirmation(next);
      if (next.length === 4 && next !== pin) {
        setError("Les deux codes ne correspondent pas. Recommencez la confirmation.");
        setConfirmation("");
      }
    } else setPin(next);
    if (!confirming && next.length === 4) {
      setConfirming(true);
      setConfirmation("");
    }
  };

  const save = async () => {
    if (confirmation.length !== 4 || confirmation !== pin || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.changeMaintenancePin(pin);
      setPin("");
      setConfirmation("");
      setConfirming(false);
      setMessage("PIN modifié. Il sera demandé à la prochaine ouverture de la maintenance.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le PIN n’a pas pu être modifié.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid min-h-0 grid-cols-[1fr_18rem] gap-3">
      <div className="flex min-h-0 flex-col justify-center rounded-[0.65rem] bg-surface p-6">
        <KeyRound className="mb-4 size-10 text-signal" strokeWidth={1.8} aria-hidden="true" />
        <h2 className="text-[1.65rem] font-semibold">{confirming ? "Confirmer le nouveau PIN" : "Choisir un nouveau PIN"}</h2>
        <p className="mt-2 max-w-md text-lg leading-snug text-muted">
          {confirming ? "Saisissez une seconde fois les quatre chiffres." : "Choisissez quatre chiffres pour protéger l’accès à la maintenance."}
        </p>
        <div className="mt-7 flex gap-4" aria-label={`${current.length} chiffre${current.length === 1 ? "" : "s"} saisi${current.length === 1 ? "" : "s"} sur 4`}>
          {Array.from({ length: 4 }, (_, index) => <span key={index} className={`size-5 rounded-full border-2 border-edge ${index < current.length ? "bg-signal" : "bg-transparent"}`} />)}
        </div>
        {confirming && confirmation.length === 4 && confirmation !== pin && <p className="mt-4 text-base font-semibold text-warn" role="alert">Les deux codes ne correspondent pas. Recommencez la confirmation.</p>}
        {message && <p className="mt-5 max-w-md text-base font-semibold text-signal" role="status">{message}</p>}
        {error && <p className="mt-5 max-w-md text-base font-semibold text-warn" role="alert">{error}</p>}
        {confirming && <button type="button" disabled={busy || confirmation.length !== 4 || confirmation !== pin} onClick={() => void save()} className="mt-7 min-h-16 max-w-sm rounded-[0.55rem] bg-signal px-5 text-xl font-bold text-signal-ink disabled:opacity-40">{busy ? "Enregistrement…" : "Enregistrer le PIN"}</button>}
      </div>
      <div className="grid grid-cols-3 grid-rows-4 gap-2" aria-label="Clavier numérique">
        {DIGITS.map((key) => <button key={key} type="button" disabled={busy} onClick={() => press(key)} aria-label={key === "effacer" ? "Effacer la saisie" : key === "retour" ? "Retour" : key} className={`grid min-h-0 place-items-center rounded-[0.55rem] text-2xl font-bold active:bg-[#3b4650] disabled:opacity-40 ${key === "effacer" || key === "retour" ? "bg-[#222930] text-muted" : "bg-[#303942] text-body"}`}>
          {key === "effacer" ? <Delete className="size-7" /> : key === "retour" ? "←" : key}
        </button>)}
      </div>
    </section>
  );
}
