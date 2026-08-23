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
  { name: "Terracotta", value: "#d97757" },
  { name: "Bordeaux", value: "#a43d5b" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Bleu royal", value: "#3b82f6" },
  { name: "Bleu nuit", value: "#496a9b" },
  { name: "Émeraude", value: "#2a9d8f" },
  { name: "Sauge", value: "#84a98c" },
  { name: "Rose", value: "#e56b8a" },
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
          <p className="text-base text-muted">Que voulez-vous vérifier ?</p>
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
          onClick={() => setView("health")}
        />
        <MaintenanceTile
          icon="print"
          title="Impression"
          detail={health.printer_driver === "offline" ? "Imprimante hors ligne · vérifier la liaison" : printingTileDetail(health.counters, settings.copies_per_print)}
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
      <span className="status-dot" />
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
  onClick,
}: {
  icon: "health" | "print" | "gallery" | "settings";
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="maintenance-tile" onClick={onClick}>
      <MaintenanceIcon name={icon} />
      <span>
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
  return (
    <section className="maintenance-detail grid min-h-0 grid-cols-[1fr_1.2fr] gap-4">
      <div className="maintenance-block grid grid-cols-2 gap-3">
        <HealthSignal label="Caméra" value={health.camera_ok ? "Prête" : "Absente"} ok={health.camera_ok} />
        <HealthSignal label="Stockage" value={`${Math.round(freeRatio * 100)} % libre`} ok={freeRatio > 0.1} />
        <HealthSignal label="Température" value={health.temperature_c === null ? "Indisponible" : `${Math.round(health.temperature_c)} °C`} ok={health.temperature_c === null || health.temperature_c < 80} />
        <HealthSignal label="Session" value={health.session_state} ok={health.session_state !== "error"} />
      </div>
      <div className="maintenance-block flex flex-col justify-center gap-7">
        <ResourceMeter label="Processeur" percent={health.cpu_percent} large />
        <ResourceMeter label="Mémoire" percent={health.memory_percent} large />
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
  return (
    <section className="maintenance-detail grid min-h-0 grid-cols-[0.8fr_1.2fr] gap-4">
      <div className="maintenance-block flex flex-col justify-between">
        <div><p className="type-kiosk-label text-lg text-muted">Papier restant</p><p className="type-kiosk-data text-7xl">{remaining}</p></div>
        <div className="type-kiosk-meta text-lg text-muted"><p>Bac : {Math.max(0, health.counters.cassette_capacity - health.counters.prints_since_cassette_reload)} / {health.counters.cassette_capacity}</p><p>Encre : {Math.max(0, health.counters.cartridge_capacity - health.counters.prints_since_reset)} / {health.counters.cartridge_capacity}</p><p>Stock total : {Math.max(0, health.counters.paper_stock_capacity - health.counters.prints_since_stock_set)} feuilles</p></div>
        <p className="type-kiosk-section-title text-lg">{health.printer_driver === "null" ? "Mode numérique" : health.printer_driver === "offline" ? "CP1500 déconnectée" : "CP1500 connectée"}</p>
      </div>
      <div className="maintenance-block flex flex-col justify-between">
        <Setting title="Copies par photo" description="Appliqué dès la prochaine photo">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((copies) => <button key={copies} type="button" disabled={saving} aria-pressed={settings.copies_per_print === copies} className="maintenance-choice" onClick={() => void onSaveSettings({ copies_per_print: copies })}>{copies}</button>)}
          </div>
        </Setting>
        <div>
          <button type="button" disabled={saving} className="maintenance-choice mb-3 w-full" onClick={async () => { setSaving(true); try { const counters = await api.reloadCassette(); onChange({ ...snapshot, health: { ...health, counters } }); setError(null); } catch { setError("Le rechargement du bac n’a pas été enregistré."); } finally { setSaving(false); } }}>Bac rechargé (18 feuilles)</button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={saving} className="maintenance-choice" onClick={() => setInkDialogOpen(true)}>Cassette d’encre remplacée</button>
            <button type="button" disabled={saving} className="maintenance-choice" onClick={() => setStockDialogOpen(true)}>Définir le stock papier</button>
          </div>
        </div>
        <PaperStockDialog open={stockDialogOpen} initialValue={Math.max(1, health.counters.paper_stock_capacity - health.counters.prints_since_stock_set)} saving={saving} onClose={() => setStockDialogOpen(false)} onConfirm={async (total) => { setSaving(true); try { const counters = await api.setMaintenancePaperStock(total); onChange({ ...snapshot, health: { ...health, counters } }); setStockDialogOpen(false); setError(null); } catch { setError("Le stock papier n’a pas été enregistré."); } finally { setSaving(false); } }} />
        <InkCartridgeDialog open={inkDialogOpen} saving={saving} onClose={() => setInkDialogOpen(false)} onConfirm={async (capacity) => { setSaving(true); try { const counters = await api.replaceMaintenanceInk(capacity); onChange({ ...snapshot, health: { ...health, counters } }); setInkDialogOpen(false); setError(null); } catch { setError("Le remplacement de la cassette d’encre n’a pas été enregistré."); } finally { setSaving(false); } }} />
      </div>
    </section>
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
  return `${Math.round(health.cpu_percent)} % CPU · ${Math.round(health.memory_percent)} % RAM`;
}

function SettingsView({ snapshot, saving, onSaveSettings }: { snapshot: MaintenanceSnapshot; saving: boolean; onSaveSettings: (changes: Partial<MaintenanceSettings>) => Promise<void> }) {
  const [section, setSection] = useState<"appearance" | "system">("appearance");
  const { settings } = snapshot;
  return (
    <section className="maintenance-detail grid min-h-0 grid-rows-[3.5rem_1fr] gap-3">
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="maintenance-choice" aria-pressed={section === "appearance"} onClick={() => setSection("appearance")}>Apparence</button>
        <button type="button" className="maintenance-choice" aria-pressed={section === "system"} onClick={() => setSection("system")}>Écran & session</button>
      </div>
      {section === "appearance" ? (
        <div className="grid min-h-0 grid-cols-[0.9fr_1.1fr] gap-3">
          <div className="maintenance-block grid min-h-0 grid-rows-[auto_1fr] gap-2">
            <div><h2 className="type-kiosk-section-title text-xl">Couleur</h2><p className="type-kiosk-meta text-sm text-muted">Palette adaptée aux événements</p></div>
            <div className="kiosk-palette-grid grid min-h-0 grid-cols-4 gap-2">
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
                ><span /> <small>{color.name}</small></button>
              ))}
            </div>
          </div>
          <div className="maintenance-block grid min-h-0 grid-rows-[auto_1fr] gap-2">
            <div><h2 className="type-kiosk-section-title text-xl">Typographie</h2><p className="type-kiosk-meta text-sm text-muted">Titre de l’écran d’accueil</p></div>
            <div className="kiosk-font-grid grid min-h-0 grid-cols-5 gap-2">
              {KIOSK_FONTS.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  disabled={saving}
                  aria-pressed={settings.launch_font === font.value}
                  className="kiosk-font-choice"
                  style={{ fontFamily: LAUNCH_FONT_FAMILIES[font.value] }}
                  onClick={() => void onSaveSettings({ launch_font: font.value })}
                >{font.label}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-2 gap-4">
          <div className="maintenance-block flex flex-col justify-center">
            <Setting title="Flash de l’écran" description="Éclairage blanc au moment de la prise">
              <button type="button" disabled={saving} aria-pressed={settings.screen_flash_enabled} className="maintenance-toggle" onClick={() => void onSaveSettings({ screen_flash_enabled: !settings.screen_flash_enabled })}><span>{settings.screen_flash_enabled ? "Activé" : "Désactivé"}</span><span className="toggle-track"><span className="toggle-thumb" /></span></button>
            </Setting>
          </div>
          <div className="maintenance-block flex flex-col justify-center">
            <Setting title="Minuteur par défaut" description="Présélectionné pour chaque nouvelle photo">
              <div className="grid grid-cols-3 gap-2">
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
            </Setting>
          </div>
        </div>
      )}
    </section>
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
  if (entries.length === 0) return <div className="maintenance-block grid place-content-center text-center"><p className="type-kiosk-screen-title text-3xl">Aucune photo</p><p className="type-kiosk-meta text-lg text-muted">Les photos conservées apparaîtront ici.</p></div>;
  return <section className="maintenance-block grid min-h-0 grid-rows-[auto_1fr] gap-3"><p className="type-kiosk-label text-lg text-muted">{total} photo{total > 1 ? "s" : ""} · les plus récentes</p><div className="kiosk-gallery-grid grid min-h-0 grid-cols-4 gap-3">{entries.map((entry) => <button type="button" key={entry.session_id} onClick={() => setSelected(entry)}><img src={maintenanceThumbnailUrl(entry.session_id)} alt="Ouvrir cette photo" /></button>)}</div></section>;
}

function HealthSignal({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="health-signal"><span className={`status-dot ${ok ? "" : "status-dot-warn"}`} /><p className="type-kiosk-label mt-3 text-base text-muted">{label}</p><p className="type-kiosk-data text-xl">{value}</p></div>;
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

function Setting({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div><div className="mb-3"><h2 className="type-kiosk-section-title text-xl">{title}</h2><p className="type-kiosk-meta text-sm text-muted">{description}</p></div>{children}</div>;
}
