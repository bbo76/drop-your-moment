import { useEffect, useState } from "react";
import { RotateCcw, ScanLine, Target } from "lucide-react";

import type { AutofocusSettings } from "@/api/client";

const DEFAULT_SETTINGS: AutofocusSettings = {
  mode: "continuous",
  range: "normal",
  speed: "normal",
  window: [1 / 3, 1 / 3, 1 / 3, 1 / 3],
};

interface Props {
  settings: AutofocusSettings | null;
  supported: boolean;
  onApply: (settings: AutofocusSettings) => Promise<void>;
  onTrigger: () => Promise<boolean>;
}

export function AutofocusDebugPanel({ settings, supported, onApply, onTrigger }: Props) {
  const [draft, setDraft] = useState(settings ?? DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !dirty) setDraft(settings);
  }, [settings, dirty]);

  const updateWindow = (axis: "x" | "y" | "size", percent: number) => {
    const value = percent / 100;
    setDraft((current) => {
      const [x, y, width, height] = current.window;
      const nextWidth = axis === "size" ? value : width;
      const nextHeight = axis === "size" ? value : height;
      const nextX = axis === "x" ? value - nextWidth / 2 : x + width / 2 - nextWidth / 2;
      const nextY = axis === "y" ? value - nextHeight / 2 : y + height / 2 - nextHeight / 2;
      return {
        ...current,
        window: [
          clamp(nextX, 0, 1 - nextWidth),
          clamp(nextY, 0, 1 - nextHeight),
          nextWidth,
          nextHeight,
        ],
      };
    });
    setDirty(true);
    setFeedback(null);
    setError(null);
  };

  const apply = async (next = draft) => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await onApply(next);
      setDraft(next);
      setDirty(false);
      setFeedback("Réglages appliqués");
    } catch {
      setError("Réglages refusés par la caméra");
    } finally {
      setBusy(false);
    }
  };

  const autofocusNow = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      if (dirty) await onApply(draft);
      setDirty(false);
      setFeedback((await onTrigger()) ? "Cycle AF réussi" : "Cycle AF sans confirmation");
    } catch {
      setError("L’autofocus n’a pas pu se terminer");
    } finally {
      setBusy(false);
    }
  };

  const [x, y, width, height] = draft.window;
  const rangeValue = (axis: "x" | "y") => Math.round((axis === "x" ? x + width / 2 : y + height / 2) * 100);

  return (
    <section className="absolute bottom-4 left-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-panel border-2 border-edge bg-ink/95 p-4 text-body" aria-label="Réglages autofocus">
      <header className="mb-3 flex items-center gap-2">
        <ScanLine aria-hidden="true" className="size-5 text-signal" />
        <h2 className="text-xl font-semibold">Réglages autofocus</h2>
      </header>
      <p className="mb-3 text-sm text-muted-foreground">Réglages temporaires, réinitialisés au redémarrage de la borne.</p>
      {!supported ? (
        <p className="text-base">Le réglage matériel est disponible uniquement avec le pilote Camera Module 3.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 grid gap-1 text-base">
              Mode
              <select value={draft.mode} disabled={busy} onChange={(event) => { setDraft({ ...draft, mode: event.target.value as AutofocusSettings["mode"] }); setDirty(true); }} className="h-12 rounded-panel border-2 border-edge bg-surface px-3 text-lg text-body focus-visible:outline-2 focus-visible:outline-signal">
                <option value="continuous">Continu · suit la scène</option>
                <option value="auto">À la demande · reste bloqué après l’AF</option>
              </select>
            </label>
            <label className="grid gap-1 text-base">
              Plage
              <select value={draft.range} disabled={busy} onChange={(event) => { setDraft({ ...draft, range: event.target.value as AutofocusSettings["range"] }); setDirty(true); }} className="h-12 rounded-panel border-2 border-edge bg-surface px-3 text-lg text-body focus-visible:outline-2 focus-visible:outline-signal">
                <option value="normal">Normale</option>
                <option value="macro">Proche</option>
                <option value="full">Complète</option>
              </select>
            </label>
            <label className="grid gap-1 text-base">
              Vitesse
              <select value={draft.speed} disabled={busy} onChange={(event) => { setDraft({ ...draft, speed: event.target.value as AutofocusSettings["speed"] }); setDirty(true); }} className="h-12 rounded-panel border-2 border-edge bg-surface px-3 text-lg text-body focus-visible:outline-2 focus-visible:outline-signal">
                <option value="normal">Normale</option>
                <option value="fast">Rapide</option>
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-2">
            <RangeControl label="Centre horizontal" value={rangeValue("x")} min={Math.ceil(width * 50)} max={100 - Math.ceil(width * 50)} disabled={busy} onChange={(value) => updateWindow("x", value)} />
            <RangeControl label="Centre vertical" value={rangeValue("y")} min={Math.ceil(height * 50)} max={100 - Math.ceil(height * 50)} disabled={busy} onChange={(value) => updateWindow("y", value)} />
            <RangeControl label="Taille de la zone" value={Math.round(width * 100)} min={15} max={70} disabled={busy} onChange={(value) => updateWindow("size", value)} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Le cadre jaune montre la zone analysée. Déplace-la sur le visage ou le haut du corps.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={autofocusNow} className="flex h-12 items-center justify-center gap-2 rounded-panel bg-signal px-3 font-semibold text-signal-ink disabled:opacity-50">
              <Target aria-hidden="true" className="size-5" /> Faire l’AF
            </button>
            <button type="button" disabled={busy} onClick={() => { setDraft(DEFAULT_SETTINGS); setDirty(true); void apply(DEFAULT_SETTINGS); }} className="flex h-12 items-center justify-center gap-2 rounded-panel border-2 border-edge px-3 font-semibold text-body disabled:opacity-50">
              <RotateCcw aria-hidden="true" className="size-4" /> Défaut
            </button>
          </div>
          {dirty && <button type="button" disabled={busy} onClick={() => void apply()} className="mt-2 h-12 w-full rounded-panel border-2 border-signal font-semibold text-signal disabled:opacity-50">Appliquer la zone et les réglages</button>}
          {busy && <p role="status" className="mt-2 text-base">Réglage en cours…</p>}
          {feedback && !busy && <p role="status" className="mt-2 text-base text-signal">{feedback}</p>}
          {error && <p role="alert" className="mt-2 text-base text-warn">{error}</p>}
        </>
      )}
    </section>
  );
}

function RangeControl({ label, value, min = 20, max = 80, disabled, onChange }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-base">
      <span>{label}</span>
      <output className="tabular-nums">{value}%</output>
      <input aria-label={label} type="range" min={min} max={max} step={1} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="col-span-2 h-8 w-full accent-signal disabled:opacity-50" />
    </label>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
