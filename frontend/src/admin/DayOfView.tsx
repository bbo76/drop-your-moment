import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  api,
  photoViewUrl,
  thumbnailUrl,
  type AdminHealth,
  type EventConfigPayload,
  type GalleryEntry,
  type ShotTimerSeconds,
} from "../shared/api";
import { Button, Feedback } from "./ui";
import { InkCartridgeDialog } from "../shared/InkCartridgeDialog";
import { PaperStockDialog } from "../shared/PaperStockDialog";

const POLL_INTERVAL_MS = 2_000;
const RECENT_PHOTO_COUNT = 6;
const TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];

type Readiness = {
  tone: "ready" | "busy" | "attention";
  title: string;
  detail: string;
};

export function DayOfView() {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [config, setConfig] = useState<EventConfigPayload | null>(null);
  const [photos, setPhotos] = useState<GalleryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [inkDialogOpen, setInkDialogOpen] = useState(false);

  const loadPhotos = useCallback(async () => {
    const page = await api.gallery(0, RECENT_PHOTO_COUNT);
    setPhotos(page.entries);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const fresh = await api.health();
        if (!cancelled) {
          setHealth(fresh);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Connexion à la borne perdue. Restez sur le Wi-Fi du photobooth.");
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    void tick();
    void api.eventConfig().then(setConfig, () => undefined);
    void loadPhotos().catch(() => undefined);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadPhotos]);

  const run = async (name: string, action: () => Promise<void>, success: string) => {
    setWorking(name);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(null);
    }
  };

  const reloadCassette = () =>
    run(
      "cassette",
      async () => {
        const counters = await api.reloadAdminCassette();
        setHealth((current) => (current ? { ...current, counters } : current));
      },
      "Bac rechargé : 18 feuilles disponibles.",
    );

  const setPaperStock = (total: number) => {
    void run(
      "paper-stock",
      async () => {
        const counters = await api.setPaperStock(total);
        setHealth((current) => (current ? { ...current, counters } : current));
        setStockDialogOpen(false);
      },
      "Stock papier enregistré.",
    );
  };

  const replaceInk = (capacity: 36 | 54) => {
    void run(
      "ink",
      async () => {
        const counters = await api.replaceInk(capacity);
        setHealth((current) => (current ? { ...current, counters } : current));
        setInkDialogOpen(false);
      },
      "Cassette d’encre enregistrée.",
    );
  };

  const releaseKiosk = () => {
    if (!window.confirm("Interrompre la session en cours et ramener la borne à l’accueil ?")) return;
    void run(
      "release",
      async () => {
        const session = await api.releaseKiosk();
        setHealth((current) =>
          current ? { ...current, session_state: session.state } : current,
        );
      },
      "La borne est revenue à l’accueil.",
    );
  };

  const saveQuickSetting = (changes: Partial<EventConfigPayload>) => {
    if (!config) return;
    const next = { ...config, ...changes };
    void run(
      "settings",
      async () => setConfig(await api.saveEventConfig(next)),
      "Réglage appliqué à la borne.",
    );
  };

  if (!health) {
    return (
      <div className="day-status day-status-attention" role="status">
        <StatusIcon name={error ? "wifi" : "pulse"} />
        <div>
          <h2>{error ? "Borne injoignable" : "Connexion à la borne…"}</h2>
          <p>{error ?? "Lecture de l’état en cours."}</p>
        </div>
      </div>
    );
  }

  const readiness = getReadiness(health, error);
  const cassetteRemaining = Math.max(
    0,
    health.counters.cassette_capacity - health.counters.prints_since_cassette_reload,
  );
  const stockRemaining = Math.max(
    0,
    health.counters.paper_stock_capacity - health.counters.prints_since_stock_set,
  );
  const inkRemaining = Math.max(
    0,
    health.counters.cartridge_capacity - health.counters.prints_since_reset,
  );
  const printableNow = Math.min(cassetteRemaining, stockRemaining, inkRemaining);
  const nextAction = printingNextAction(cassetteRemaining, stockRemaining, inkRemaining);

  return (
    <div className="day-view">
      <section className={`day-status day-status-${readiness.tone}`} aria-live="polite">
        <StatusIcon name={readiness.tone === "ready" ? "check" : "attention"} />
        <div className="min-w-0">
          <h2>{readiness.title}</h2>
          <p>{readiness.detail}</p>
          <p className="day-event-name">{health.event_name}</p>
        </div>
      </section>

      {(error || notice) && <Feedback error={error} notice={notice} />}

      <section className="day-section" aria-labelledby="day-parcours-title">
        <div className="day-section-heading">
          <div>
            <h2 id="day-parcours-title">Parcours</h2>
            <p>Ce que voient les invités en ce moment.</p>
          </div>
          <StateBadge state={health.session_state} maintenanceActive={health.maintenance_active} />
        </div>
        {health.session_state !== "idle" && (
          <Button
            tone="warning"
            onClick={releaseKiosk}
            disabled={working === "release"}
          >
            {working === "release" ? "Retour en cours…" : "Ramener la borne à l’accueil"}
          </Button>
        )}
      </section>

      <section className="day-section" aria-labelledby="day-material-title">
        <div className="day-section-heading">
          <div>
            <h2 id="day-material-title">Borne</h2>
            <p>Les signaux utiles, sans le détail technique.</p>
          </div>
        </div>
        <div className="day-facts">
          <Fact
            icon="camera"
            label="Caméra"
            value={health.camera_ok ? "Prête" : "Absente"}
            attention={!health.camera_ok}
          />
          <Fact
            icon="storage"
            label="Stockage libre"
            value={gigabytes(health.disk_free_bytes)}
            attention={health.disk_free_bytes < 2 * 1024 ** 3}
          />
          <Fact
            icon="temperature"
            label="Température"
            value={health.temperature_c === null ? "Non mesurée" : `${health.temperature_c.toFixed(0)} °C`}
            attention={health.temperature_c !== null && health.temperature_c >= 80}
          />
        </div>
      </section>

      <section className="day-section" aria-labelledby="day-print-title">
        <div className="day-section-heading">
          <div>
            <h2 id="day-print-title">Impression</h2>
            <p>{health.counters.prints_total} tirage{health.counters.prints_total > 1 ? "s" : ""} pendant l’événement.</p>
          </div>
        </div>
        <div className="day-print-summary">
          <strong>{printableNow}</strong>
          <span>impression{printableNow > 1 ? "s" : ""} avant intervention</span>
          <small>{nextAction}</small>
        </div>
        <div className="day-consumables">
          <Consumable label="Bac" remaining={cassetteRemaining} capacity={health.counters.cassette_capacity} />
          <Consumable label="Encre" remaining={inkRemaining} capacity={health.counters.cartridge_capacity} />
          <Consumable label="Stock total" remaining={stockRemaining} capacity={health.counters.paper_stock_capacity} />
        </div>
        <div className="day-actions">
          <Button onClick={() => void reloadCassette()} disabled={working === "cassette"}>
            {working === "cassette" ? "Mise à jour…" : "Bac rechargé"}
          </Button>
          <Button onClick={() => setInkDialogOpen(true)} disabled={working === "ink"} tone="secondary">
            Cassette d’encre remplacée
          </Button>
          <Button onClick={() => setStockDialogOpen(true)} disabled={working === "paper-stock"} tone="secondary">
            Définir le stock papier
          </Button>
        </div>
      </section>

      <PaperStockDialog
        open={stockDialogOpen}
        initialValue={Math.max(1, stockRemaining)}
        saving={working === "paper-stock"}
        onClose={() => setStockDialogOpen(false)}
        onConfirm={setPaperStock}
      />
      <InkCartridgeDialog
        open={inkDialogOpen}
        saving={working === "ink"}
        onClose={() => setInkDialogOpen(false)}
        onConfirm={replaceInk}
      />

      <section className="day-section" aria-labelledby="day-settings-title">
        <div className="day-section-heading">
          <div>
            <h2 id="day-settings-title">Réglages rapides</h2>
            <p>Modifiables sans toucher à l’identité du mariage.</p>
          </div>
        </div>
        {config ? (
          <div className="day-quick-settings" aria-busy={working === "settings"}>
            <fieldset>
              <legend>Minuteur par défaut</legend>
              <div className="day-choice-row">
                {TIMER_OPTIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    aria-pressed={config.default_shot_timer_seconds === seconds}
                    disabled={working === "settings"}
                    onClick={() => saveQuickSetting({ default_shot_timer_seconds: seconds })}
                  >
                    {seconds} s
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="day-toggle">
              <span>
                <strong>Flash écran</strong>
                <small>{config.screen_flash_enabled ? "Activé" : "Désactivé"}</small>
              </span>
              <input
                type="checkbox"
                checked={config.screen_flash_enabled}
                disabled={working === "settings"}
                onChange={(event) => saveQuickSetting({ screen_flash_enabled: event.target.checked })}
              />
            </label>
            <label className="day-copy-setting">
              <span>Copies par tirage</span>
              <select
                value={config.copies_per_print}
                disabled={working === "settings"}
                onChange={(event) => saveQuickSetting({ copies_per_print: Number(event.target.value) })}
              >
                {[1, 2, 3, 4].map((copies) => (
                  <option key={copies} value={copies}>{copies}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className="text-muted">Chargement des réglages…</p>
        )}
      </section>

      <section className="day-section" aria-labelledby="day-photos-title">
        <div className="day-section-heading">
          <div>
            <h2 id="day-photos-title">Dernières photos</h2>
            <p>Un contrôle rapide, sans suppression pendant la soirée.</p>
          </div>
          <button type="button" className="day-text-action" onClick={() => void loadPhotos()}>
            Actualiser
          </button>
        </div>
        {photos.length > 0 ? (
          <ul className="day-photo-strip">
            {photos.map((photo) => (
              <li key={photo.session_id}>
                <a href={photoViewUrl(photo.session_id)} target="_blank" rel="noreferrer">
                  <img
                    src={thumbnailUrl(photo.session_id)}
                    alt={`Photo prise à ${photoTime(photo.captured_at)}`}
                    loading="lazy"
                  />
                  <span>{photoTime(photo.captured_at)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="day-empty">Les premières photos apparaîtront ici.</p>
        )}
      </section>
    </div>
  );
}

function getReadiness(health: AdminHealth, error: string | null): Readiness {
  if (error) return { tone: "attention", title: "Connexion instable", detail: error };
  if (health.maintenance_active) {
    return {
      tone: "attention",
      title: "Maintenance en cours",
      detail: "Une personne intervient directement sur la borne.",
    };
  }
  if (!health.camera_ok) {
    return { tone: "attention", title: "Intervention nécessaire", detail: "La caméra n’est pas disponible." };
  }
  if (health.disk_free_bytes < 2 * 1024 ** 3) {
    return { tone: "attention", title: "Stockage à surveiller", detail: "Il reste moins de 2 Go disponibles." };
  }
  if (health.temperature_c !== null && health.temperature_c >= 80) {
    return { tone: "attention", title: "Borne trop chaude", detail: "Vérifiez que les aérations sont dégagées." };
  }
  if (health.session_state !== "idle") {
    return { tone: "busy", title: "Une session est en cours", detail: "La borne est utilisée par des invités." };
  }
  return { tone: "ready", title: "La borne est prête", detail: "Tout est disponible pour les invités." };
}

function printingNextAction(bac: number, stock: number, ink: number) {
  const first = Math.min(bac, stock, ink);
  if (first === stock) return stock === 0 ? "Stock papier épuisé" : "Le stock papier sera la prochaine limite";
  if (first === ink) return ink === 0 ? "Cassette d’encre à remplacer" : "La cassette d’encre sera à remplacer ensuite";
  return bac === 0 ? "Bac à recharger" : "Le bac sera à recharger ensuite";
}

function Fact({ icon, label, value, attention = false }: { icon: IconName; label: string; value: string; attention?: boolean }) {
  return (
    <div className={attention ? "day-fact day-fact-attention" : "day-fact"}>
      <StatusIcon name={icon} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Consumable({ label, remaining, capacity }: { label: string; remaining: number; capacity: number }) {
  return (
    <div className="day-consumable">
      <span>{label}</span>
      <strong>{remaining}</strong>
      <small>sur {capacity}</small>
      <div className="day-consumable-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, (remaining / capacity) * 100))}%` }} />
      </div>
    </div>
  );
}

function StateBadge({ state, maintenanceActive }: { state: AdminHealth["session_state"]; maintenanceActive: boolean }) {
  if (maintenanceActive) return <span className="day-state day-state-maintenance">Maintenance locale</span>;
  const labels: Record<AdminHealth["session_state"], string> = {
    idle: "Accueil",
    preview: "Cadrage",
    review: "Choix de la photo",
    printing: "Impression",
    done: "Terminée",
    error: "Erreur",
  };
  return <span className={`day-state day-state-${state}`}>{labels[state]}</span>;
}

type IconName = "check" | "attention" | "camera" | "storage" | "temperature" | "wifi" | "pulse";

function StatusIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    check: <path d="m5 12 4 4L19 6" />,
    attention: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    camera: <><path d="M4 7h3l1.5-2h7L17 7h3v11H4V7Z" /><circle cx="12" cy="12.5" r="3.5" /></>,
    storage: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    temperature: <><path d="M10 14.8V5a2 2 0 1 1 4 0v9.8a4 4 0 1 1-4 0Z" /><path d="M12 8v9" /></>,
    wifi: <><path d="M3 9a14 14 0 0 1 18 0" /><path d="M6.5 12.5a9 9 0 0 1 11 0" /><path d="M10 16a4 4 0 0 1 4 0" /><path d="M12 20h.01" /></>,
    pulse: <><path d="M3 12h4l2-5 4 10 2-5h6" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
const photoTime = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
