import { useEffect, useRef, useState, type ReactNode } from "react";

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
  const scanDialogRef = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    if (scan && !scanDialogRef.current?.open) scanDialogRef.current?.showModal();
  }, [scan]);

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
    if (!window.confirm("Interrompre la session en cours et ramener la borne à l’accueil ?")) {
      return;
    }
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
        <p className="text-warn">Backend injoignable : {error}</p>
      </Section>
    );
  }
  if (!health) {
    return (
      <Section title="État du système">
        <p className="text-muted">Chargement…</p>
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
      {error && <p className="mb-4 text-warn">Backend injoignable : {error}</p>}
      {health.maintenance_active && (
        <div className="admin-maintenance-alert" role="status" aria-live="polite">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L5 16l3 3 7.3-7.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2Z" />
          </svg>
          <div>
            <strong>Maintenance locale en cours</strong>
            <span>Une personne a déverrouillé l’écran de la borne et intervient sur place.</span>
          </div>
        </div>
      )}

      <div className="diagnostic-grid">
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
            <CardAction onClick={() => void releaseKiosk()} disabled={releasing} warning>
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

      <dialog
        ref={scanDialogRef}
        className="camera-scan-dialog"
        aria-labelledby="camera-scan-title"
        onClose={() => setScan(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        {scan && (
          <div>
            <header>
              <div>
                <span>Diagnostic caméra</span>
                <h2 id="camera-scan-title">Caméras détectées</h2>
              </div>
              <button
                type="button"
                className="camera-scan-close"
                aria-label="Fermer"
                onClick={() => scanDialogRef.current?.close()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </header>
            <ScanResult scan={scan} />
            <footer>
              <Button onClick={() => scanDialogRef.current?.close()} tone="secondary">Fermer</Button>
            </footer>
          </div>
        )}
      </dialog>
    </Section>
  );
}

/** Deux listes côte à côte, jamais appariées — voir `CameraScan`. */
function ScanResult({ scan }: { scan: CameraScan }) {
  const nothingProbed = scan.probed.length === 0;
  return (
    <dl className="camera-scan-result">
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

      <dt className="text-muted">À savoir</dt>
      <dd className="text-muted">
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
    <section className={`diagnostic-card diagnostic-${tone}`}>
      <header>
        <DiagnosticGlyph name={icon} />
        <span>{title}</span>
        <strong>{value}</strong>
      </header>
      <dl>{children}</dl>
    </section>
  );
}

function Meter({ label, value, capacity, format = String, summary }: { label: string; value: number; capacity: number; format?: (value: number) => string; summary?: string }) {
  const percentage = capacity > 0 ? Math.min(100, Math.max(0, (value / capacity) * 100)) : 0;
  return (
    <div className="diagnostic-meter">
      <div><dt>{label}</dt><dd>{summary ?? `${format(value)} sur ${format(capacity)}`}</dd></div>
      <span aria-hidden="true"><i style={{ width: `${percentage}%` }} /></span>
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
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function CardAction({ children, onClick, disabled, warning = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; warning?: boolean }) {
  return (
    <div className="diagnostic-card-action">
      <Button onClick={onClick} disabled={disabled} tone={warning ? "warning" : "secondary"}>{children}</Button>
    </div>
  );
}

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
