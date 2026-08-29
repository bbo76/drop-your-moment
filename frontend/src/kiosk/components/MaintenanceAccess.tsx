import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  HardDrive,
  Images,
  Printer,
  SlidersHorizontal,
  Thermometer,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  api,
  maintenancePhotoUrl,
  maintenanceThumbnailUrl,
  type GalleryEntry,
  type LaunchFont,
  type MaintenanceSettings,
  type MaintenanceSnapshot,
  type ShotTimerSeconds,
} from "../../shared/api";
import { InkCartridgeDialog } from "../../shared/InkCartridgeDialog";
import { PaperStockDialog } from "../../shared/PaperStockDialog";
import { applyAccentTheme, LAUNCH_FONT_CLASSES } from "../../shared/theme";
import { mockMaintenanceSnapshot, type DebugFailure } from "../debugFailures";
import { GhostButton } from "./Screen";

const PIN_LENGTH = 4;
const POLL_INTERVAL_MS = 2000;
const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];
const EVENT_PALETTE = [
  { name: "Or", value: "#ffd400", className: "bg-[#ffd400]" },
  { name: "Champagne", value: "#d9b66f", className: "bg-[#d9b66f]" },
  { name: "Abricot", value: "#f09a62", className: "bg-[#f09a62]" },
  { name: "Terracotta", value: "#d97757", className: "bg-[#d97757]" },
  { name: "Corail", value: "#ef6f6c", className: "bg-[#ef6f6c]" },
  { name: "Rose", value: "#e56b8a", className: "bg-[#e56b8a]" },
  { name: "Bordeaux", value: "#a43d5b", className: "bg-[#a43d5b]" },
  { name: "Prune", value: "#704264", className: "bg-[#704264]" },
  { name: "Violet", value: "#8b5cf6", className: "bg-[#8b5cf6]" },
  { name: "Bleu royal", value: "#3b82f6", className: "bg-[#3b82f6]" },
  { name: "Bleu nuit", value: "#496a9b", className: "bg-[#496a9b]" },
  { name: "Glacier", value: "#73a9c2", className: "bg-[#73a9c2]" },
  { name: "Lagune", value: "#2798a8", className: "bg-[#2798a8]" },
  { name: "Émeraude", value: "#2a9d8f", className: "bg-[#2a9d8f]" },
  { name: "Menthe", value: "#58b89d", className: "bg-[#58b89d]" },
  { name: "Sauge", value: "#84a98c", className: "bg-[#84a98c]" },
] as const;
const KIOSK_FONTS: Array<{ value: LaunchFont; label: string }> = [
  { value: "modern", label: "Moderne" },
  { value: "geometric", label: "Graphique" },
  { value: "prestigious", label: "Prestige" },
  { value: "editorial", label: "Romantique" },
  { value: "couture", label: "Couture" },
  { value: "handwritten", label: "Manuscrite" },
  { value: "elegant_script", label: "Calligraphie" },
  { value: "festive", label: "Festive" },
  { value: "playful", label: "Ludique" },
  { value: "spooky", label: "Halloween" },
  { value: "ceremonial", label: "Cérémonie" },
  { value: "cinematic", label: "Cinéma" },
];

export function MaintenanceAccess({ onExit, debugFailure = "none" }: { onExit: () => void; debugFailure?: DebugFailure }) {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? (
    <MaintenancePanel
      debugFailure={debugFailure}
      onExpired={onExit}
      onExit={async () => {
        try {
          await api.lockMaintenance();
        } finally {
          onExit();
        }
      }}
    />
  ) : (
    <PinScreen onUnlocked={() => setUnlocked(true)} onCancel={onExit} />
  );
}

function PinScreen({ onUnlocked, onCancel }: { onUnlocked: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (candidate: string) => {
      setBusy(true);
      try {
        await api.unlockMaintenance(candidate);
        onUnlocked();
      } catch {
        setError("Code incorrect. Réessayez.");
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [onUnlocked],
  );

  const press = (digit: string) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <main className="grid h-full grid-cols-[1fr_22rem] bg-ink text-body [--color-accent:#d8dee4] [--color-accent-ink:#101418]">
      <section className="flex flex-col justify-between p-10">
        <div>
          <h1 className="max-w-[9ch] text-6xl leading-none font-bold tracking-[-0.02em]">Maintenance</h1>
          <p className="mt-3 text-lg font-medium tracking-[0.01em] text-muted">Accès réservé à l’organisateur</p>
        </div>
        <div>
          <p className="text-xl font-semibold">Saisissez le code de la borne</p>
          <div className="mt-5 flex gap-3" aria-label={`${pin.length} chiffres saisis`}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <span key={index} className={`block size-[1.4rem] rounded-full border-[3px] ${index < pin.length ? "border-accent bg-accent" : "border-muted"}`} />
            ))}
          </div>
          <p className={`mt-4 min-h-7 text-lg font-medium tracking-[0.01em] text-warn ${error ? "" : "invisible"}`} role="alert">
            {error ?? "Aucune erreur"}
          </p>
        </div>
        <GhostButton onClick={onCancel}>Retour aux photos</GhostButton>
      </section>

      <section className="grid grid-cols-3 gap-2 bg-accent p-4" aria-label="Clavier numérique">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" onClick={() => press(digit)} disabled={busy} className="min-h-18 rounded-panel border-2 border-accent-ink bg-accent-ink text-[2rem] font-semibold text-accent transition-[transform,background-color] duration-150 active:scale-[0.97] disabled:opacity-45">
            {digit}
          </button>
        ))}
        <button type="button" onClick={() => setPin("")} disabled={busy || pin.length === 0} className="min-h-18 rounded-panel border-2 border-accent-ink bg-transparent text-sm font-semibold text-accent-ink transition-transform duration-150 active:scale-[0.97] disabled:opacity-45" aria-label="Effacer le code">
          Effacer
        </button>
        <button type="button" onClick={() => press("0")} disabled={busy} className="min-h-18 rounded-panel border-2 border-accent-ink bg-accent-ink text-[2rem] font-semibold text-accent transition-[transform,background-color] duration-150 active:scale-[0.97] disabled:opacity-45">0</button>
        <button type="button" onClick={() => setPin((value) => value.slice(0, -1))} disabled={busy || pin.length === 0} className="min-h-18 rounded-panel border-2 border-accent-ink bg-transparent text-sm font-semibold text-accent-ink transition-transform duration-150 active:scale-[0.97] disabled:opacity-45" aria-label="Effacer le dernier chiffre">
          Retour
        </button>
      </section>
    </main>
  );
}

type MaintenanceView = "home" | "health" | "printing" | "gallery" | "settings";

function MaintenancePanel({ onExpired, onExit, debugFailure }: { onExpired: () => void; onExit: () => void; debugFailure: DebugFailure }) {
  const [snapshot, setSnapshot] = useState<MaintenanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<MaintenanceView>("home");

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

  const saveSettings = async (changes: Partial<MaintenanceSettings>) => {
    if (!snapshot || debugFailure !== "none") return;
    setSaving(true);
    try {
      const settings = await api.saveMaintenanceSettings({ ...snapshot.settings, ...changes });
      setSnapshot({ ...snapshot, settings });
      if (changes.accent_color) applyAccentTheme(changes.accent_color);
      setError(null);
    } catch {
      setError("Le réglage n’a pas été enregistré.");
    } finally {
      setSaving(false);
    }
  };

  if (!snapshot) {
    return <main className="grid h-full place-content-center bg-ink text-center text-body [--color-accent:#d8dee4] [--color-accent-ink:#101418]"><p className="text-3xl leading-[1.08] font-bold tracking-[-0.02em]">Lecture de la borne…</p>{error && <p className="mt-4 text-warn">{error}</p>}</main>;
  }

  const { health, settings } = snapshot;
  const freeRatio = health.disk_free_bytes / health.disk_total_bytes;
  const paperReady = paperRemaining(health.counters) >= settings.copies_per_print;
  const healthNeedsAttention = !health.camera_ok
    || freeRatio <= 0.1
    || (health.temperature_c !== null && health.temperature_c >= 80)
    || health.cpu_percent >= 85
    || health.memory_percent >= 85;
  const printingNeedsAttention = !paperReady || health.printer_driver === "offline";
  const status: MaintenanceStatus = !paperReady
    ? "paper"
    : !health.camera_ok
      ? "camera"
      : freeRatio <= 0.1
        ? "disk"
        : health.printer_driver === "offline"
          ? "printer"
          : "ready";
  const controlsDisabled = saving || debugFailure !== "none";

  const updateSnapshot = (fresh: MaintenanceSnapshot) => setSnapshot(fresh);

  if (view === "health") {
    return (
      <MaintenanceFrame title="Santé de la borne" status={status} onBack={() => setView("home")}>
        <HealthView snapshot={snapshot} />
      </MaintenanceFrame>
    );
  }

  if (view === "printing") {
    return (
      <MaintenanceFrame title="Impression" status={status} onBack={() => setView("home")}>
        <PrintingView
          snapshot={snapshot}
          saving={controlsDisabled}
          setSaving={setSaving}
          setError={setError}
          onChange={updateSnapshot}
          onSaveSettings={saveSettings}
        />
      </MaintenanceFrame>
    );
  }

  if (view === "gallery") {
    return (
      <MaintenanceFrame title="Galerie photo" status={status} onBack={() => setView("home")}>
        <KioskGallery onExpired={onExpired} />
      </MaintenanceFrame>
    );
  }

  if (view === "settings") {
    return (
      <MaintenanceFrame title="Réglages borne" status={status} onBack={() => setView("home")}>
        <SettingsView
          snapshot={snapshot}
          saving={controlsDisabled}
          onSaveSettings={saveSettings}
        />
      </MaintenanceFrame>
    );
  }

  return (
    <main className="grid h-full grid-rows-[auto_1fr] gap-4 bg-ink p-4 text-body [--color-accent:#d8dee4] [--color-accent-ink:#101418] max-h-[600px]:gap-3 max-h-[600px]:p-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl leading-[1.08] font-bold tracking-[-0.02em]">Maintenance</h1>
        </div>
        <div className="flex items-center gap-3">
          <MaintenanceStatusBanner status={status} />
          <GhostButton onClick={onExit}>Fermer</GhostButton>
        </div>
      </header>
      <div className="grid min-h-0 auto-rows-fr grid-cols-2 gap-3">
        <MaintenanceTile
          icon="health"
          title="Santé"
          detail={healthTileDetail(health)}
          attention={healthNeedsAttention}
          onClick={() => setView("health")}
        />
        <MaintenanceTile
          icon="print"
          title="Impression"
          detail={health.printer_driver === "offline" ? "Imprimante hors ligne · vérifier la liaison" : printingTileDetail(health.counters, settings.copies_per_print)}
          attention={printingNeedsAttention}
          onClick={() => setView("printing")}
        />
        <MaintenanceTile
          icon="gallery"
          title="Galerie"
          detail="Voir les dernières photos"
          onClick={() => setView("gallery")}
        />
        <MaintenanceTile
          icon="settings"
          title="Réglages borne"
          detail={`${KIOSK_FONTS.find((font) => font.value === settings.launch_font)?.label ?? "Apparence"} · flash ${settings.screen_flash_enabled ? "activé" : "coupé"}`}
          onClick={() => setView("settings")}
        />
      </div>
      {error && <p className="fixed bottom-3 left-4 rounded-panel bg-warn-bg px-4 py-2 text-lg font-medium tracking-[0.01em] text-warn" role="status">{error}</p>}
    </main>
  );
}

function MaintenanceFrame({
  title,
  status,
  onBack,
  children,
}: {
  title: string;
  status: MaintenanceStatus;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <main className="grid h-full grid-rows-[auto_1fr] gap-3 bg-ink p-4 text-body [--color-accent:#d8dee4] [--color-accent-ink:#101418] max-h-[600px]:p-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GhostButton onClick={onBack}>Retour</GhostButton>
          <h1 className="text-3xl leading-[1.08] font-bold tracking-[-0.02em]">{title}</h1>
        </div>
        <MaintenanceStatusBanner status={status} />
      </header>
      {children}
    </main>
  );
}

type MaintenanceStatus = "ready" | "paper" | "camera" | "disk" | "printer";

function MaintenanceStatusBanner({ status }: { status: MaintenanceStatus }) {
  if (status !== "ready") {
    const labels = {
      paper: "Papier à recharger",
      camera: "Caméra absente",
      disk: "Stockage presque plein",
      printer: "Imprimante déconnectée",
    } as const;
    return (
      <div className="relative grid size-12 flex-none place-items-center text-body after:absolute after:h-1 after:w-[2.65rem] after:-rotate-45 after:rounded-full after:bg-warn after:content-['']" role="status" aria-label={labels[status]}>
        <HardwareAlertIcon kind={status} />
      </div>
    );
  }
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-panel bg-transparent px-1 text-lg font-semibold text-body">
      <StatusMark state="ready" />
      Borne prête
    </div>
  );
}

function HardwareAlertIcon({ kind }: { kind: Exclude<MaintenanceStatus, "ready"> }) {
  const Icon = kind === "camera" ? Camera : kind === "disk" ? HardDrive : Printer;
  return <Icon className="size-[2.1rem]" strokeWidth={1.8} />;
}

function MaintenanceTile({
  icon,
  title,
  detail,
  attention = false,
  onClick,
}: {
  icon: "health" | "print" | "gallery" | "settings";
  title: string;
  detail: string;
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`grid min-h-0 grid-cols-[4.25rem_1fr_2rem] items-center gap-4 rounded-[0.65rem] border-2 p-4 px-5 text-left text-body transition-[border-color,background-color,transform] duration-150 active:scale-[0.985] active:border-accent active:bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface))] ${attention ? "border-warn bg-[color-mix(in_srgb,var(--color-warn)_7%,var(--color-surface))] motion-safe:animate-pulse" : "border-transparent bg-surface"}`}
      onClick={onClick}
    >
      <MaintenanceIcon name={icon} />
      <span>
        {attention && <span className="mb-2.5 inline-flex w-fit items-center gap-2 text-[0.95rem] leading-none font-semibold text-warn">À vérifier</span>}
        <strong className="block text-[1.75rem] leading-none font-semibold">{title}</strong>
        <small className="mt-2 block text-base font-normal text-muted">{detail}</small>
      </span>
      <ChevronRight className="w-8 text-muted" strokeWidth={2.5} />
    </button>
  );
}

function MaintenanceIcon({ name, className = "size-[4.25rem] rounded-[0.55rem] bg-accent p-[0.9rem] fill-none stroke-current stroke-2 text-accent-ink [stroke-linecap:round] [stroke-linejoin:round]" }: { name: "health" | "print" | "gallery" | "settings"; className?: string }) {
  const icons: Record<typeof name, LucideIcon> = {
    health: Activity,
    print: Printer,
    gallery: Images,
    settings: SlidersHorizontal,
  };
  const Icon = icons[name];
  return <Icon className={className} strokeWidth={2} />;
}

function HealthView({ snapshot }: { snapshot: MaintenanceSnapshot }) {
  const { health } = snapshot;
  const freeRatio = health.disk_free_bytes / health.disk_total_bytes;
  const freePercent = Math.round(freeRatio * 100);
  const storageReady = freeRatio > 0.1;
  return (
    <section className="grid min-h-0 grid-cols-[1.25fr_0.75fr] gap-4 overflow-hidden">
      <div className="grid min-h-0 grid-rows-[1fr_1.2fr] overflow-hidden rounded-[0.65rem] bg-surface">
        <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-4 p-5">
          <HealthIcon name="camera" />
          <div className="min-w-0">
            <p className="text-lg font-medium tracking-[0.01em] text-muted">Caméra</p>
            <p className={`text-3xl font-bold tabular-nums ${health.camera_ok ? "" : "text-warn"}`}>
              {health.camera_ok ? "Prête à photographier" : "Non détectée"}
            </p>
            <p className="mt-1 text-base leading-[1.3] font-normal text-muted">
              {health.camera_ok ? "Connexion et capture opérationnelles" : "Vérifiez le câble et redémarrez la borne"}
            </p>
          </div>
          <StatusMark state={health.camera_ok ? "ready" : "warning"} />
        </div>

        <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 border-t-2 border-edge p-5">
          <HealthIcon name="storage" />
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-lg font-medium tracking-[0.01em] text-muted">Stockage</p>
                <p className={`text-3xl font-bold tabular-nums ${storageReady ? "" : "text-warn"}`}>
                  {freePercent} % libre
                </p>
              </div>
              <p className="text-right text-lg font-bold tabular-nums">
                {gigabytes(health.disk_free_bytes)} <span className="font-normal text-muted">sur {gigabytes(health.disk_total_bytes)}</span>
              </p>
            </div>
            <ProgressMeter
              value={freePercent}
              warning={!storageReady}
              ariaLabel="Espace de stockage libre"
              className="mt-2.5 h-3"
            />
            <p className="mt-2 text-base leading-[1.3] font-normal text-muted">
              {storageReady ? "Espace suffisant pour les prochaines photos" : "Libérez de l’espace avant de poursuivre"}
            </p>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-col rounded-[0.65rem] bg-surface p-5">
        <div className="flex items-center gap-4 border-b-2 border-edge pb-4">
          <HealthIcon name="temperature" />
          <div>
            <p className="text-base font-medium tracking-[0.01em] text-muted">Température</p>
            <p className={`text-3xl font-bold tabular-nums ${health.temperature_c !== null && health.temperature_c >= 80 ? "text-warn" : ""}`}>
              {health.temperature_c === null ? "Indisponible" : `${Math.round(health.temperature_c)} °C`}
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-7">
          <ResourceMeter label="Processeur" percent={health.cpu_percent} large />
          <ResourceMeter label="Mémoire" percent={health.memory_percent} large />
        </div>
      </div>
    </section>
  );
}

function PrintingView({
  snapshot,
  saving,
  setSaving,
  setError,
  onChange,
  onSaveSettings,
}: {
  snapshot: MaintenanceSnapshot;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  onChange: (snapshot: MaintenanceSnapshot) => void;
  onSaveSettings: (changes: Partial<MaintenanceSettings>) => Promise<void>;
}) {
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [inkDialogOpen, setInkDialogOpen] = useState(false);
  const { health, settings } = snapshot;
  const remaining = paperRemaining(health.counters);
  const cassetteRemaining = Math.max(0, health.counters.cassette_capacity - health.counters.prints_since_cassette_reload);
  const cartridgeRemaining = Math.max(0, health.counters.cartridge_capacity - health.counters.prints_since_reset);
  const stockRemaining = Math.max(0, health.counters.paper_stock_capacity - health.counters.prints_since_stock_set);
  const printerLabel = health.printer_driver === "null"
    ? "Mode numérique"
    : health.printer_driver === "offline"
      ? "CP1500 déconnectée"
      : "CP1500 connectée";
  return (
    <section className="grid min-h-0 grid-cols-[0.9fr_1.1fr] gap-4 overflow-hidden">
      <div className="grid min-h-0 grid-rows-[1.05fr_1fr] overflow-hidden rounded-[0.65rem] bg-surface">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-5 py-[1.15rem]">
          <MaintenanceIcon name="print" className="size-14 rounded-panel border-2 border-edge p-2.5 text-accent fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]" />
          <div>
            <p className="text-lg font-medium tracking-[0.01em] text-muted">Tirages disponibles</p>
            <p className="text-[4.5rem] leading-none font-bold tabular-nums max-h-[600px]:text-[4rem]">{remaining}</p>
          </div>
          <p className={`col-span-full mt-2 flex items-center gap-2.5 font-semibold ${health.printer_driver === "offline" ? "text-warn" : ""}`}>
            <StatusMark state={health.printer_driver === "offline" ? "warning" : "ready"} />
            {printerLabel}
          </p>
        </div>
        <div className="grid content-center gap-3.5 border-t-2 border-edge px-5 py-4">
          <PrintSupply label="Bac" remaining={cassetteRemaining} capacity={health.counters.cassette_capacity} />
          <PrintSupply label="Encre" remaining={cartridgeRemaining} capacity={health.counters.cartridge_capacity} />
          <PrintSupply label="Réserve" remaining={stockRemaining} capacity={health.counters.paper_stock_capacity} unit=" feuilles" />
        </div>
      </div>
      <div className="grid min-h-0 grid-rows-[0.85fr_1.15fr] overflow-hidden rounded-[0.65rem] bg-surface">
        <div className="grid content-center gap-3.5 px-5 py-[1.1rem]">
          <div><h2 className="text-xl font-semibold">Copies par photo</h2><p className="text-base leading-[1.3] font-normal text-muted">Appliqué dès la prochaine photo</p></div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((copies) => <MaintenanceChoice key={copies} disabled={saving} pressed={settings.copies_per_print === copies} onClick={() => void onSaveSettings({ copies_per_print: copies })}>{copies}</MaintenanceChoice>)}
          </div>
        </div>
        <div className="grid content-center gap-3.5 border-t-2 border-edge px-5 py-[1.1rem]">
          <h2 className="text-xl font-semibold">Après une intervention</h2>
          <MaintenanceChoice accentBorder disabled={saving} onClick={async () => { setSaving(true); try { const counters = await api.reloadCassette(); onChange({ ...snapshot, health: { ...health, counters } }); setError(null); } catch { setError("Le rechargement du bac n’a pas été enregistré."); } finally { setSaving(false); } }}>Bac rechargé · 18 feuilles</MaintenanceChoice>
          <div className="grid grid-cols-2 gap-3">
            <MaintenanceChoice disabled={saving} onClick={() => setInkDialogOpen(true)}>Cassette d’encre remplacée</MaintenanceChoice>
            <MaintenanceChoice disabled={saving} onClick={() => setStockDialogOpen(true)}>Mettre à jour la réserve</MaintenanceChoice>
          </div>
        </div>
        <PaperStockDialog open={stockDialogOpen} initialValue={Math.max(1, health.counters.paper_stock_capacity - health.counters.prints_since_stock_set)} saving={saving} onClose={() => setStockDialogOpen(false)} onConfirm={async (total) => { setSaving(true); try { const counters = await api.setMaintenancePaperStock(total); onChange({ ...snapshot, health: { ...health, counters } }); setStockDialogOpen(false); setError(null); } catch { setError("Le stock papier n’a pas été enregistré."); } finally { setSaving(false); } }} />
        <InkCartridgeDialog open={inkDialogOpen} saving={saving} onClose={() => setInkDialogOpen(false)} onConfirm={async (capacity) => { setSaving(true); try { const counters = await api.replaceMaintenanceInk(capacity); onChange({ ...snapshot, health: { ...health, counters } }); setInkDialogOpen(false); setError(null); } catch { setError("Le remplacement de la cassette d’encre n’a pas été enregistré."); } finally { setSaving(false); } }} />
      </div>
    </section>
  );
}

function PrintSupply({ label, remaining, capacity, unit = "" }: { label: string; remaining: number; capacity: number; unit?: string }) {
  const percent = capacity > 0 ? Math.min(100, Math.round((remaining / capacity) * 100)) : 0;
  const warning = percent <= 10;
  return (
    <div className="print-supply">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-medium tracking-[0.01em]">{label}</span>
        <strong className={`font-bold tabular-nums ${warning ? "text-warn" : ""}`}>{remaining}{unit} <span className="font-normal text-muted">/ {capacity}</span></strong>
      </div>
      <ProgressMeter
        value={remaining}
        max={capacity}
        warning={warning}
        ariaLabel={`${label} restant`}
        className="mt-1 h-2.5"
      />
    </div>
  );
}

function paperRemaining(counters: MaintenanceSnapshot["health"]["counters"]) {
  return Math.max(0, Math.min(
    counters.cartridge_capacity - counters.prints_since_reset,
    counters.cassette_capacity - counters.prints_since_cassette_reload,
    counters.paper_stock_capacity - counters.prints_since_stock_set,
  ));
}

function printingTileDetail(
  counters: MaintenanceSnapshot["health"]["counters"],
  copies: number,
) {
  const cassetteRemaining = Math.max(
    0,
    counters.cassette_capacity - counters.prints_since_cassette_reload,
  );
  const inkRemaining = Math.max(
    0,
    counters.cartridge_capacity - counters.prints_since_reset,
  );
  const stockRemaining = Math.max(
    0,
    counters.paper_stock_capacity - counters.prints_since_stock_set,
  );
  const cassetteEmpty = cassetteRemaining < copies;
  const inkEmpty = inkRemaining < copies;
  const stockEmpty = stockRemaining < copies;
  if (stockEmpty) return "Stock papier insuffisant · à mettre à jour";
  if (inkEmpty) return "Cassette d’encre épuisée · à remplacer";
  if (cassetteEmpty) return "Bac vide · rechargez 18 feuilles";
  return `${copies} copie${copies > 1 ? "s" : ""} · ${Math.min(cassetteRemaining, inkRemaining, stockRemaining)} tirages avant intervention`;
}

function healthTileDetail(health: MaintenanceSnapshot["health"]) {
  if (!health.camera_ok) return "Caméra absente · vérifier la connexion";
  if (health.disk_free_bytes / health.disk_total_bytes <= 0.1) {
    return "Stockage presque plein · libérer de l’espace";
  }
  if (health.temperature_c !== null && health.temperature_c >= 80) {
    return "Température élevée · vérifier les aérations";
  }
  if (health.cpu_percent >= 85) return "Processeur très sollicité · à surveiller";
  if (health.memory_percent >= 85) return "Mémoire très sollicitée · à surveiller";
  return `${Math.round(health.cpu_percent)} % CPU · ${Math.round(health.memory_percent)} % RAM`;
}

function SettingsView({ snapshot, saving, onSaveSettings }: { snapshot: MaintenanceSnapshot; saving: boolean; onSaveSettings: (changes: Partial<MaintenanceSettings>) => Promise<void> }) {
  const [section, setSection] = useState<"appearance" | "system">("appearance");
  const { settings } = snapshot;
  return (
    <section className="grid min-h-0 grid-rows-[3.5rem_1fr] gap-3 overflow-hidden">
      <div className="grid w-[26rem] grid-cols-[1fr_1.2fr] rounded-[0.65rem] bg-surface p-1" role="tablist" aria-label="Catégories de réglages">
        <button type="button" role="tab" aria-selected={section === "appearance"} className="min-h-12 rounded-[0.45rem] text-[1.05rem] font-semibold text-muted aria-selected:bg-[#d8dee4] aria-selected:text-[#101418]" onClick={() => setSection("appearance")}>Apparence</button>
        <button type="button" role="tab" aria-selected={section === "system"} className="min-h-12 rounded-[0.45rem] text-[1.05rem] font-semibold text-muted aria-selected:bg-[#d8dee4] aria-selected:text-[#101418]" onClick={() => setSection("system")}>Écran & session</button>
      </div>
      {section === "appearance" ? (
        <div className="grid min-h-0 grid-cols-[0.72fr_1.28fr] gap-3">
          <div className="min-h-0 overflow-hidden rounded-[0.65rem] bg-surface p-3.5">
            <div className="mb-3 grid gap-0.5"><h2 className="text-[1.2rem] font-semibold">Couleur de l’événement</h2></div>
            <div className="grid min-h-0 grid-cols-4 content-start gap-2.5">
              {EVENT_PALETTE.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  disabled={saving}
                  aria-label={color.name}
                  aria-pressed={settings.accent_color.toLowerCase() === color.value}
                  className={`group relative block aspect-square min-w-0 overflow-hidden rounded-lg active:scale-[0.97] aria-pressed:shadow-[0_0_0_3px_var(--color-ink),0_0_0_5px_#d8dee4] ${color.className}`}
                  onClick={() => void onSaveSettings({ accent_color: color.value })}
                ><span className="invisible absolute right-1.5 bottom-1 z-1 grid size-6 place-items-center rounded-[0.3rem] bg-[#101418] text-[#f6f4ed] group-aria-pressed:visible" aria-hidden="true"><Check className="size-4" strokeWidth={3} /></span></button>
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-hidden rounded-[0.65rem] bg-surface p-3.5">
            <div className="mb-3 grid gap-0.5"><h2 className="text-[1.2rem] font-semibold">Typographie d’accueil</h2></div>
            <div className="grid min-h-0 grid-cols-2 content-start gap-2 overflow-y-auto overscroll-contain pr-1 pb-1 [scrollbar-color:var(--color-edge)_transparent] [scrollbar-width:thin]">
              {KIOSK_FONTS.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  disabled={saving}
                  aria-pressed={settings.launch_font === font.value}
                  className={`group relative grid min-h-16 min-w-0 grid-cols-[7.2rem_minmax(0,1fr)_1.2rem] items-center gap-2 overflow-hidden rounded-[0.45rem] bg-[#222930] px-2 py-2 text-left text-body active:scale-[0.97] aria-pressed:bg-[#303942] aria-pressed:shadow-[inset_0_0_0_2px_#d8dee4] ${LAUNCH_FONT_CLASSES[font.value]}`}
                  onClick={() => void onSaveSettings({ launch_font: font.value })}
                ><span className="w-full overflow-hidden text-[1.35rem] leading-[1.6] whitespace-nowrap">Bonjour</span><span className="max-w-full overflow-hidden font-['Barlow_Semi_Condensed',sans-serif] text-sm font-medium text-ellipsis whitespace-nowrap text-muted">{font.label}</span><span className="invisible text-body group-aria-pressed:visible" aria-hidden="true"><Check className="size-4" strokeWidth={3} /></span></button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 content-start grid-rows-[repeat(2,7.5rem)] gap-3">
          <div className="grid min-h-0 grid-cols-[3.4rem_minmax(15rem,1fr)_auto] items-center gap-4 rounded-[0.65rem] bg-surface px-4 py-3.5">
            <SystemSettingIcon name="flash" />
            <div><h2 className="text-[1.45rem] font-semibold">Flash de l’écran</h2><p className="mt-0.5 text-[0.95rem] leading-[1.3] text-muted">Éclairage blanc au déclenchement</p></div>
            <button type="button" disabled={saving} aria-label={settings.screen_flash_enabled ? "Désactiver le flash de l’écran" : "Activer le flash de l’écran"} aria-pressed={settings.screen_flash_enabled} className="flex min-h-[3.6rem] w-[4.8rem] items-center justify-end p-1 text-body disabled:cursor-wait" onClick={() => void onSaveSettings({ screen_flash_enabled: !settings.screen_flash_enabled })}><span className={`flex h-10 w-18 items-center rounded-full p-1 transition-colors duration-300 ease-out ${settings.screen_flash_enabled ? "bg-[#d8dee4]" : "bg-edge"}`}><span className={`size-[2.1rem] transform-gpu rounded-full transition-[translate,background-color] duration-300 ease-out ${settings.screen_flash_enabled ? "translate-x-8 bg-[#101418]" : "translate-x-0 bg-body"}`} /></span></button>
          </div>
          <div className="grid min-h-0 grid-cols-[3.4rem_minmax(15rem,1fr)_auto] items-center gap-4 rounded-[0.65rem] bg-surface px-4 py-3.5">
            <SystemSettingIcon name="timer" />
            <div><h2 className="text-[1.45rem] font-semibold">Minuteur par défaut</h2><p className="mt-0.5 text-[0.95rem] leading-[1.3] text-muted">Présélectionné pour chaque nouvelle photo</p></div>
            <div className="grid w-84 grid-cols-3 gap-2">
              {SHOT_TIMER_OPTIONS.map((seconds) => (
                <MaintenanceChoice
                  key={seconds}
                  disabled={saving}
                  pressed={settings.default_shot_timer_seconds === seconds}
                  onClick={() => void onSaveSettings({ default_shot_timer_seconds: seconds })}
                >
                  {seconds} s
                </MaintenanceChoice>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusMark({ state }: { state: "ready" | "warning" }) {
  return (
    <span className={`inline-grid size-[1.65rem] flex-none place-items-center rounded-[0.3rem] border-2 text-base leading-none font-bold ${state === "ready" ? "border-[#7fc6a4] bg-[#7fc6a4] text-[#101418]" : "border-current text-warn"}`} aria-hidden="true">
      {state === "ready" ? <Check className="size-4" strokeWidth={3} /> : <CircleAlert className="size-4" strokeWidth={2.5} />}
    </span>
  );
}

function SystemSettingIcon({ name }: { name: "flash" | "timer" }) {
  const Icon = name === "flash" ? Zap : Timer;
  return <Icon className="size-[3.4rem] rounded-[0.55rem] bg-[#262e36] p-3 text-accent" strokeWidth={1.8} />;
}

function KioskGallery({ onExpired }: { onExpired: () => void }) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.maintenanceGallery().then((page) => { setEntries(page.entries); setTotal(page.total); }, (cause) => { if (String(cause).includes("expirée")) onExpired(); else setError("Galerie indisponible."); });
  }, [onExpired]);
  if (selected) return <div className="relative min-h-0 overflow-hidden rounded-[0.9rem] bg-black"><img src={maintenancePhotoUrl(selected.session_id)} alt="Photo sélectionnée" className="size-full object-contain" /><button type="button" onClick={() => setSelected(null)} className="absolute right-4 bottom-4 min-h-14 rounded-panel bg-accent px-5 text-lg font-semibold text-accent-ink">Retour à la galerie</button></div>;
  if (error) return <div className="grid min-h-0 place-content-center rounded-[0.65rem] bg-surface p-3.5 text-xl text-warn max-h-[600px]:p-3">{error}</div>;
  if (entries.length === 0) return <div className="grid min-h-0 place-content-center rounded-[0.65rem] bg-surface p-3.5 text-center max-h-[600px]:p-3"><MaintenanceIcon name="gallery" className="mx-auto mb-5 size-18 rounded-panel border-2 border-edge p-3.5 text-accent fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]" /><p className="text-3xl leading-[1.2] font-bold tracking-[-0.02em]">Aucune photo</p><p className="text-lg leading-[1.3] text-muted">Les photos conservées apparaîtront ici.</p></div>;
  return <section className="grid min-h-0 grid-rows-[auto_1fr] gap-3 rounded-[0.65rem] bg-surface p-3.5 max-h-[600px]:p-3"><p className="text-lg font-medium tracking-[0.01em] text-muted">{total} photo{total > 1 ? "s" : ""} · les plus récentes</p><div className="grid min-h-0 grid-cols-4 gap-3 overflow-y-auto p-0.5">{entries.map((entry) => <button type="button" key={entry.session_id} onClick={() => setSelected(entry)} className="min-h-32 overflow-hidden rounded-panel border-[3px] border-transparent bg-ink focus-visible:border-accent"><img src={maintenanceThumbnailUrl(entry.session_id)} alt="Ouvrir cette photo" className="size-full object-cover" /></button>)}</div></section>;
}

function HealthIcon({ name }: { name: "camera" | "storage" | "temperature" }) {
  const icons: Record<typeof name, LucideIcon> = {
    camera: Camera,
    storage: HardDrive,
    temperature: Thermometer,
  };
  const Icon = icons[name];
  return <Icon className="size-14 rounded-panel border-2 border-edge p-2.5 text-accent" strokeWidth={1.8} />;
}

function ResourceMeter({ label, percent, large = false }: { label: string; percent: number; large?: boolean }) {
  const bounded = Math.max(0, Math.min(100, percent));
  const warning = bounded >= 85;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-medium tracking-[0.01em] text-muted">{label}</span>
        <strong className={`${large ? "text-[2rem]" : "text-lg"} tabular-nums`}>{Math.round(bounded)} %</strong>
      </div>
      <ProgressMeter
        value={bounded}
        warning={warning}
        ariaLabel={`Utilisation ${label}`}
        className={large ? "mt-1.5 h-[1.15rem]" : "h-2.5"}
      />
    </div>
  );
}

function ProgressMeter({
  value,
  max = 100,
  warning,
  ariaLabel,
  className,
}: {
  value: number;
  max?: number;
  warning: boolean;
  ariaLabel: string;
  className: string;
}) {
  return (
    <progress
      value={value}
      max={max}
      aria-label={ariaLabel}
      className={`${className} block w-full appearance-none overflow-hidden rounded-full bg-edge [&::-webkit-progress-bar]:bg-edge ${warning ? "[&::-moz-progress-bar]:bg-warn [&::-webkit-progress-value]:bg-warn" : "[&::-moz-progress-bar]:bg-accent [&::-webkit-progress-value]:bg-accent"}`}
    />
  );
}

function MaintenanceChoice({
  children,
  disabled,
  pressed,
  accentBorder = false,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  pressed?: boolean;
  accentBorder?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-[3.4rem] rounded-panel border-2 bg-transparent text-xl font-semibold text-body transition-[transform,background-color,color] duration-150 active:scale-[0.97] aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-ink disabled:cursor-wait ${accentBorder ? "border-accent" : "border-edge"}`}
    >
      {children}
    </button>
  );
}

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
