import { useState } from "react";
import { Check, Power, RotateCw, Timer, Zap } from "lucide-react";

import type { LaunchFont, MaintenanceSnapshot, ShotTimerSeconds } from "../../shared/api";
import { LAUNCH_FONT_CLASSES } from "../../shared/theme";
import { MaintenanceChoice } from "./MaintenanceUi";

const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];
const EVENT_PALETTE = [
  ["Or", "#ffd400"], ["Champagne", "#d9b66f"], ["Abricot", "#f09a62"], ["Terracotta", "#d97757"],
  ["Corail", "#ef6f6c"], ["Rose", "#e56b8a"], ["Bordeaux", "#a43d5b"], ["Prune", "#704264"],
  ["Violet", "#8b5cf6"], ["Bleu royal", "#3b82f6"], ["Bleu nuit", "#496a9b"], ["Glacier", "#73a9c2"],
  ["Lagune", "#2798a8"], ["Émeraude", "#2a9d8f"], ["Menthe", "#58b89d"], ["Sauge", "#84a98c"],
] as const;
const KIOSK_FONTS: Array<{ value: LaunchFont; label: string }> = [
  { value: "modern", label: "Moderne" }, { value: "geometric", label: "Graphique" }, { value: "prestigious", label: "Prestige" }, { value: "editorial", label: "Romantique" },
  { value: "couture", label: "Couture" }, { value: "handwritten", label: "Manuscrite" }, { value: "elegant_script", label: "Calligraphie" }, { value: "festive", label: "Festive" },
  { value: "playful", label: "Ludique" }, { value: "spooky", label: "Halloween" }, { value: "ceremonial", label: "Cérémonie" }, { value: "cinematic", label: "Cinéma" },
];

export function MaintenanceSettingsView({ snapshot, saving, onSaveSettings, onPowerAction }: { snapshot: MaintenanceSnapshot; saving: boolean; onSaveSettings: (changes: Partial<MaintenanceSnapshot["settings"]>) => Promise<void>; onPowerAction: (action: "reboot" | "poweroff") => Promise<void> }) {
  const [section, setSection] = useState<"appearance" | "system">("appearance");
  const [confirmation, setConfirmation] = useState<"reboot" | "poweroff" | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);
  const { settings } = snapshot;
  return (
    <section className="grid min-h-0 grid-rows-[3.5rem_1fr] gap-3 overflow-hidden">
      <div className="grid w-[26rem] grid-cols-[1fr_1.2fr] rounded-[0.65rem] bg-surface p-1" role="tablist" aria-label="Catégories de réglages"><button type="button" role="tab" aria-selected={section === "appearance"} className="min-h-12 rounded-[0.45rem] font-semibold text-muted aria-selected:bg-[#d8dee4] aria-selected:text-[#101418]" onClick={() => setSection("appearance")}>Apparence</button><button type="button" role="tab" aria-selected={section === "system"} className="min-h-12 rounded-[0.45rem] font-semibold text-muted aria-selected:bg-[#d8dee4] aria-selected:text-[#101418]" onClick={() => setSection("system")}>Écran & session</button></div>
      {section === "appearance" ? <div className="grid min-h-0 grid-cols-[0.72fr_1.28fr] gap-3">
        <div className="min-h-0 overflow-hidden rounded-[0.65rem] bg-surface p-3.5"><h2 className="mb-3 text-[1.2rem] font-semibold">Couleur de l’événement</h2><div className="grid grid-cols-4 gap-2.5">{EVENT_PALETTE.map(([name, value]) => <button key={value} type="button" disabled={saving} aria-label={name} aria-pressed={settings.accent_color.toLowerCase() === value} style={{ backgroundColor: value }} className="group relative aspect-square rounded-lg aria-pressed:shadow-[0_0_0_3px_var(--color-ink),0_0_0_5px_#d8dee4]" onClick={() => void onSaveSettings({ accent_color: value })}><span className="invisible absolute right-1.5 bottom-1 grid size-6 place-items-center rounded bg-[#101418] text-body group-aria-pressed:visible"><Check className="size-4" /></span></button>)}</div></div>
        <div className="min-h-0 overflow-hidden rounded-[0.65rem] bg-surface p-3.5"><h2 className="mb-3 text-[1.2rem] font-semibold">Typographie d’accueil</h2><div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto">{KIOSK_FONTS.map((font) => <button key={font.value} type="button" disabled={saving} aria-pressed={settings.launch_font === font.value} className={`group grid min-h-16 grid-cols-[7.2rem_1fr_1.2rem] items-center gap-2 rounded bg-[#222930] px-2 text-left aria-pressed:bg-[#303942] ${LAUNCH_FONT_CLASSES[font.value]}`} onClick={() => void onSaveSettings({ launch_font: font.value })}><span className="text-[1.35rem]">Bonjour</span><span className="text-sm text-muted">{font.label}</span><Check className="invisible size-4 group-aria-pressed:visible" /></button>)}</div></div>
      </div> : <div className="grid content-start grid-rows-[repeat(3,7.5rem)] gap-3">
        <div className="grid min-h-0 grid-cols-[3.4rem_minmax(15rem,1fr)_auto] items-center gap-4 rounded-[0.65rem] bg-surface px-4 py-3.5">
          <SystemSettingIcon name="flash" />
          <div><h2 className="text-[1.45rem] font-semibold">Flash de l’écran</h2><p className="mt-0.5 text-[0.95rem] leading-[1.3] text-muted">Éclairage blanc au déclenchement</p></div>
          <button type="button" disabled={saving} aria-label={settings.screen_flash_enabled ? "Désactiver le flash de l’écran" : "Activer le flash de l’écran"} aria-pressed={settings.screen_flash_enabled} className="flex min-h-[3.6rem] w-[4.8rem] items-center justify-end p-1 text-body disabled:cursor-wait" onClick={() => void onSaveSettings({ screen_flash_enabled: !settings.screen_flash_enabled })}><span className={`flex h-10 w-18 items-center rounded-full p-1 transition-colors duration-300 ease-out ${settings.screen_flash_enabled ? "bg-[#d8dee4]" : "bg-edge"}`}><span className={`size-[2.1rem] transform-gpu rounded-full transition-[translate,background-color] duration-300 ease-out ${settings.screen_flash_enabled ? "translate-x-8 bg-[#101418]" : "translate-x-0 bg-body"}`} /></span></button>
        </div>
        <div className="grid min-h-0 grid-cols-[3.4rem_minmax(15rem,1fr)_auto] items-center gap-4 rounded-[0.65rem] bg-surface px-4 py-3.5">
          <SystemSettingIcon name="timer" />
          <div><h2 className="text-[1.45rem] font-semibold">Minuteur par défaut</h2><p className="mt-0.5 text-[0.95rem] leading-[1.3] text-muted">Présélectionné pour chaque nouvelle photo</p></div>
          <div className="grid w-84 grid-cols-3 gap-2">{SHOT_TIMER_OPTIONS.map((seconds) => <MaintenanceChoice key={seconds} disabled={saving} pressed={settings.default_shot_timer_seconds === seconds} onClick={() => void onSaveSettings({ default_shot_timer_seconds: seconds })}>{seconds} s</MaintenanceChoice>)}</div>
        </div>
        <div className="grid min-h-0 grid-cols-[3.4rem_minmax(15rem,1fr)_auto] items-center gap-4 rounded-[0.65rem] bg-surface px-4 py-3.5">
          <Power className="size-[3.4rem] rounded-[0.55rem] bg-[#262e36] p-3 text-signal" strokeWidth={1.8} />
          <div><h2 className="text-[1.45rem] font-semibold">Alimentation</h2><p className={`mt-0.5 text-[0.95rem] leading-[1.3] ${powerError ? "text-warn" : "text-muted"}`}>{powerError ?? (snapshot.power_available ? "Uniquement lorsque la borne est au repos" : "Indisponible hors Raspberry Pi avec systemd")}</p></div>
          <div className="grid grid-cols-2 gap-2"><MaintenanceChoice disabled={saving || !snapshot.power_available} onClick={() => { setPowerError(null); setConfirmation("reboot"); }}><span className="flex items-center gap-2"><RotateCw className="size-5" />Redémarrer</span></MaintenanceChoice><MaintenanceChoice disabled={saving || !snapshot.power_available} onClick={() => { setPowerError(null); setConfirmation("poweroff"); }}><span className="flex items-center gap-2"><Power className="size-5" />Éteindre</span></MaintenanceChoice></div>
        </div>
      </div>}
      {confirmation && <PowerConfirmation action={confirmation} onCancel={() => setConfirmation(null)} onConfirm={async () => { const action = confirmation; setConfirmation(null); try { await onPowerAction(action); } catch { setPowerError("Action refusée : vérifiez qu’aucune session photo n’est en cours."); } }} />}
    </section>
  );
}

function PowerConfirmation({ action, onCancel, onConfirm }: { action: "reboot" | "poweroff"; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const reboot = action === "reboot";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" role="alertdialog" aria-modal="true" aria-labelledby="power-title"><div className={`w-full max-w-xl rounded-panel border-2 bg-ink p-8 ${reboot ? "border-signal" : "border-warn"}`}><h2 id="power-title" className="text-3xl font-bold">{reboot ? "Redémarrer la borne ?" : "Éteindre la borne ?"}</h2><p className="mt-4 text-xl text-muted">{reboot ? "Le kiosque reviendra automatiquement après le redémarrage." : "La borne restera éteinte. Il faudra appuyer physiquement sur son alimentation pour la rallumer."}</p><div className="mt-8 grid grid-cols-2 gap-3"><button type="button" className="min-h-16 rounded-panel border-2 border-edge text-xl font-semibold" onClick={onCancel}>Annuler</button><button type="button" className={`min-h-16 rounded-panel text-xl font-bold text-ink ${reboot ? "bg-signal" : "bg-warn"}`} onClick={() => void onConfirm()}>{reboot ? "Confirmer le redémarrage" : "Confirmer l’arrêt"}</button></div></div></div>;
}

function SystemSettingIcon({ name }: { name: "flash" | "timer" }) {
  const Icon = name === "flash" ? Zap : Timer;
  return <Icon className="size-[3.4rem] rounded-[0.55rem] bg-[#262e36] p-3 text-signal" strokeWidth={1.8} />;
}
