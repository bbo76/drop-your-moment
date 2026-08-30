import { useCallback, useEffect, useState } from "react";
import { Activity, Camera, Check, Database, Printer, Thermometer, TriangleAlert, Wifi } from "lucide-react";

import { Button as ShadButton } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

const POLL_INTERVAL_MS = 2_000;
const RECENT_PHOTO_COUNT = 3;
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
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);

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

  const releaseKiosk = () => {
    setReleaseDialogOpen(false);
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
      <div className="grid min-h-28 grid-cols-[3rem_minmax(0,1fr)] items-center gap-4 rounded-xl border border-destructive/40 bg-card p-5 text-destructive [&_svg]:size-12 [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:leading-none [&_p]:mt-2" role="status">
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
    <div className="grid gap-4">
      <section className={`grid min-h-28 grid-cols-[3rem_minmax(0,1fr)] items-center gap-4 rounded-xl border bg-card p-5 [&_svg]:size-12 [&_h2]:text-[clamp(2rem,8vw,3rem)] [&_h2]:font-bold [&_h2]:leading-none [&_h2]:tracking-[-0.035em] [&_p]:mt-2 [&_p]:leading-tight ${statusTone[readiness.tone]}`} aria-live="polite">
        <StatusIcon name={readiness.tone === "ready" ? "check" : "attention"} />
        <div className="min-w-0">
          <h2>{readiness.title}</h2>
          <p>{readiness.detail}</p>
          <p className="mt-3 border-t pt-3 font-semibold text-foreground">{health.event_name}</p>
        </div>
      </section>

      {(error || notice) && <Feedback error={error} notice={notice} />}

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
        {health.session_state !== "idle" && (
          <Button
            tone="warning"
            onClick={() => {
              setReleaseDialogOpen(true);
            }}
            disabled={working === "release"}
          >
            {working === "release" ? "Retour en cours…" : "Ramener la borne à l’accueil"}
          </Button>
        )}
      </section>

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

      <Accordion type="single" collapsible className="rounded-xl border bg-card">
        <AccordionItem value="settings" className="border-0">
          <AccordionTrigger className="min-h-18 px-4 py-3 hover:no-underline">
            <span className="grid"><strong className="text-lg">Réglages rapides</strong><small className="text-muted-foreground">Minuteur, flash et copies</small></span>
          </AccordionTrigger>
          <AccordionContent className="border-t p-4">
        {config ? (
          <div className="grid items-end gap-4 sm:grid-cols-3" aria-busy={working === "settings"}>
            <fieldset>
              <legend>Minuteur par défaut</legend>
              <ToggleGroup
                type="single"
                value={String(config.default_shot_timer_seconds)}
                onValueChange={(value) => value && saveQuickSetting({ default_shot_timer_seconds: Number(value) as ShotTimerSeconds })}
                variant="outline"
                spacing={0}
                className="grid w-full grid-cols-3"
              >
                {TIMER_OPTIONS.map((seconds) => (
                  <ToggleGroupItem
                    key={seconds}
                    value={String(seconds)}
                    disabled={working === "settings"}
                    className="min-h-11 font-bold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {seconds} s
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </fieldset>
            <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border px-3 py-2 [&_small]:block [&_small]:text-muted-foreground">
              <span>
                <strong>Flash écran</strong>
                <small>{config.screen_flash_enabled ? "Activé" : "Désactivé"}</small>
              </span>
              <Switch
                aria-label="Flash écran"
                checked={config.screen_flash_enabled}
                disabled={working === "settings"}
                onCheckedChange={(checked) => saveQuickSetting({ screen_flash_enabled: checked })}
              />
            </div>
            <label className="grid gap-2 text-sm text-muted-foreground">
              <span>Copies par tirage</span>
              <Select
                value={String(config.copies_per_print)}
                disabled={working === "settings"}
                onValueChange={(value) => saveQuickSetting({ copies_per_print: Number(value) })}
              >
                <SelectTrigger className="min-h-14"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((copies) => (
                    <SelectItem key={copies} value={String(copies)}>{copies}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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
            <AlertDialogTitle>Ramener la borne à l’accueil ?</AlertDialogTitle>
            <AlertDialogDescription>La session en cours sera interrompue. Les invités devront recommencer leur parcours.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={releaseKiosk}>Ramener à l’accueil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

const STATE_LABELS: Record<AdminHealth["session_state"], string> = {
  idle: "Accueil",
  preview: "Cadrage",
  review: "Choix photo",
  printing: "Impression",
  done: "Fin de session",
  error: "Erreur",
};

const stateLabel = (state: AdminHealth["session_state"]) => STATE_LABELS[state];

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
