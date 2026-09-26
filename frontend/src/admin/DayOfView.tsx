import { useCallback, useEffect, useState } from "react";
import { Activity, Camera, Check, Database, Pause, PlugZap, Printer, RotateCcw, SlidersHorizontal, Thermometer, TriangleAlert, Wifi, Zap } from "lucide-react";

import { Button as ShadButton } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";

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
import { PowerControls } from "./PowerControls";
import { canReleaseKiosk, releaseKioskCopy } from "./kioskRelease";

const POLL_INTERVAL_MS = 2_000;
const RECENT_PHOTO_COUNT = 3;
const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];
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
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const loadPhotos = useCallback(async () => {
    const page = await api.gallery(0, RECENT_PHOTO_COUNT);
    setPhotos(page.entries);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
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
  }, [loadPhotos, refreshNonce]);

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

  const releaseKiosk = () => {
    setReleaseDialogOpen(false);
    void run(
      "release",
      async () => {
        await api.releaseKiosk();
        setHealth(await api.health());
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
      <div className="grid min-h-28 grid-cols-[3rem_minmax(0,1fr)] items-center gap-4 rounded-xl border border-destructive/40 bg-card p-5 text-destructive [&_svg]:size-12 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-none [&_p]:mt-2" role="status">
        <StatusIcon name={error ? "wifi" : "pulse"} />
        <div>
          <h1>{error ? "Borne injoignable" : "Connexion à la borne…"}</h1>
          <p>{error ?? "Lecture de l’état en cours."}</p>
          {error && (
            <ShadButton className="mt-4 min-h-11" variant="outline" onClick={() => setRefreshNonce((value) => value + 1)}>
              <RotateCcw aria-hidden="true" /> Réessayer
            </ShadButton>
          )}
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
  const releaseCopy = releaseKioskCopy(health);

  return (
    <div className="grid gap-4">
      <section className={`grid min-h-28 grid-cols-[3rem_minmax(0,1fr)] items-center gap-4 rounded-xl border bg-card p-5 [&_svg]:size-12 [&_h1]:text-[clamp(2rem,8vw,3rem)] [&_h1]:font-bold [&_h1]:leading-none [&_h1]:tracking-[-0.035em] [&_p]:mt-2 [&_p]:leading-tight ${statusTone[readiness.tone]}`} aria-live="polite">
        <StatusIcon name={readiness.tone === "ready" ? "check" : "attention"} />
        <div className="min-w-0">
          <h1>{readiness.title}</h1>
          <p>{readiness.detail}</p>
          <p className="mt-3 border-t pt-3 font-semibold text-foreground">{health.event_name}</p>
        </div>
      </section>

      {(error || notice) && <div className="grid gap-2"><Feedback error={error} notice={notice} />{error && <ShadButton className="min-h-11 justify-self-start" variant="outline" onClick={() => setRefreshNonce((value) => value + 1)}><RotateCcw aria-hidden="true" /> Réessayer</ShadButton>}</div>}

      <section className="grid grid-cols-3 overflow-hidden rounded-xl border bg-card divide-x" aria-label="État essentiel de la borne">
        <Fact
          icon="pulse"
          label="Écran"
          value={health.maintenance_active ? "Maintenance" : stateLabel(health.session_state)}
          attention={health.maintenance_active || health.session_state === "error"}
        />
        <Fact
          icon="camera"
          label="Caméra"
          value={health.camera_ok ? "Prête" : "Absente"}
          attention={!health.camera_ok}
        />
        <Fact
          icon="printer"
          label="Tirages"
          value={`${printableNow} possibles`}
          attention={printableNow <= 5}
        />
        {canReleaseKiosk(health) && (
          <div className="col-span-full border-t p-3 [&>button]:w-full">
            <Button
              tone="warning"
              onClick={() => {
                setReleaseDialogOpen(true);
              }}
              disabled={working === "release"}
            >
              {working === "release" ? "Retour en cours…" : releaseCopy.button}
            </Button>
          </div>
        )}
      </section>

      <Accordion type="single" collapsible className="rounded-xl border bg-card">
        <AccordionItem value="diagnostic" className="border-0">
          <AccordionTrigger className="min-h-18 px-4 py-3 hover:no-underline">
            <span className="grid text-left"><strong className="text-lg">Diagnostic</strong><small className={`mt-0.5 flex items-center gap-1.5 ${powerNeedsAttention(health) ? "font-semibold text-destructive" : "text-muted-foreground"}`}><PlugZap className="size-4 flex-none" aria-hidden="true" />{diagnosticSummary(health)}</small></span>
          </AccordionTrigger>
          <AccordionContent className="border-t p-4">
            <dl className="divide-y">
              <DiagnosticRow label="Alimentation" value={powerLabel(health)} attention={powerNeedsAttention(health)} />
              <DiagnosticRow label="Température" value={health.temperature_c === null ? "Indisponible" : `${Math.round(health.temperature_c)} °C`} attention={health.temperature_c !== null && health.temperature_c >= 80} />
              <DiagnosticRow label="Stockage libre" value={`${(health.disk_free_bytes / 1024 ** 3).toFixed(1).replace(".", ",")} Go`} attention={health.disk_free_bytes < 2 * 1024 ** 3} />
            </dl>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DiagnosticMeter label="Processeur" value={health.cpu_percent} />
              <DiagnosticMeter label="Mémoire" value={health.memory_percent} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Accordion type="single" collapsible className="rounded-xl border bg-card">
        <AccordionItem value="quick-settings" className="border-0">
          <AccordionTrigger className="min-h-18 px-4 py-3 hover:no-underline">
            <span className="grid text-left">
              <strong className="flex items-center gap-2 text-lg"><SlidersHorizontal className="size-5" aria-hidden="true" />Réglages rapides</strong>
              <small className="text-muted-foreground">Minuteur, flash et copies</small>
            </span>
          </AccordionTrigger>
          <AccordionContent className="grid gap-4 border-t p-4">
            {config ? (
              <>
                <fieldset disabled={working === "settings"}>
                  <legend className="mb-2 font-medium">Minuteur</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {SHOT_TIMER_OPTIONS.map((seconds) => (
                      <ShadButton key={seconds} type="button" variant={config.default_shot_timer_seconds === seconds ? "default" : "outline"} className="min-h-11" aria-pressed={config.default_shot_timer_seconds === seconds} onClick={() => saveQuickSetting({ default_shot_timer_seconds: seconds })}>
                        {seconds} s
                      </ShadButton>
                    ))}
                  </div>
                </fieldset>
                <button type="button" disabled={working === "settings"} aria-pressed={config.screen_flash_enabled} onClick={() => saveQuickSetting({ screen_flash_enabled: !config.screen_flash_enabled })} className="flex min-h-14 items-center gap-3 rounded-lg border px-4 text-left disabled:opacity-50 aria-pressed:bg-muted">
                  <Zap className="size-5" fill={config.screen_flash_enabled ? "currentColor" : "none"} aria-hidden="true" />
                  <span className="grid"><strong>Flash d’appoint</strong><small className="text-muted-foreground">{config.screen_flash_enabled ? "Activé" : "Désactivé"}</small></span>
                </button>
                <label className="grid gap-2 font-medium">
                  Copies par défaut
                  <select disabled={working === "settings"} value={config.copies_per_print} onChange={(event) => saveQuickSetting({ copies_per_print: Number(event.target.value) })} className="min-h-11 rounded-md border bg-background px-3 font-normal">
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((copies) => <option key={copies} value={copies}>{copies}</option>)}
                  </select>
                </label>
              </>
            ) : <Skeleton className="h-40 rounded-lg" />}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Accordion type="single" collapsible className="rounded-xl border bg-card">
        <AccordionItem value="power" className="border-0">
          <AccordionTrigger className="min-h-18 px-4 py-3 hover:no-underline">
            <span className="grid text-left">
              <strong className="text-lg">Alimentation</strong>
              <small className={health.session_state === "printing" ? "font-semibold text-amber-800" : "text-muted-foreground"}>
                {health.session_state === "printing" ? "Verrouillée pendant l’impression" : "Redémarrer ou éteindre la borne"}
              </small>
            </span>
          </AccordionTrigger>
          <AccordionContent className="border-t p-4">
            <PowerControls
              health={health}
              onScheduled={(power_transition) => setHealth((current) => current && ({ ...current, power_transition }))}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Accordion type="single" collapsible defaultValue="printing" className="rounded-xl border bg-card">
        <AccordionItem value="printing" className="border-0">
          <AccordionTrigger className="min-h-18 px-4 py-3 hover:no-underline">
            <span className="grid"><strong className="text-lg">Impression</strong><small className="text-muted-foreground">{nextAction}</small></span>
            <b className="ml-auto mr-3 text-3xl tabular-nums">{printableNow}</b>
          </AccordionTrigger>
          <AccordionContent className="border-t p-4">
        <div className="mb-3 grid grid-cols-[auto_1fr] items-baseline gap-x-3 [&_strong]:row-span-2 [&_strong]:text-5xl [&_strong]:leading-none [&_strong]:tabular-nums [&_span]:font-bold [&_small]:text-muted-foreground">
          <strong>{printableNow}</strong>
          <span>impression{printableNow > 1 ? "s" : ""} avant intervention</span>
          <small>{nextAction}</small>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Consumable label="Bac" remaining={cassetteRemaining} capacity={health.counters.cassette_capacity} />
          <Consumable label="Encre" remaining={inkRemaining} capacity={health.counters.cartridge_capacity} />
          <Consumable label="Stock total" remaining={stockRemaining} capacity={health.counters.paper_stock_capacity} />
        </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {config ? (
        <button
          type="button"
          aria-pressed={config.capture_paused}
          disabled={working === "settings"}
          onClick={() => saveQuickSetting({ capture_paused: !config.capture_paused })}
          className="flex min-h-18 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors disabled:opacity-50 aria-pressed:border-amber-600 aria-pressed:bg-amber-50 aria-pressed:text-amber-950"
        >
          <Pause className="size-6 flex-none" fill={config.capture_paused ? "currentColor" : "none"} aria-hidden="true" />
          <span className="grid">
            <strong className="text-lg">Mode pause</strong>
            <small className={config.capture_paused ? "text-amber-800" : "text-muted-foreground"}>
              {config.capture_paused ? "Activé — les nouvelles prises sont bloquées" : "Désactivé — la borne est disponible"}
            </small>
          </span>
        </button>
      ) : (
        <Skeleton className="h-18 rounded-xl" />
      )}

      <section className="rounded-xl border bg-card p-4" aria-labelledby="day-photos-title">
        <div className="mb-4 flex items-start justify-between gap-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:mt-1 [&_p]:text-muted-foreground">
          <div>
            <h2 id="day-photos-title">Dernières photos</h2>
            <p>Un contrôle rapide, sans suppression pendant la soirée.</p>
          </div>
          <ShadButton type="button" variant="ghost" onClick={() => void loadPhotos()}>
            Actualiser
          </ShadButton>
        </div>
        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 [&_img]:aspect-[3/2] [&_img]:w-full [&_img]:rounded-lg [&_img]:object-cover [&_span]:mt-1 [&_span]:block [&_span]:text-sm [&_span]:tabular-nums [&_span]:text-muted-foreground">
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
          <p className="py-4 text-muted-foreground">Les premières photos apparaîtront ici.</p>
        )}
      </section>

      <AlertDialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{releaseCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{releaseCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={releaseKiosk}>{releaseCopy.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getReadiness(health: AdminHealth, error: string | null): Readiness {
  if (error) return { tone: "attention", title: "Connexion instable", detail: error };
  if (health.power_transition) {
    return {
      tone: "attention",
      title: health.power_transition.action === "reboot" ? "Redémarrage programmé" : "Arrêt programmé",
      detail: "Le kiosk affiche un compte à rebours de 30 secondes.",
    };
  }
  if (health.maintenance_active) {
    return {
      tone: "attention",
      title: "Maintenance en cours",
      detail: "Une personne intervient directement sur la borne.",
    };
  }
  if (health.capture_paused) {
    return { tone: "busy", title: "Prises en pause", detail: "La borne reste disponible, mais aucune nouvelle session ne peut commencer." };
  }
  if (!health.camera_ok) {
    return { tone: "attention", title: "Intervention nécessaire", detail: "La caméra n’est pas disponible." };
  }
  if (health.undervoltage_now || health.undervoltage_occurred) {
    return { tone: "attention", title: "Alimentation à vérifier", detail: "Vérifiez le bloc secteur et le câble USB-C de la borne." };
  }
  if (health.throttled_now || health.throttled_occurred) {
    return { tone: "attention", title: "Performances limitées", detail: "Vérifiez l’alimentation et les aérations de la borne." };
  }
  if (health.disk_free_bytes < 2 * 1024 ** 3) {
    return { tone: "attention", title: "Stockage à surveiller", detail: "Il reste moins de 2 Go disponibles." };
  }
  if (health.temperature_c !== null && health.temperature_c >= 80) {
    return { tone: "attention", title: "Borne trop chaude", detail: "Vérifiez que les aérations sont dégagées." };
  }
  if (health.session_state === "printing") {
    return { tone: "busy", title: "Impression en cours", detail: "Les commandes d’alimentation sont verrouillées jusqu’à la fin du tirage." };
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
    <div className={`grid min-w-0 grid-cols-[1.5rem_1fr] items-center gap-x-2 p-3 [&_svg]:size-6 [&>span]:text-xs [&>span]:text-muted-foreground [&>strong]:col-start-2 [&>strong]:whitespace-normal [&>strong]:leading-tight [&>strong]:text-sm [&>strong]:tabular-nums sm:[&>strong]:text-base ${attention ? "text-destructive" : ""}`}>
      <StatusIcon name={icon} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Consumable({ label, remaining, capacity }: { label: string; remaining: number; capacity: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-2 rounded-lg border p-4 [&>span]:text-muted-foreground [&>strong]:text-3xl [&>strong]:leading-none [&>strong]:tabular-nums [&>small]:text-muted-foreground">
      <span>{label}</span>
      <strong>{remaining}</strong>
      <small>sur {capacity}</small>
      <Progress
        value={capacity > 0 ? Math.min(100, Math.max(0, (remaining / capacity) * 100)) : 0}
        aria-label={`${label} : ${remaining} sur ${capacity}`}
        className="col-span-full mt-2 h-1.5"
      />
    </div>
  );
}

function DiagnosticRow({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return <div className="flex min-h-12 items-center justify-between gap-4 py-2"><dt className="text-muted-foreground">{label}</dt><dd className={`text-right font-semibold tabular-nums ${attention ? "text-destructive" : ""}`}>{value}</dd></div>;
}

function DiagnosticMeter({ label, value }: { label: string; value: number }) {
  const percent = Math.min(100, Math.max(0, value));
  return <div className="rounded-lg border p-3"><div className="flex items-baseline justify-between gap-4"><span className="text-muted-foreground">{label}</span><strong className={percent >= 85 ? "text-destructive" : ""}>{Math.round(percent)} %</strong></div><Progress value={percent} aria-label={`${label} : ${Math.round(percent)} %`} className="mt-2 h-1.5" /></div>;
}

const STATE_LABELS: Record<AdminHealth["session_state"], string> = {
  idle: "Accueil",
  preview: "Cadrage",
  review: "Choix photo",
  printing: "Impression",
  done: "Fin de session",
  error: "Erreur",
};

const stateLabel = (state: AdminHealth["session_state"]) => STATE_LABELS[state];

const powerNeedsAttention = (health: AdminHealth) => health.undervoltage_now === true || health.undervoltage_occurred === true || health.throttled_now === true || health.throttled_occurred === true;
const powerLabel = (health: AdminHealth) => health.undervoltage_now ? "Sous-tension active" : health.undervoltage_occurred ? "Sous-tension détectée" : health.throttled_now ? "Performances limitées" : health.throttled_occurred ? "Limitation détectée" : health.undervoltage_now === null ? "Indisponible" : "Stable";
const diagnosticSummary = (health: AdminHealth) => `${powerLabel(health)} · CPU ${Math.round(health.cpu_percent)} % · RAM ${Math.round(health.memory_percent)} %`;

type IconName = "check" | "attention" | "camera" | "storage" | "temperature" | "printer" | "wifi" | "pulse";

function StatusIcon({ name }: { name: IconName }) {
  const Icon = { check: Check, attention: TriangleAlert, camera: Camera, storage: Database, temperature: Thermometer, printer: Printer, wifi: Wifi, pulse: Activity }[name];
  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

const photoTime = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const statusTone = {
  ready: "border-emerald-600/40 text-emerald-700",
  busy: "border-amber-600/40 text-amber-700",
  attention: "border-destructive/40 text-destructive",
} as const;
