import { useEffect, useState } from "react";

import { api, type AdminHealth } from "../shared/api";
import { Row, Section } from "./ui";

/* Diagnostic système, sondé en continu.
 *
 * Contrairement à la configuration d'événement, rien ici ne se modifie : c'est de la
 * lecture, et elle doit rester fraîche pendant qu'un événement tourne. */

const POLL_INTERVAL_MS = 2000;

export function HealthSection() {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Section title="État du système">
      {error && <p className="text-warn">Backend injoignable : {error}</p>}

      {health && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <Row label="Caméra" value={health.camera_ok ? "détectée" : "absente"} />
          <Row label="Pilote" value={health.camera_driver} />
          <Row label="Session" value={health.session_state} />
          <Row label="Format de sortie" value={health.print_format_name} />
          <Row label="Ratio" value={health.print_aspect_ratio.toFixed(3)} />
        </dl>
      )}
    </Section>
  );
}
