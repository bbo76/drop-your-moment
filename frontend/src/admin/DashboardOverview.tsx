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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, CircleAlert } from "lucide-react";

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
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-start justify-between gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Vue d’ensemble</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">Surveillez la borne, l’événement actif et les dernières prises.</p>
        </div>
        <Badge variant="secondary" className="hidden tabular-nums sm:inline-flex">Mise à jour {updatedAt ? time(updatedAt) : "en cours"}</Badge>
      </header>

      <Card className={`gap-0 overflow-hidden py-0 ring-1 ${toneRing[status.tone]}`} aria-live="polite">
        <CardContent className="grid p-0 lg:grid-cols-[minmax(20rem,1.4fr)_repeat(3,minmax(8rem,.6fr))]">
          <div className={`flex items-center gap-4 p-5 md:p-6 ${toneSurface[status.tone]}`}>
            <span className={`grid size-11 shrink-0 place-items-center rounded-full bg-background ${toneText[status.tone]}`}><StatusGlyph tone={status.tone} /></span>
            <div><h2 className="text-xl font-semibold tracking-tight md:text-2xl">{status.title}</h2><p className="mt-1 text-sm text-muted-foreground">{status.detail}</p></div>
          </div>
          <StatusFact label="Écran" value={sessionLabel(health)} />
          <StatusFact label="Caméra" value={health?.camera_ok ? "Prête" : "À vérifier"} />
          <StatusFact label="Tirages disponibles" value={printable === null ? "—" : `${printable}`} />
        </CardContent>
      </Card>

      {error && <Feedback error={error} />}

      <div className="grid gap-6 lg:grid-cols-12">
        <OverviewPanel title="Événement actif" className="lg:col-span-5">
          {config ? (
            <dl className="px-6">
              <SummaryRow label="Événement" value={config.event_name} strong />
              <SummaryRow label="Overlay" value={config.overlay_file ? "Présent" : "Aucun"} />
              <SummaryRow label="Filtres" value={config.available_filters.map((filter) => FILTER_LABELS[filter]).join(" · ")} />
              <SummaryRow
                label="Format"
                value={
                  <span className="grid gap-0.5">
                    <span>{config.print_format.name}</span>
                    <small>{config.copies_per_print} copie{config.copies_per_print > 1 ? "s" : ""}</small>
                  </span>
                }
              />
              <SummaryRow label="Minuteur" value={`${config.default_shot_timer_seconds} secondes`} />
            </dl>
          ) : <div className="grid min-h-48 gap-3 p-6"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
        </OverviewPanel>

        <OverviewPanel title="Dernières photos" className="lg:col-span-4" meta={gallery ? `${gallery.total} photo${gallery.total > 1 ? "s" : ""}` : undefined}>
          {gallery?.entries.length ? (
            <ul className="grid grid-cols-2 gap-3 p-6">
              {gallery.entries.map((entry) => (
                <li key={entry.session_id}>
                  <img className="aspect-[3/2] w-full rounded-lg bg-muted object-cover ring-1 ring-border" src={thumbnailUrl(entry.session_id)} alt={`Photo prise à ${photoTime(entry.captured_at)}`} loading="lazy" />
                  <span className="mt-1.5 block text-xs tabular-nums text-muted-foreground">{photoTime(entry.captured_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="grid min-h-48 place-items-center p-8 text-center text-muted-foreground">Les premières photos apparaîtront ici.</p>}
        </OverviewPanel>

        <OverviewPanel title="Santé du système" className="lg:col-span-3">
          {health ? (
            <dl className="px-6">
              <SummaryRow label="Caméra" value={health.camera_ok ? "Prête" : "Absente"} attention={!health.camera_ok} />
              <SummaryRow label="Stockage libre" value={gigabytes(health.disk_free_bytes)} attention={health.disk_free_bytes < 2 * 1024 ** 3} />
              <SummaryRow label="Température" value={health.temperature_c === null ? "Non mesurée" : `${health.temperature_c.toFixed(0)} °C`} attention={health.temperature_c !== null && health.temperature_c >= 80} />
            </dl>
          ) : <p className="grid min-h-48 place-items-center p-8 text-center text-muted-foreground">Lecture de l’état de la borne…</p>}
        </OverviewPanel>
      </div>
    </div>
  );
}

function OverviewPanel({ title, meta, className, children }: { title: string; meta?: string; className?: string; children: ReactNode }) {
  return <Card className={`min-w-0 gap-0 py-0 ${className ?? ""}`}><CardHeader className="min-h-16 border-b px-6 py-4"><div className="flex w-full items-baseline justify-between gap-4"><CardTitle className="text-base font-semibold">{title}</CardTitle>{meta && <span className="text-sm text-muted-foreground">{meta}</span>}</div></CardHeader><CardContent className="px-0">{children}</CardContent></Card>;
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return <div className="grid min-h-20 content-center border-t px-5 py-4 lg:min-h-24 lg:border-l lg:border-t-0"><span className="text-xs font-medium text-muted-foreground">{label}</span><strong className="mt-1 text-lg font-semibold tabular-nums">{value}</strong></div>;
}

function SummaryRow({ label, value, strong = false, attention = false }: { label: string; value: ReactNode; strong?: boolean; attention?: boolean }) {
  return <div className="grid grid-cols-[minmax(6.5rem,.8fr)_minmax(0,1.2fr)] gap-4 border-b py-4 last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className={`min-w-0 text-right tabular-nums ${strong ? "font-semibold" : ""} ${attention ? "font-semibold text-destructive" : ""}`}>{value}</dd></div>;
}

function StatusGlyph({ tone }: { tone: "ready" | "busy" | "attention" }) {
  const Icon = tone === "ready" ? Check : CircleAlert;
  return <Icon className="size-6" aria-hidden="true" strokeWidth={3} />;
}

const toneText = { ready: "text-emerald-700", busy: "text-amber-700", attention: "text-destructive" } as const;
const toneSurface = { ready: "bg-emerald-50", busy: "bg-amber-50", attention: "bg-destructive/5" } as const;
const toneRing = { ready: "ring-emerald-600/20", busy: "ring-amber-600/20", attention: "ring-destructive/20" } as const;

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
