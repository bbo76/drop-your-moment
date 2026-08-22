import { useEffect, useState } from "react";

/* Portail d'administration — squelette.
 *
 * Il n'expose au jalon 1 que le diagnostic déjà servi par le backend, ce qui suffit à
 * exercer la seconde socket et à vérifier l'isolation réseau. Config d'événement, upload
 * d'overlay et galerie arrivent au jalon 5.
 *
 * Contrairement au kiosque, cet écran s'adresse à un opérateur sur un PC : il peut
 * défiler, afficher des informations techniques et n'a aucune contrainte tactile. */

interface AdminHealth {
  camera_ok: boolean;
  camera_driver: string;
  session_state: string;
  print_format_name: string;
  print_aspect_ratio: number;
}

export function AdminApp() {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const response = await fetch("/admin/system/health", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const fresh = (await response.json()) as AdminHealth;
        if (cancelled) return;
        setHealth(fresh);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(String(cause));
      } finally {
        if (!cancelled) timer = setTimeout(tick, 2000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="min-h-full overflow-auto p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Drop Your Moment</h1>
        <p className="text-muted">Administration</p>
      </header>

      <section className="max-w-xl rounded-panel border border-edge bg-surface p-6">
        <h2 className="mb-4 text-lg font-medium">État du système</h2>

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
      </section>

      <p className="mt-8 text-sm text-muted">
        Config d'événement, overlay et galerie : jalon 5.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
