import { useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";

import { api } from "../shared/api";
import { Button, Feedback, Field, Section } from "./ui";

export function SecuritySection() {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\d{4}$/.test(pin)) {
      setError("Le PIN doit contenir exactement quatre chiffres.");
      return;
    }
    if (pin !== confirmation) {
      setError("Les deux codes ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      await api.replaceMaintenancePin(pin);
      setPin("");
      setConfirmation("");
      setNotice("PIN remplacé. Les sessions de maintenance ouvertes ont été fermées.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Accès à la borne">
      <form onSubmit={(event) => void submit(event)} className="grid max-w-sm gap-4">
        <p className="text-sm text-muted-foreground">
          Le PIN actuel n’est jamais affiché. Le nouveau code s’applique immédiatement au
          panneau de maintenance tactile.
        </p>
        <Field label="Nouveau PIN à 4 chiffres">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="[0-9]{4}"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </Field>
        <Field label="Confirmer le nouveau PIN">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="[0-9]{4}"
            maxLength={4}
            value={confirmation}
            onChange={(event) =>
              setConfirmation(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
        </Field>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={saving || pin.length !== 4 || confirmation.length !== 4}>
            {saving ? "Remplacement…" : "Remplacer le PIN"}
          </Button>
          <Feedback error={error} notice={notice} />
        </div>
      </form>
    </Section>
  );
}
