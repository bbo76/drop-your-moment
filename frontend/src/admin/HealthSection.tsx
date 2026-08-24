import { useEffect, useState, type ReactNode } from "react";

import { api, type AdminHealth, type CameraScan } from "../shared/api";
import { InkCartridgeDialog } from "../shared/InkCartridgeDialog";
import { PaperStockDialog } from "../shared/PaperStockDialog";
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
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [inkDialogOpen, setInkDialogOpen] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [savingInk, setSavingInk] = useState(false);

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

  const setPaperStock = async (total: number) => {
    setSavingStock(true);
    try {
      const counters = await api.setPaperStock(total);
      setHealth((current) => (current ? { ...current, counters } : current));
      setStockDialogOpen(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSavingStock(false);
    }
  };

  const reloadCassette = async () => {
    try {
      const counters = await api.reloadAdminCassette();
      setHealth((current) => (current ? { ...current, counters } : current));
    } catch (cause) {
      setError(String(cause));
    }
  };

  const replaceInk = async (capacity: 36 | 54) => {
    setSavingInk(true);
    try {
      const counters = await api.replaceInk(capacity);
      setHealth((current) => (current ? { ...current, counters } : current));
      setInkDialogOpen(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSavingInk(false);
    }
  };

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

      <div className="grid gap-6 sm:grid-cols-2">
        <Group title="Caméra">
          <Row label="Pilote" value={health.camera_driver} />
          <Row
            label="État"
            value={health.camera_ok ? "détectée" : <span className="text-warn">absente</span>}
          />
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
        </Group>

        <Group title="Tirages">
          <Row label="Cumul de l'événement" value={`${counters.prints_total}`} />
          <Row label="Stock papier" value={`${Math.max(0, counters.paper_stock_capacity - counters.prints_since_stock_set)} sur ${counters.paper_stock_capacity}`} />
          <Row label="Bac CP1500" value={`${Math.max(0, counters.cassette_capacity - counters.prints_since_cassette_reload)} sur ${counters.cassette_capacity}`} />
          <Row label="Cassette d’encre" value={`${Math.max(0, counters.cartridge_capacity - counters.prints_since_reset)} sur ${counters.cartridge_capacity}`} />
          <Row
            label="Stock défini"
            value={
              counters.stock_set_at
                ? new Date(counters.stock_set_at).toLocaleString("fr-FR")
                : "jamais — le compteur porte tous les tirages"
            }
          />
        </Group>

        <Group title="Parcours">
          <Row label="Session" value={health.maintenance_active ? <strong className="text-warn">maintenance locale</strong> : health.session_state} />
          <Row label="Imprimante" value={health.printer_driver} />
          <Row label="Événement" value={health.event_name} />
          <Row
            label="Format"
            value={`${health.print_format_name} — ratio ${health.print_aspect_ratio.toFixed(3)}`}
          />
        </Group>

        <Group title="Stockage">
          <Row
            label="Espace libre"
            value={`${gigabytes(health.disk_free_bytes)} sur ${gigabytes(health.disk_total_bytes)}`}
          />
          <Row label="Un événement pèse" value="environ 2 Go" />
        </Group>

        <Group title="Ressources">
          <Row label="CPU" value={`${health.cpu_percent.toFixed(1)} %`} />
          <Row
            label="Mémoire"
            value={`${gigabytes(health.memory_used_bytes)} sur ${gigabytes(health.memory_total_bytes)} · ${health.memory_percent.toFixed(1)} %`}
          />
          <Row
            label="Température"
            value={
              health.temperature_c === null
                ? "indisponible"
                : `${health.temperature_c.toFixed(1)} °C`
            }
          />
        </Group>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => void reloadCassette()}>Bac rechargé (18 feuilles)</Button>
        <Button onClick={() => setInkDialogOpen(true)}>Cassette d’encre remplacée</Button>
        <Button onClick={() => setStockDialogOpen(true)}>Définir le stock papier</Button>
        <Button onClick={() => void scanCameras()} disabled={scanning} tone="secondary">
          {scanning ? "Sondage…" : "Détecter les caméras"}
        </Button>
        {health.session_state !== "idle" && (
          <Button onClick={() => void releaseKiosk()} disabled={releasing} tone="warning">
            {releasing ? "Libération…" : "Libérer la borne"}
          </Button>
        )}
      </div>

      {scan && <ScanResult scan={scan} />}
      <PaperStockDialog
        open={stockDialogOpen}
        initialValue={Math.max(1, counters.paper_stock_capacity - counters.prints_since_stock_set)}
        saving={savingStock}
        onClose={() => setStockDialogOpen(false)}
        onConfirm={(total) => void setPaperStock(total)}
      />
      <InkCartridgeDialog
        open={inkDialogOpen}
        saving={savingInk}
        onClose={() => setInkDialogOpen(false)}
        onConfirm={(capacity) => void replaceInk(capacity)}
      />
    </Section>
  );
}

/** Deux listes côte à côte, jamais appariées — voir `CameraScan`. */
function ScanResult({ scan }: { scan: CameraScan }) {
  const nothingProbed = scan.probed.length === 0;
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-edge pt-4 text-sm">
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted uppercase">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">{children}</dl>
    </div>
  );
}

const size = ([width, height]: [number, number]) => `${width}×${height}`;

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
