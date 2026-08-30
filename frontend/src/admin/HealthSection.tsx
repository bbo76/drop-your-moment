import { useEffect, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { api, type AdminHealth, type CameraScan } from "../shared/api";
import { Button, Row, Section } from "./ui";

/* Tableau de bord : « est-ce que la borne va tenir la soirée ? »
 *
 * Tout est en lecture, sauf le stock papier et le bac. Sondé en boucle,
 * parce que c'est la page qu'on laisse ouverte pendant un événement. */

const POLL_INTERVAL_MS = 2000;
export function HealthSection() {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<CameraScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const fresh = await api.health();
        if (cancelled) return;
        setHealth(fresh);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(String(cause));
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

  /* Jamais au chargement, jamais en boucle : le sondage ouvre chaque périphérique tour à
     tour, et le capteur n'accepte qu'un propriétaire. Uniquement sur ce clic. */
  const scanCameras = async () => {
    setScanning(true);
    try {
      setScan(await api.scanCameras());
    } catch (cause) {
      setError(String(cause));
    } finally {
      setScanning(false);
    }
  };

  const releaseKiosk = async () => {
    setReleaseDialogOpen(false);
    setReleasing(true);
    try {
      const session = await api.releaseKiosk();
      setHealth((current) => (current ? { ...current, session_state: session.state } : current));
      setError(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setReleasing(false);
    }
  };

  if (error && !health) {
    return (
      <Section title="État du système">
        <p className="text-destructive">Backend injoignable : {error}</p>
      </Section>
    );
  }
  if (!health) {
    return (
      <Section title="État du système">
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </Section>
    );
  }

  const { counters } = health;
  const paperRemaining = Math.max(0, counters.paper_stock_capacity - counters.prints_since_stock_set);
  const trayRemaining = Math.max(0, counters.cassette_capacity - counters.prints_since_cassette_reload);
  const inkRemaining = Math.max(0, counters.cartridge_capacity - counters.prints_since_reset);
  const printableNow = Math.min(paperRemaining, trayRemaining, inkRemaining);

  return (
    <Section title="État du système">
      {error && <p className="mb-4 text-destructive">Backend injoignable : {error}</p>}
      {health.maintenance_active && (
        <Alert variant="destructive" className="mb-6 p-4" role="status" aria-live="polite">
          <svg className="h-12 w-12 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L5 16l3 3 7.3-7.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2Z" />
          </svg>
          <AlertTitle className="text-xl leading-tight">Maintenance locale en cours</AlertTitle>
          <AlertDescription>Une personne a déverrouillé l’écran de la borne et intervient sur place.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Group
          title="Caméra"
          icon="camera"
          value={health.camera_ok ? "Prête" : "Absente"}
          tone={health.camera_ok ? "ready" : "attention"}
        >
          <Row label="Pilote" value={health.camera_driver} />
          <Row
            label="Aperçu"
            value={
              health.preview_streams > 0
                ? `vivant — ${health.preview_streams} flux`
                : "aucun flux consommé"
            }
          />
          <Row label="Résolution aperçu" value={size(health.preview_size)} />
          <Row label="Résolution capture" value={size(health.still_size)} />
          <CardAction onClick={() => void scanCameras()} disabled={scanning}>
            {scanning ? "Détection…" : "Détecter les caméras"}
          </CardAction>
        </Group>

        <Group
          title="Impression"
          icon="printer"
          value={`${printableNow} possibles`}
          tone={printableNow <= 5 ? "warning" : "neutral"}
        >
          <Row label="Cumul de l'événement" value={`${counters.prints_total}`} />
          <Meter label="Papier" value={paperRemaining} capacity={counters.paper_stock_capacity} />
          <Meter label="Bac CP1500" value={trayRemaining} capacity={counters.cassette_capacity} />
          <Meter label="Encre" value={inkRemaining} capacity={counters.cartridge_capacity} />
        </Group>

        <Group
          title="Parcours"
          icon="session"
          value={health.maintenance_active ? "Maintenance" : sessionLabel(health.session_state)}
          tone={health.maintenance_active || health.session_state === "error" ? "attention" : "neutral"}
        >
          <Row label="Imprimante" value={health.printer_driver} />
          <Row label="Événement" value={health.event_name} />
          <Row
            label="Format"
            value={`${health.print_format_name} — ratio ${health.print_aspect_ratio.toFixed(3)}`}
          />
          {health.session_state !== "idle" && (
            <CardAction onClick={() => setReleaseDialogOpen(true)} disabled={releasing} warning>
              {releasing ? "Retour en cours…" : "Libérer la borne"}
            </CardAction>
          )}
        </Group>

        <Group
          title="Stockage"
          icon="storage"
          value={gigabytes(health.disk_free_bytes)}
          tone={health.disk_free_bytes < 2 * 1024 ** 3 ? "warning" : "neutral"}
        >
          <Meter label="Espace libre" value={health.disk_free_bytes} capacity={health.disk_total_bytes} format={gigabytes} />
        </Group>

        <Group
          title="Ressources"
          icon="resources"
          value={health.temperature_c === null ? "Temp. —" : `${health.temperature_c.toFixed(1)} °C`}
          tone={health.temperature_c !== null && health.temperature_c >= 80 ? "attention" : "neutral"}
        >
          <Meter
            label="CPU"
            value={health.cpu_percent}
            capacity={100}
            summary={`${health.cpu_percent.toFixed(1)} %`}
          />
          <Meter label="Mémoire" value={health.memory_used_bytes} capacity={health.memory_total_bytes} format={gigabytes} />
        </Group>

      </div>

      <Dialog open={scan !== null} onOpenChange={(open) => { if (!open) setScan(null); }}>
        {scan && (
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-2xl">
            <DialogHeader>
              <DialogDescription>Diagnostic caméra</DialogDescription>
              <DialogTitle>Caméras détectées</DialogTitle>
            </DialogHeader>
            <ScanResult scan={scan} />
            <DialogFooter>
              <Button onClick={() => setScan(null)} tone="secondary">Fermer</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Libérer la borne ?</AlertDialogTitle>
            <AlertDialogDescription>La session en cours sera interrompue et la borne reviendra à l’accueil.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void releaseKiosk()}>Libérer la borne</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

/** Deux listes côte à côte, jamais appariées — voir `CameraScan`. */
function ScanResult({ scan }: { scan: CameraScan }) {
  const nothingProbed = scan.probed.length === 0;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 overflow-auto p-6 text-sm max-sm:grid-cols-1">
      <Row
        label="Index utilisables"
        value={
          nothingProbed
            ? "aucun index n'a répondu"
            : scan.probed.map((camera) => `${camera.index} (${size(camera.size)})`).join(" · ")
        }
      />
      <Row
        label="Vus par le système"
        value={scan.system_names.length > 0 ? scan.system_names.join(", ") : "nom indisponible"}
      />
      {scan.skipped_index !== null && (
        <Row label="Non sondé" value={`index ${scan.skipped_index} — utilisé par le kiosque`} />
      )}

      <dt className="text-muted-foreground">À savoir</dt>
      <dd className="text-muted-foreground">
        {nothingProbed ? (
          /* Sur macOS, l'autorisation caméra s'attache à l'application qui a lancé le
             backend : accordée au terminal, elle ne l'est pas pour autant à un service
             lancé autrement. C'est la cause la plus fréquente d'un sondage vide, et sans
             cette phrase l'opérateur conclut qu'il n'a pas de caméra. */
          <>
            Causes possibles : OpenCV n'est pas installé (extra <code>webcam</code>), la
            caméra est déjà utilisée par une autre application, ou — sur macOS —
            l'autorisation caméra n'est pas accordée au processus qui a lancé le backend.
            Elle s'attache à l'application qui le démarre, pas à la machine.
          </>
        ) : (
          <>
            Les deux listes ne se correspondent pas ligne à ligne : rien ne garantit que le
            premier nom soit l'index 0. C'est l'index qui va dans{" "}
            <code>DYM_CAMERA_DEVICE</code>.
          </>
        )}
      </dd>
    </dl>
  );
}

type DiagnosticTone = "neutral" | "ready" | "warning" | "attention";
type DiagnosticIcon = "camera" | "printer" | "session" | "storage" | "resources";

function Group({ title, icon, value, tone, children }: { title: string; icon: DiagnosticIcon; value: string; tone: DiagnosticTone; children: ReactNode }) {
  return (
    <Card className="col-span-1 min-w-0 gap-0 overflow-hidden py-0 xl:col-span-2 xl:nth-[n+4]:col-span-3">
      <CardHeader className={`grid min-h-24 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 border-b p-4 ${toneSurface[tone]}`}>
        <DiagnosticGlyph name={icon} />
        <span className="text-xs opacity-75">{title}</span>
        <strong className="truncate text-xl tabular-nums">{value}</strong>
      </CardHeader>
      <CardContent className="px-4 py-3"><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 text-sm [&>dd]:min-w-0 [&>dd]:py-1.5 [&>dd]:text-right [&>dt]:py-1.5 [&>dt]:text-muted-foreground">{children}</dl></CardContent>
    </Card>
  );
}

function Meter({ label, value, capacity, format = String, summary }: { label: string; value: number; capacity: number; format?: (value: number) => string; summary?: string }) {
  const percentage = capacity > 0 ? Math.min(100, Math.max(0, (value / capacity) * 100)) : 0;
  return (
    <div className="col-span-full py-2">
      <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="tabular-nums">{summary ?? `${format(value)} sur ${format(capacity)}`}</dd></div>
      <Progress value={percentage} aria-label={`${label} : ${Math.round(percentage)} %`} className="mt-2" />
    </div>
  );
}

function DiagnosticGlyph({ name }: { name: DiagnosticIcon }) {
  const paths: Record<DiagnosticIcon, ReactNode> = {
    camera: <><path d="M4 7h3l1.5-2h7L17 7h3v11H4V7Z" /><circle cx="12" cy="12.5" r="3.5" /></>,
    printer: <><path d="M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-5h18v5a2 2 0 0 1-2 2h-2" /><path d="M7 15h10v6H7z" /></>,
    session: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    storage: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    resources: <path d="M4 14h3l2-7 4 11 2-6h5" />,
  };
  return <svg className="row-span-2 w-7 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function CardAction({ children, onClick, disabled, warning = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; warning?: boolean }) {
  return (
    <div className="col-span-full pt-2">
      <Button onClick={onClick} disabled={disabled} tone={warning ? "warning" : "secondary"}>{children}</Button>
    </div>
  );
}

const toneSurface: Record<DiagnosticTone, string> = {
  neutral: "bg-muted text-foreground",
  ready: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  attention: "bg-red-50 text-red-800",
};

const SESSION_LABELS: Record<AdminHealth["session_state"], string> = {
  idle: "Accueil",
  preview: "Cadrage",
  review: "Choix photo",
  printing: "Impression",
  done: "Fin de session",
  error: "Erreur",
};

const sessionLabel = (state: AdminHealth["session_state"]) => SESSION_LABELS[state];

const size = ([width, height]: [number, number]) => `${width}×${height}`;

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
