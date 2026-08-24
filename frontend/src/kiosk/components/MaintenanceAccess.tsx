import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

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
import { applyAccentTheme, LAUNCH_FONT_FAMILIES } from "../../shared/theme";
import { mockMaintenanceSnapshot, type DebugFailure } from "../debugFailures";
import { GhostButton } from "./Screen";

const PIN_LENGTH = 4;
const POLL_INTERVAL_MS = 2000;
const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];
const EVENT_PALETTE = [
  { name: "Or", value: "#ffd400" },
  { name: "Champagne", value: "#d9b66f" },
  { name: "Abricot", value: "#f09a62" },
  { name: "Terracotta", value: "#d97757" },
  { name: "Corail", value: "#ef6f6c" },
  { name: "Rose", value: "#e56b8a" },
  { name: "Bordeaux", value: "#a43d5b" },
  { name: "Prune", value: "#704264" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Bleu royal", value: "#3b82f6" },
  { name: "Bleu nuit", value: "#496a9b" },
  { name: "Glacier", value: "#73a9c2" },
  { name: "Lagune", value: "#2798a8" },
  { name: "Émeraude", value: "#2a9d8f" },
  { name: "Menthe", value: "#58b89d" },
  { name: "Sauge", value: "#84a98c" },
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
    <main className="maintenance-shell grid h-full grid-cols-[1fr_22rem]">
      <section className="flex flex-col justify-between p-10">
        <div>
          <h1 className="type-kiosk-display max-w-[9ch] text-6xl">Maintenance</h1>
          <p className="type-kiosk-label mt-3 text-lg text-muted">Accès réservé à l’organisateur</p>
        </div>
        <div>
          <p className="type-kiosk-section-title text-xl">Saisissez le code de la borne</p>
          <div className="mt-5 flex gap-3" aria-label={`${pin.length} chiffres saisis`}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <span key={index} className={`pin-dot ${index < pin.length ? "pin-dot-filled" : ""}`} />
            ))}
          </div>
          <p className={`type-kiosk-label mt-4 min-h-7 text-lg text-warn ${error ? "" : "invisible"}`} role="alert">
            {error ?? "Aucune erreur"}
          </p>
        </div>
        <GhostButton onClick={onCancel}>Retour aux photos</GhostButton>
      </section>

      <section className="keypad grid grid-cols-3 gap-2 p-4" aria-label="Clavier numérique">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" onClick={() => press(digit)} disabled={busy} className="keypad-key">
            {digit}
          </button>
        ))}
        <button type="button" onClick={() => setPin("")} disabled={busy || pin.length === 0} className="keypad-key keypad-action" aria-label="Effacer le code">
          Effacer
        </button>
        <button type="button" onClick={() => press("0")} disabled={busy} className="keypad-key">0</button>
        <button type="button" onClick={() => setPin((value) => value.slice(0, -1))} disabled={busy || pin.length === 0} className="keypad-key keypad-action" aria-label="Effacer le dernier chiffre">
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
    return <main className="maintenance-shell grid h-full place-content-center text-center"><p className="type-kiosk-screen-title text-3xl">Lecture de la borne…</p>{error && <p className="mt-4 text-warn">{error}</p>}</main>;
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
    <main className="maintenance-shell grid h-full grid-rows-[auto_1fr] gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="type-kiosk-screen-title text-3xl">Maintenance</h1>
        </div>
        <div className="flex items-center gap-3">
          <MaintenanceStatusBanner status={status} />
          <GhostButton onClick={onExit}>Fermer</GhostButton>
        </div>
      </header>
      <div className="maintenance-nav-grid grid min-h-0 grid-cols-2 gap-3">
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
      {error && <p className="type-kiosk-label fixed bottom-3 left-4 rounded-panel bg-warn-bg px-4 py-2 text-lg text-warn" role="status">{error}</p>}
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
    <main className="maintenance-shell grid h-full grid-rows-[auto_1fr] gap-3 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GhostButton onClick={onBack}>Retour</GhostButton>
          <h1 className="type-kiosk-screen-title text-3xl">{title}</h1>
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
      <div className="hardware-alert" role="status" aria-label={labels[status]}>
        <HardwareAlertIcon kind={status} />
      </div>
    );
  }
  return (
    <div className="status-banner status-ready">
      <StatusMark state="ready" />
      Borne prête
    </div>
  );
}

function HardwareAlertIcon({ kind }: { kind: Exclude<MaintenanceStatus, "ready"> }) {
  if (kind === "camera") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="hardware-alert-icon"><rect x="3" y="6" width="14" height="12" rx="2" /><path d="m17 10 4-2v8l-4-2" /></svg>;
  }
  if (kind === "disk") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="hardware-alert-icon"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></svg>;
  }
  return <MaintenanceIcon name="print" className="hardware-alert-icon" />;
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
      className={attention ? "maintenance-tile maintenance-tile-attention" : "maintenance-tile"}
      onClick={onClick}
    >
      <MaintenanceIcon name={icon} />
      <span>
        {attention && <span className="maintenance-tile-alert">À vérifier</span>}
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="tile-arrow">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </button>
  );
}

function MaintenanceIcon({ name, className = "tile-icon" }: { name: "health" | "print" | "gallery" | "settings"; className?: string }) {
  const paths = {
    health: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    print: <><path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></>,
    gallery: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m3 16 5-5 4 4 2-2 7 7M16 8h.01" /></>,
    settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>{paths[name]}</svg>;
}

function HealthView({ snapshot }: { snapshot: MaintenanceSnapshot }) {
  const { health } = snapshot;
  const freeRatio = health.disk_free_bytes / health.disk_total_bytes;
  const freePercent = Math.round(freeRatio * 100);
  const storageReady = freeRatio > 0.1;
  return (
    <section className="maintenance-detail health-layout grid min-h-0 grid-cols-[1.25fr_0.75fr] gap-4">
      <div className="maintenance-block health-hardware">
        <div className="health-hardware-row">
          <HealthIcon name="camera" />
          <div className="min-w-0">
            <p className="type-kiosk-label text-lg text-muted">Caméra</p>
            <p className={`type-kiosk-data text-3xl ${health.camera_ok ? "" : "text-warn"}`}>
              {health.camera_ok ? "Prête à photographier" : "Non détectée"}
            </p>
            <p className="type-kiosk-meta mt-1 text-base text-muted">
              {health.camera_ok ? "Connexion et capture opérationnelles" : "Vérifiez le câble et redémarrez la borne"}
            </p>
          </div>
          <StatusMark state={health.camera_ok ? "ready" : "warning"} />
        </div>

        <div className="health-hardware-row health-storage-row">
          <HealthIcon name="storage" />
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="type-kiosk-label text-lg text-muted">Stockage</p>
                <p className={`type-kiosk-data text-3xl ${storageReady ? "" : "text-warn"}`}>
                  {freePercent} % libre
                </p>
              </div>
              <p className="type-kiosk-data health-storage-detail text-right text-lg">
                {gigabytes(health.disk_free_bytes)} <span className="text-muted">sur {gigabytes(health.disk_total_bytes)}</span>
              </p>
            </div>
            <div
              className="health-storage-track"
              role="meter"
              aria-label="Espace de stockage libre"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={freePercent}
            >
              <span
                className={storageReady ? "health-storage-fill" : "health-storage-fill health-storage-fill-warning"}
                style={{ width: `${freePercent}%` }}
              />
            </div>
            <p className="type-kiosk-meta mt-2 text-base text-muted">
              {storageReady ? "Espace suffisant pour les prochaines photos" : "Libérez de l’espace avant de poursuivre"}
            </p>
          </div>
        </div>
      </div>
      <div className="maintenance-block health-resources flex flex-col">
        <div className="health-temperature">
          <HealthIcon name="temperature" />
          <div>
            <p className="type-kiosk-label text-base text-muted">Température</p>
            <p className={`type-kiosk-data text-3xl ${health.temperature_c !== null && health.temperature_c >= 80 ? "text-warn" : ""}`}>
              {health.temperature_c === null ? "Indisponible" : `${Math.round(health.temperature_c)} °C`}
            </p>
          </div>
        </div>
        <div className="health-resource-meters flex flex-1 flex-col justify-center gap-7">
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
    <section className="maintenance-detail printing-layout grid min-h-0 grid-cols-[0.9fr_1.1fr] gap-4">
      <div className="maintenance-block printing-overview">
        <div className="printing-total">
          <MaintenanceIcon name="print" className="printing-icon" />
          <div>
            <p className="type-kiosk-label text-lg text-muted">Tirages disponibles</p>
            <p className="type-kiosk-data printing-total-value">{remaining}</p>
          </div>
          <p className={`type-kiosk-section-title printing-driver ${health.printer_driver === "offline" ? "text-warn" : ""}`}>
            <StatusMark state={health.printer_driver === "offline" ? "warning" : "ready"} />
            {printerLabel}
          </p>
        </div>
        <div className="printing-supplies">
          <PrintSupply label="Bac" remaining={cassetteRemaining} capacity={health.counters.cassette_capacity} />
          <PrintSupply label="Encre" remaining={cartridgeRemaining} capacity={health.counters.cartridge_capacity} />
          <PrintSupply label="Réserve" remaining={stockRemaining} capacity={health.counters.paper_stock_capacity} unit=" feuilles" />
        </div>
      </div>
      <div className="maintenance-block printing-actions">
        <div className="printing-copies">
          <div><h2 className="type-kiosk-section-title text-xl">Copies par photo</h2><p className="type-kiosk-meta text-base text-muted">Appliqué dès la prochaine photo</p></div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((copies) => <button key={copies} type="button" disabled={saving} aria-pressed={settings.copies_per_print === copies} className="maintenance-choice" onClick={() => void onSaveSettings({ copies_per_print: copies })}>{copies}</button>)}
          </div>
        </div>
        <div className="printing-interventions">
          <h2 className="type-kiosk-section-title text-xl">Après une intervention</h2>
          <button type="button" disabled={saving} className="maintenance-choice printing-action-primary" onClick={async () => { setSaving(true); try { const counters = await api.reloadCassette(); onChange({ ...snapshot, health: { ...health, counters } }); setError(null); } catch { setError("Le rechargement du bac n’a pas été enregistré."); } finally { setSaving(false); } }}>Bac rechargé · 18 feuilles</button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={saving} className="maintenance-choice" onClick={() => setInkDialogOpen(true)}>Cassette d’encre remplacée</button>
            <button type="button" disabled={saving} className="maintenance-choice" onClick={() => setStockDialogOpen(true)}>Mettre à jour la réserve</button>
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
        <span className="type-kiosk-label text-lg">{label}</span>
        <strong className={warning ? "type-kiosk-data text-warn" : "type-kiosk-data"}>{remaining}{unit} <span className="text-muted">/ {capacity}</span></strong>
      </div>
      <div className="resource-track" role="meter" aria-label={`${label} restant`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={remaining}>
        <span className={warning ? "resource-fill resource-fill-warning" : "resource-fill"} style={{ width: `${percent}%` }} />
      </div>
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
    <section className="maintenance-detail settings-workspace">
      <div className="settings-tabs" role="tablist" aria-label="Catégories de réglages">
        <button type="button" role="tab" aria-selected={section === "appearance"} onClick={() => setSection("appearance")}>Apparence</button>
        <button type="button" role="tab" aria-selected={section === "system"} onClick={() => setSection("system")}>Écran & session</button>
      </div>
      {section === "appearance" ? (
        <div className="settings-appearance-layout">
          <div className="settings-pane settings-color-pane">
            <div className="settings-pane-heading"><h2 className="type-kiosk-section-title">Couleur de l’événement</h2><p className="type-kiosk-meta">Accent du parcours invité</p></div>
            <div className="kiosk-palette-grid">
              {EVENT_PALETTE.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  disabled={saving}
                  aria-label={color.name}
                  aria-pressed={settings.accent_color.toLowerCase() === color.value}
                  className="kiosk-palette-choice"
                  style={{ "--swatch": color.value } as CSSProperties}
                  onClick={() => void onSaveSettings({ accent_color: color.value })}
                ><span className="palette-swatch" /><span className="choice-check" aria-hidden="true">✓</span></button>
              ))}
            </div>
          </div>
          <div className="settings-pane settings-font-pane">
            <div className="settings-pane-heading"><h2 className="type-kiosk-section-title">Typographie d’accueil</h2><p className="type-kiosk-meta">Aperçu du titre affiché aux invités</p></div>
            <div className="kiosk-font-grid">
              {KIOSK_FONTS.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  disabled={saving}
                  aria-pressed={settings.launch_font === font.value}
                  className="kiosk-font-choice"
                  style={{ fontFamily: LAUNCH_FONT_FAMILIES[font.value] }}
                  onClick={() => void onSaveSettings({ launch_font: font.value })}
                ><span className="font-sample">Bonjour</span><span className="font-label">{font.label}</span><span className="choice-check" aria-hidden="true">✓</span></button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="settings-system-grid">
          <div className="system-setting-row">
            <SystemSettingIcon name="flash" />
            <div className="system-setting-copy"><h2 className="type-kiosk-section-title">Flash de l’écran</h2><p className="type-kiosk-meta">Éclairage blanc au déclenchement</p></div>
            <button type="button" disabled={saving} aria-label={settings.screen_flash_enabled ? "Désactiver le flash de l’écran" : "Activer le flash de l’écran"} aria-pressed={settings.screen_flash_enabled} className="maintenance-toggle system-toggle" onClick={() => void onSaveSettings({ screen_flash_enabled: !settings.screen_flash_enabled })}><span className="toggle-track"><span className="toggle-thumb" /></span></button>
          </div>
          <div className="system-setting-row">
            <SystemSettingIcon name="timer" />
            <div className="system-setting-copy"><h2 className="type-kiosk-section-title">Minuteur par défaut</h2><p className="type-kiosk-meta">Présélectionné pour chaque nouvelle photo</p></div>
            <div className="system-timer-grid">
              {SHOT_TIMER_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  disabled={saving}
                  aria-pressed={settings.default_shot_timer_seconds === seconds}
                  className="maintenance-choice"
                  onClick={() => void onSaveSettings({ default_shot_timer_seconds: seconds })}
                >
                  {seconds} s
                </button>
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
    <span className={`status-mark status-mark-${state}`} aria-hidden="true">
      {state === "ready" ? "✓" : "!"}
    </span>
  );
}

function SystemSettingIcon({ name }: { name: "flash" | "timer" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="system-setting-icon">
      {name === "flash"
        ? <path d="M13 2 5 14h6l-1 8 8-12h-6l1-8Z" />
        : <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></>}
    </svg>
  );
}

function KioskGallery({ onExpired }: { onExpired: () => void }) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.maintenanceGallery().then((page) => { setEntries(page.entries); setTotal(page.total); }, (cause) => { if (String(cause).includes("expirée")) onExpired(); else setError("Galerie indisponible."); });
  }, [onExpired]);
  if (selected) return <div className="gallery-focus"><img src={maintenancePhotoUrl(selected.session_id)} alt="Photo sélectionnée" /><button type="button" onClick={() => setSelected(null)}>Retour à la galerie</button></div>;
  if (error) return <div className="maintenance-block grid place-content-center text-xl text-warn">{error}</div>;
  if (entries.length === 0) return <div className="maintenance-block gallery-empty grid place-content-center text-center"><MaintenanceIcon name="gallery" className="gallery-empty-icon" /><p className="type-kiosk-screen-title text-3xl">Aucune photo</p><p className="type-kiosk-meta text-lg text-muted">Les photos conservées apparaîtront ici.</p></div>;
  return <section className="maintenance-block grid min-h-0 grid-rows-[auto_1fr] gap-3"><p className="type-kiosk-label text-lg text-muted">{total} photo{total > 1 ? "s" : ""} · les plus récentes</p><div className="kiosk-gallery-grid grid min-h-0 grid-cols-4 gap-3">{entries.map((entry) => <button type="button" key={entry.session_id} onClick={() => setSelected(entry)}><img src={maintenanceThumbnailUrl(entry.session_id)} alt="Ouvrir cette photo" /></button>)}</div></section>;
}

function HealthIcon({ name }: { name: "camera" | "storage" | "temperature" }) {
  const paths = {
    camera: <><rect x="3" y="6" width="14" height="12" rx="2" /><path d="m17 10 4-2v8l-4-2M7 6l1.5-2h4L14 6" /></>,
    storage: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
    temperature: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" /><path d="M12 9v7" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="health-icon">{paths[name]}</svg>;
}

function ResourceMeter({ label, percent, large = false }: { label: string; percent: number; large?: boolean }) {
  const bounded = Math.max(0, Math.min(100, percent));
  const warning = bounded >= 85;
  return (
    <div className={large ? "resource-meter resource-meter-large" : "resource-meter"}>
      <div className="flex items-baseline justify-between">
        <span className="type-kiosk-label text-muted">{label}</span>
        <strong className="text-lg tabular-nums">{Math.round(bounded)} %</strong>
      </div>
      <div
        className="resource-track"
        role="meter"
        aria-label={`Utilisation ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bounded)}
      >
        <span
          className={warning ? "resource-fill resource-fill-warning" : "resource-fill"}
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
