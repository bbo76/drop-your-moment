import { useState } from "react";
import { Check, Timer } from "lucide-react";

import type { LaunchFont, MaintenanceSnapshot, ShotTimerSeconds } from "@/api/client";
import { LAUNCH_FONT_CLASSES } from "@/utils/theme";
import { MaintenanceChoice } from "./MaintenanceUi";
import { MaintenancePinView } from "./MaintenancePinView";

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

export function MaintenanceSettingsView({ snapshot, saving, onSaveSettings }: { snapshot: MaintenanceSnapshot; saving: boolean; onSaveSettings: (changes: Partial<MaintenanceSnapshot["settings"]>) => Promise<void> }) {
  const [section, setSection] = useState<"appearance" | "session" | "security">("appearance");
  const { settings } = snapshot;
  return (
    <section className="grid min-h-0 grid-rows-[3.5rem_1fr] gap-3 overflow-hidden">
      <div className="grid w-[37rem] grid-cols-[1fr_1.25fr_0.9fr] rounded-[0.65rem] bg-surface p-1" role="tablist" aria-label="Catégories de réglages"><SettingsTab selected={section === "appearance"} onClick={() => setSection("appearance")}>Apparence</SettingsTab><SettingsTab selected={section === "session"} onClick={() => setSection("session")}>Écran & session</SettingsTab><SettingsTab selected={section === "security"} onClick={() => setSection("security")}>Sécurité</SettingsTab></div>
      {section === "appearance" ? <div className="grid min-h-0 grid-cols-[0.72fr_1.28fr] gap-3">
        <div className="min-h-0 overflow-hidden rounded-[0.65rem] bg-surface p-3.5"><h2 className="mb-3 text-[1.2rem] font-semibold">Couleur de l’événement</h2><div className="grid grid-cols-4 gap-2.5">{EVENT_PALETTE.map(([name, value]) => <button key={value} type="button" disabled={saving} aria-label={name} aria-pressed={settings.accent_color.toLowerCase() === value} style={{ backgroundColor: value }} className="group relative aspect-square rounded-lg aria-pressed:shadow-[0_0_0_3px_var(--color-ink),0_0_0_5px_#d8dee4]" onClick={() => void onSaveSettings({ accent_color: value })}><span className="invisible absolute right-1.5 bottom-1 grid size-6 place-items-center rounded bg-[#101418] text-body group-aria-pressed:visible"><Check className="size-4" /></span></button>)}</div></div>
        <div className="min-h-0 overflow-hidden rounded-[0.65rem] bg-surface p-3.5"><h2 className="mb-3 text-[1.2rem] font-semibold">Typographie d’accueil</h2><div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto">{KIOSK_FONTS.map((font) => <button key={font.value} type="button" disabled={saving} aria-pressed={settings.launch_font === font.value} className={`group grid min-h-16 grid-cols-[7.2rem_1fr_1.2rem] items-center gap-2 rounded bg-[#222930] px-2 text-left aria-pressed:bg-[#303942] ${LAUNCH_FONT_CLASSES[font.value]}`} onClick={() => void onSaveSettings({ launch_font: font.value })}><span className="text-[1.35rem]">Bonjour</span><span className="text-sm text-muted">{font.label}</span><Check className="invisible size-4 group-aria-pressed:visible" /></button>)}</div></div>
      </div> : section === "session" ? <div className="grid content-start grid-rows-[repeat(2,7.5rem)] gap-3">
        <div className="grid min-h-0 grid-cols-[3.4rem_minmax(15rem,1fr)_auto] items-center gap-4 rounded-[0.65rem] bg-surface px-4 py-3.5">
          <SystemSettingIcon />
          <div><h2 className="text-[1.45rem] font-semibold">Minuteur par défaut</h2><p className="mt-0.5 text-[0.95rem] leading-[1.3] text-muted">Présélectionné pour chaque nouvelle photo</p></div>
          <div className="grid w-84 grid-cols-3 gap-2">{SHOT_TIMER_OPTIONS.map((seconds) => <MaintenanceChoice key={seconds} disabled={saving} pressed={settings.default_shot_timer_seconds === seconds} onClick={() => void onSaveSettings({ default_shot_timer_seconds: seconds })}>{seconds} s</MaintenanceChoice>)}</div>
        </div>
      </div> : <MaintenancePinView />}
    </section>
  );
}

function SettingsTab({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return <button type="button" role="tab" aria-selected={selected} className="min-h-12 rounded-[0.45rem] font-semibold text-muted aria-selected:bg-[#d8dee4] aria-selected:text-[#101418]" onClick={onClick}>{children}</button>;
}

function SystemSettingIcon() {
  const Icon = Timer;
  return <Icon className="size-[3.4rem] rounded-[0.55rem] bg-[#262e36] p-3 text-signal" strokeWidth={1.8} />;
}
