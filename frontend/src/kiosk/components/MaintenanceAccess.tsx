import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";

import { api, type LaunchFont } from "../../shared/api";
import type { DebugFailure } from "../debugFailures";
import { MaintenanceGalleryView } from "../maintenance/MaintenanceGalleryView";
import { MaintenanceHealthView } from "../maintenance/MaintenanceHealthView";
import { MaintenancePrintingView } from "../maintenance/MaintenancePrintingView";
import { MaintenanceSettingsView } from "../maintenance/MaintenanceSettingsView";
import { maintenanceDiagnostics } from "../maintenance/maintenanceDiagnostics";
import { MaintenanceFrame, MaintenanceIcon, MaintenanceStatusBanner } from "../maintenance/MaintenanceUi";
import { useMaintenance } from "../maintenance/useMaintenance";
import { GhostButton } from "./Screen";

const PIN_LENGTH = 4;
const KIOSK_FONTS: Array<{ value: LaunchFont; label: string }> = [
  { value: "modern", label: "Moderne" }, { value: "geometric", label: "Graphique" },
  { value: "prestigious", label: "Prestige" }, { value: "editorial", label: "Romantique" },
  { value: "couture", label: "Couture" }, { value: "handwritten", label: "Manuscrite" },
  { value: "elegant_script", label: "Calligraphie" }, { value: "festive", label: "Festive" },
  { value: "playful", label: "Ludique" }, { value: "spooky", label: "Halloween" },
  { value: "ceremonial", label: "Cérémonie" }, { value: "cinematic", label: "Cinéma" },
];

export function MaintenanceAccess({ onExit, debugFailure = "none" }: { onExit: () => void; debugFailure?: DebugFailure }) {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <MaintenancePanel debugFailure={debugFailure} onExpired={onExit} onExit={async () => { try { await api.lockMaintenance(); } finally { onExit(); } }} /> : <PinScreen onUnlocked={() => setUnlocked(true)} onCancel={onExit} />;
}

function PinScreen({ onUnlocked, onCancel }: { onUnlocked: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = useCallback(async (candidate: string) => { setBusy(true); try { await api.unlockMaintenance(candidate); onUnlocked(); } catch { setError("Code incorrect. Réessayez."); setPin(""); } finally { setBusy(false); } }, [onUnlocked]);
  const press = (digit: string) => { if (busy || pin.length >= PIN_LENGTH) return; const next = pin + digit; setPin(next); setError(null); if (next.length === PIN_LENGTH) void submit(next); };
  return (
    <main className="grid h-full grid-cols-[1fr_22rem] bg-ink text-body [--color-signal:#d8dee4] [--color-signal-ink:#101418]">
      <section className="flex flex-col justify-between p-10">
        <div><h1 className="max-w-[9ch] text-6xl leading-none font-bold">Maintenance</h1><p className="mt-3 text-lg font-medium text-muted">Accès réservé à l’organisateur</p></div>
        <div><p className="text-xl font-semibold">Saisissez le code de la borne</p><div className="mt-5 flex gap-3" aria-label={`${pin.length} chiffres saisis`}>{Array.from({ length: PIN_LENGTH }, (_, index) => <span key={index} className={`block size-[1.4rem] rounded-full border-[3px] ${index < pin.length ? "border-signal bg-signal" : "border-muted"}`} />)}</div><p className={`mt-4 min-h-7 text-lg font-medium text-warn ${error ? "" : "invisible"}`} role="alert">{error ?? "Aucune erreur"}</p></div>
        <GhostButton onClick={onCancel}>Retour aux photos</GhostButton>
      </section>
      <section className="grid grid-cols-3 gap-2 bg-signal p-4" aria-label="Clavier numérique">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <button key={digit} type="button" onClick={() => press(digit)} disabled={busy} className="min-h-18 rounded-panel border-2 border-signal-ink bg-signal-ink text-[2rem] font-semibold text-signal active:scale-[0.97] disabled:opacity-45">{digit}</button>)}
        <button type="button" onClick={() => setPin("")} disabled={busy || pin.length === 0} aria-label="Effacer le code" className="min-h-18 rounded-panel border-2 border-signal-ink bg-transparent text-sm font-semibold text-signal-ink disabled:opacity-45">Effacer</button>
        <button type="button" onClick={() => press("0")} disabled={busy} className="min-h-18 rounded-panel border-2 border-signal-ink bg-signal-ink text-[2rem] font-semibold text-signal disabled:opacity-45">0</button>
        <button type="button" onClick={() => setPin((value) => value.slice(0, -1))} disabled={busy || pin.length === 0} aria-label="Effacer le dernier chiffre" className="min-h-18 rounded-panel border-2 border-signal-ink bg-transparent text-sm font-semibold text-signal-ink disabled:opacity-45">Retour</button>
      </section>
    </main>
  );
}

type MaintenanceView = "home" | "health" | "printing" | "gallery" | "settings";

function MaintenancePanel({ onExpired, onExit, debugFailure }: { onExpired: () => void; onExit: () => void; debugFailure: DebugFailure }) {
  const [view, setView] = useState<MaintenanceView>("home");
  const maintenance = useMaintenance(debugFailure, onExpired);
  const { snapshot, error, saving, saveSettings } = maintenance;
  if (!snapshot) return <main className="grid h-full place-content-center bg-ink text-center text-body"><p className="text-3xl font-bold">Lecture de la borne…</p>{error && <p className="mt-4 text-warn">{error}</p>}</main>;
  const diagnostics = maintenanceDiagnostics(snapshot);
  const back = () => setView("home");
  if (view === "health") return <MaintenanceFrame title="Santé de la borne" status={diagnostics.status} onBack={back}><MaintenanceHealthView snapshot={snapshot} /></MaintenanceFrame>;
  if (view === "printing") return <MaintenanceFrame title="Impression" status={diagnostics.status} onBack={back}><MaintenancePrintingView snapshot={snapshot} saving={saving} onSaveSettings={saveSettings} onReloadCassette={maintenance.reloadCassette} onReplaceInk={maintenance.replaceInk} onSetPaperStock={maintenance.setPaperStock} /></MaintenanceFrame>;
  if (view === "gallery") return <MaintenanceFrame title="Galerie photo" status={diagnostics.status} onBack={back}><MaintenanceGalleryView onExpired={onExpired} /></MaintenanceFrame>;
  if (view === "settings") return <MaintenanceFrame title="Réglages borne" status={diagnostics.status} onBack={back}><MaintenanceSettingsView snapshot={snapshot} saving={saving} onSaveSettings={saveSettings} /></MaintenanceFrame>;
  const { settings } = snapshot;
  return (
    <main className="grid h-full grid-rows-[auto_1fr] gap-4 bg-ink p-4 text-body [--color-signal:#d8dee4] [--color-signal-ink:#101418] max-h-[600px]:gap-3 max-h-[600px]:p-3">
      <header className="flex items-center justify-between"><h1 className="text-3xl font-bold">Maintenance</h1><div className="flex items-center gap-3"><MaintenanceStatusBanner status={diagnostics.status} /><GhostButton onClick={onExit}>Fermer</GhostButton></div></header>
      <div className="grid min-h-0 auto-rows-fr grid-cols-2 gap-3">
        <MaintenanceTile icon="health" title="Santé" detail={diagnostics.healthDetail} attention={diagnostics.healthNeedsAttention} onClick={() => setView("health")} />
        <MaintenanceTile icon="print" title="Impression" detail={diagnostics.printingDetail} attention={diagnostics.printingNeedsAttention} onClick={() => setView("printing")} />
        <MaintenanceTile icon="gallery" title="Galerie" detail="Voir les dernières photos" onClick={() => setView("gallery")} />
        <MaintenanceTile icon="settings" title="Réglages borne" detail={`${KIOSK_FONTS.find((font) => font.value === settings.launch_font)?.label ?? "Apparence"} · flash ${settings.screen_flash_enabled ? "activé" : "coupé"}`} onClick={() => setView("settings")} />
      </div>
      {error && <p className="fixed bottom-3 left-4 rounded-panel bg-warn-bg px-4 py-2 text-lg font-medium text-warn" role="status">{error}</p>}
    </main>
  );
}

function MaintenanceTile({ icon, title, detail, attention = false, onClick }: { icon: "health" | "print" | "gallery" | "settings"; title: string; detail: string; attention?: boolean; onClick: () => void }) {
  return <button type="button" className={`grid min-h-0 grid-cols-[4.25rem_1fr_2rem] items-center gap-4 rounded-[0.65rem] border-2 p-4 px-5 text-left text-body active:scale-[0.985] ${attention ? "border-warn bg-[color-mix(in_srgb,var(--color-warn)_7%,var(--color-surface))] motion-safe:animate-pulse" : "border-transparent bg-surface"}`} onClick={onClick}><MaintenanceIcon name={icon} /><span>{attention && <span className="mb-2.5 inline-flex text-[0.95rem] font-semibold text-warn">À vérifier</span>}<strong className="block text-[1.75rem] leading-none font-semibold">{title}</strong><small className="mt-2 block text-base font-normal text-muted">{detail}</small></span><ChevronRight className="w-8 text-muted" strokeWidth={2.5} /></button>;
}
