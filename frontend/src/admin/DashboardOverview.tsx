import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  api,
  FILTER_LABELS,
  thumbnailUrl,
  type AdminHealth,
  type EventConfigPayload,
  type GalleryPage,
} from "../shared/api";
import { Feedback } from "./ui";

const POLL_INTERVAL_MS = 2_000;

export function DashboardOverview() {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [config, setConfig] = useState<EventConfigPayload | null>(null);
  const [gallery, setGallery] = useState<GalleryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadSupportingData = useCallback(async () => {
    setConfig(await api.eventConfig());
  }, []);

  useEffect(() => {
    void loadSupportingData().catch((cause) => setError(String(cause)));
  }, [loadSupportingData]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      try {
        const [fresh, freshGallery] = await Promise.all([api.health(), api.gallery(0, 4)]);
        if (!cancelled) {
          setHealth(fresh);
          setGallery(freshGallery);
          setUpdatedAt(new Date());
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(`Connexion à la borne perdue : ${String(cause)}`);
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const status = readiness(health, error);
  const printable = health ? printableCount(health) : null;

  return (
    <div className="admin-overview">
      <header className="admin-page-heading">
        <div>
          <h1>Vue d’ensemble</h1>
          <p>Une borne, son événement actuel et ce qui demande votre attention.</p>
        </div>
      </header>

      <section className={`admin-readiness admin-readiness-${status.tone}`} aria-live="polite">
        <StatusGlyph tone={status.tone} />
        <div className="admin-readiness-copy">
          <h2>{status.title}</h2>
          <p>{status.detail}</p>
        </div>
        <StatusFact label="Écran" value={sessionLabel(health)} />
        <StatusFact label="Caméra" value={health?.camera_ok ? "Prête" : "À vérifier"} />
        <StatusFact label="Impressions" value={printable === null ? "—" : `${printable} possibles`} />
        <StatusFact label="Mise à jour" value={updatedAt ? time(updatedAt) : "Connexion…"} />
      </section>

      {error && <Feedback error={error} />}

      <div className="admin-overview-grid">
        <OverviewPanel title="Événement">
          {config ? (
            <dl className="admin-summary-list">
              <SummaryRow label="Événement" value={config.event_name} strong />
              <SummaryRow label="Overlay" value={config.overlay_file ? "Présent" : "Aucun"} />
              <SummaryRow label="Filtres" value={config.available_filters.map((filter) => FILTER_LABELS[filter]).join(" · ")} />
              <SummaryRow
                label="Format"
                value={
                  <span className="admin-stacked-value">
                    <span>{config.print_format.name}</span>
                    <small>{config.copies_per_print} copie{config.copies_per_print > 1 ? "s" : ""}</small>
                  </span>
                }
              />
              <SummaryRow label="Minuteur" value={`${config.default_shot_timer_seconds} secondes`} />
            </dl>
          ) : <p className="admin-panel-empty">Chargement de la configuration…</p>}
        </OverviewPanel>

        <OverviewPanel title="Galerie" meta={gallery ? `${gallery.total} photo${gallery.total > 1 ? "s" : ""}` : undefined}>
          {gallery?.entries.length ? (
            <ul className="admin-recent-photos">
              {gallery.entries.map((entry) => (
                <li key={entry.session_id}>
                  <img src={thumbnailUrl(entry.session_id)} alt={`Photo prise à ${photoTime(entry.captured_at)}`} loading="lazy" />
                  <span>{photoTime(entry.captured_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="admin-panel-empty">Les premières photos apparaîtront ici.</p>}
        </OverviewPanel>

        <OverviewPanel title="Diagnostic">
          {health ? (
            <dl className="admin-summary-list">
              <SummaryRow label="Caméra" value={health.camera_ok ? "Prête" : "Absente"} attention={!health.camera_ok} />
              <SummaryRow label="Stockage libre" value={gigabytes(health.disk_free_bytes)} attention={health.disk_free_bytes < 2 * 1024 ** 3} />
              <SummaryRow label="Température" value={health.temperature_c === null ? "Non mesurée" : `${health.temperature_c.toFixed(0)} °C`} attention={health.temperature_c !== null && health.temperature_c >= 80} />
            </dl>
          ) : <p className="admin-panel-empty">Lecture de l’état de la borne…</p>}
        </OverviewPanel>
      </div>
    </div>
  );
}

function OverviewPanel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return <section className="admin-overview-panel"><header><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div></header>{children}</section>;
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return <div className="admin-status-fact"><span>{label}</span><strong>{value}</strong></div>;
}

function SummaryRow({ label, value, strong = false, attention = false }: { label: string; value: ReactNode; strong?: boolean; attention?: boolean }) {
  return <div className={attention ? "admin-summary-row admin-summary-attention" : "admin-summary-row"}><dt>{label}</dt><dd className={strong ? "admin-summary-strong" : undefined}>{value}</dd></div>;
}

function StatusGlyph({ tone }: { tone: "ready" | "busy" | "attention" }) {
  return <svg className="admin-status-glyph" viewBox="0 0 48 48" aria-hidden="true">{tone === "ready" ? <path d="m14 24 7 7 14-16" /> : <><circle cx="24" cy="24" r="16" /><path d="M24 14v12m0 7h.01" /></>}</svg>;
}

function readiness(health: AdminHealth | null, error: string | null) {
  if (error) return { tone: "attention" as const, title: "Borne injoignable", detail: "Vérifiez que cet ordinateur est toujours connecté au réseau de la borne." };
  if (!health) return { tone: "busy" as const, title: "Connexion à la borne…", detail: "Lecture de son état en cours." };
  if (health.maintenance_active) return { tone: "attention" as const, title: "Maintenance en cours", detail: "Une personne intervient directement sur la borne." };
  if (!health.camera_ok) return { tone: "attention" as const, title: "Intervention nécessaire", detail: "La caméra n’est pas disponible." };
  if (health.session_state !== "idle") return { tone: "busy" as const, title: "Une session est en cours", detail: "La borne est utilisée par des invités." };
  return { tone: "ready" as const, title: "La borne est prête", detail: "Tout est disponible pour les invités." };
}

function printableCount(health: AdminHealth) {
  const { counters } = health;
  return Math.max(0, Math.min(counters.paper_stock_capacity - counters.prints_since_stock_set, counters.cassette_capacity - counters.prints_since_cassette_reload, counters.cartridge_capacity - counters.prints_since_reset));
}

const SESSION_LABELS: Record<AdminHealth["session_state"], string> = { idle: "Accueil", preview: "Cadrage", review: "Choix photo", printing: "Impression", done: "Fin de session", error: "Erreur" };
const sessionLabel = (health: AdminHealth | null) => health ? (health.maintenance_active ? "Maintenance" : SESSION_LABELS[health.session_state]) : "—";
const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} Go`;
const time = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const photoTime = (epoch: number) => time(new Date(epoch * 1000));
