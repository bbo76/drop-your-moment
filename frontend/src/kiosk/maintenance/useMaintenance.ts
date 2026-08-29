import { useCallback, useEffect, useState } from "react";

import {
  api,
  type CounterReading,
  type MaintenanceSettings,
  type MaintenanceSnapshot,
} from "../../shared/api";
import { applyAccentTheme } from "../../shared/theme";
import { mockMaintenanceSnapshot, type DebugFailure } from "../debugFailures";

const POLL_INTERVAL_MS = 2000;

export function useMaintenance(debugFailure: DebugFailure, onExpired: () => void) {
  const [snapshot, setSnapshot] = useState<MaintenanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSnapshot(mockMaintenanceSnapshot(await api.maintenanceStatus(), debugFailure));
      setError(null);
    } catch (cause) {
      if (String(cause).includes("expirée")) onExpired();
      else setError("Impossible de lire l’état de la borne.");
    }
  }, [debugFailure, onExpired]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (
    action: () => Promise<CounterReading>,
    failureMessage: string,
  ) => {
    if (!snapshot || debugFailure !== "none") return false;
    setSaving(true);
    try {
      const counters = await action();
      setSnapshot((current) => current && ({ ...current, health: { ...current.health, counters } }));
      setError(null);
      return true;
    } catch {
      setError(failureMessage);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (changes: Partial<MaintenanceSettings>) => {
    if (!snapshot || debugFailure !== "none") return;
    setSaving(true);
    try {
      const settings = await api.saveMaintenanceSettings({ ...snapshot.settings, ...changes });
      setSnapshot((current) => current && ({ ...current, settings }));
      if (changes.accent_color) applyAccentTheme(changes.accent_color);
      setError(null);
    } catch {
      setError("Le réglage n’a pas été enregistré.");
    } finally {
      setSaving(false);
    }
  };

  return {
    snapshot,
    error,
    saving: saving || debugFailure !== "none",
    saveSettings,
    reloadCassette: () => run(api.reloadCassette, "Le rechargement du bac n’a pas été enregistré."),
    replaceInk: (capacity: 36 | 54) => run(() => api.replaceMaintenanceInk(capacity), "Le remplacement de la cassette d’encre n’a pas été enregistré."),
    setPaperStock: (capacity: number) => run(() => api.setMaintenancePaperStock(capacity), "Le stock papier n’a pas été enregistré."),
  };
}
