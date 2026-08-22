import { useEffect, useState, type ReactNode } from "react";

import { api, type AdminHealth, type CameraScan } from "../shared/api";
import { Button, Row, Section } from "./ui";

/* Tableau de bord : « est-ce que la borne va tenir la soirée ? »
 *
 * Tout est en lecture, sauf la remise à zéro du compteur de cartouche. Sondé en boucle,
 * parce que c'est la page qu'on laisse ouverte pendant un événement. */

const POLL_INTERVAL_MS = 2000;

/* Cartouches de la Canon Selphy CP1500. Côté frontend et non dans l'API : une route qui
   renvoie trois littéraux transporte de la mise en forme, pas de l'information.

   Pas de sélecteur de capacité persisté non plus. Afficher les trois seuils en regard des
   tirages répond à « me reste-t-il du papier » sans inventer un état de plus à stocker,
   invalider et tenir à jour. */
const CARTRIDGE_CAPACITIES = [36, 54, 108];

export function HealthSection() {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<CameraScan | null>(null);
  const [scanning, setScanning] = useState(false);

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

  const resetCartridge = async () => {
    // Irréversible et invisible : sans confirmation, un clic de travers efface le seul
    // repère qui dit combien de papier reste.
    if (!window.confirm("Remettre le compteur de cartouche à zéro ?")) return;
    try {
      const counters = await api.resetCartridge();
      setHealth((current) => (current ? { ...current, counters } : current));
    } catch (cause) {
      setError(String(cause));
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
          <Row label="Depuis la cartouche" value={`${counters.prints_since_reset}`} />
          <Row label="Restant estimé" value={<Remaining used={counters.prints_since_reset} />} />
          <Row
            label="Remise à zéro"
            value={
              counters.reset_at
                ? new Date(counters.reset_at).toLocaleString("fr-FR")
                : "jamais — le compteur porte tous les tirages"
            }
          />
        </Group>

        <Group title="Parcours">
          <Row label="Session" value={health.session_state} />
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
        <Button onClick={() => void resetCartridge()}>Nouvelle cartouche</Button>
        <Button onClick={() => void scanCameras()} disabled={scanning}>
          {scanning ? "Sondage…" : "Détecter les caméras"}
        </Button>
      </div>

      {scan && <ScanResult scan={scan} />}
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

/** Ce qu'il reste selon la cartouche montée — l'opérateur sait laquelle, pas la borne. */
function Remaining({ used }: { used: number }) {
  return (
    <span>
      {CARTRIDGE_CAPACITIES.map((capacity, index) => (
        <span key={capacity}>
          {index > 0 && " · "}
          <span className={used >= capacity ? "text-warn" : undefined}>
            {used >= capacity ? "épuisée" : Math.max(0, capacity - used)}
          </span>
          <span className="text-muted"> ({capacity})</span>
        </span>
      ))}
    </span>
  );
}

const size = ([width, height]: [number, number]) => `${width}×${height}`;

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
