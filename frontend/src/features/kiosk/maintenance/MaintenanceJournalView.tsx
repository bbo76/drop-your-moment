import { useCallback, useEffect, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";

import {
  api,
  type JournalComponent,
  type JournalEntry,
} from "@/api/client";

const COMPONENTS: Array<{ value?: JournalComponent; label: string }> = [
  { label: "Tous" },
  { value: "borne", label: "Borne" },
  { value: "camera", label: "Caméra" },
  { value: "impression", label: "Impression" },
  { value: "reseau", label: "Réseau" },
];

const LEVEL_LABEL = {
  critical: "Critique",
  error: "Erreur",
  warning: "Attention",
  info: "Info",
  debug: "Détail",
} as const;

export function MaintenanceJournalView() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [component, setComponent] = useState<JournalComponent | undefined>();
  const [incidents, setIncidents] = useState(true);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset = 0, append = false) => {
    setBusy(true);
    try {
      const page = await api.maintenanceJournal({ offset, limit: 40, component, incidents });
      setEntries((current) => append ? [...current, ...page.entries] : page.entries);
      setSelected((current) => append ? current : (page.entries[0] ?? null));
      setNextOffset(page.next_offset);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de lire les journaux.");
    } finally {
      setBusy(false);
    }
  }, [component, incidents]);

  useEffect(() => { void load(); }, [load]);

  const incidentCount = entries.filter(({ level }) =>
    level === "critical" || level === "error" || level === "warning"
  ).length;

  return (
    <section className="grid min-h-0 grid-rows-[auto_auto_1fr] gap-3" aria-label="Journaux de la borne">
      <div className="flex min-h-14 items-center justify-between rounded-panel bg-surface px-4">
        <p className="text-xl font-semibold">
          {error ? "Lecture indisponible" : incidentCount ? `${incidentCount} incident${incidentCount > 1 ? "s" : ""} affiché${incidentCount > 1 ? "s" : ""}` : "Aucun incident affiché"}
        </p>
        <button type="button" disabled={busy} onClick={() => void load()} className="flex min-h-12 items-center gap-2 rounded-panel border-2 border-edge px-4 text-lg font-semibold disabled:opacity-40">
          <RefreshCw className={`size-5 ${busy ? "motion-safe:animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtres des journaux">
        <FilterButton pressed={incidents} onClick={() => setIncidents(true)}>Incidents</FilterButton>
        <FilterButton pressed={!incidents} onClick={() => setIncidents(false)}>Tout</FilterButton>
        <span className="mx-1 w-px flex-none bg-edge" aria-hidden="true" />
        {COMPONENTS.map((choice) => <FilterButton key={choice.label} pressed={component === choice.value} onClick={() => setComponent(choice.value)}>{choice.label}</FilterButton>)}
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.8fr)] gap-3">
        <div className="min-h-0 overflow-y-auto rounded-panel bg-surface" aria-live="polite">
          {error && <EmptyState title="Journaux indisponibles" detail="Vérifiez que le service systemd est actif, puis actualisez." />}
          {!error && !busy && entries.length === 0 && <EmptyState title="Rien à signaler" detail="Changez les filtres ou actualisez après avoir reproduit le problème." />}
          {entries.map((entry) => (
            <button key={`${entry.timestamp}-${entry.message}`} type="button" aria-pressed={selected === entry} onClick={() => setSelected(entry)} className="grid min-h-[4.5rem] w-full grid-cols-[5.3rem_6.3rem_1fr] items-center gap-3 border-b border-edge/70 px-4 text-left last:border-0 aria-pressed:bg-edge/45">
              <time className="text-lg font-semibold tabular-nums">{time(entry.timestamp)}</time>
              <span className={`text-base font-semibold ${isIncident(entry) ? "text-warn" : "text-muted"}`}>{LEVEL_LABEL[entry.level]}</span>
              <span className="min-w-0"><strong className="block text-base font-semibold">{componentLabel(entry.component)}</strong><span className="block truncate text-base text-muted">{entry.message}</span></span>
            </button>
          ))}
          {nextOffset !== null && <button type="button" disabled={busy} onClick={() => void load(nextOffset, true)} className="min-h-14 w-full text-lg font-semibold text-signal disabled:opacity-40">Afficher les événements plus anciens</button>}
        </div>
        <aside className="min-h-0 rounded-panel border-2 border-edge bg-ink p-5" aria-label="Détail du journal sélectionné">
          {selected ? <><div className="flex items-center justify-between gap-3"><span className={`font-semibold ${isIncident(selected) ? "text-warn" : "text-signal"}`}>{LEVEL_LABEL[selected.level]}</span><time className="text-base tabular-nums text-muted">{dateTime(selected.timestamp)}</time></div><h2 className="mt-5 text-2xl font-bold">{componentLabel(selected.component)}</h2><p className="mt-3 max-h-32 overflow-y-auto text-lg leading-snug text-body">{selected.message}</p><p className="mt-5 border-t border-edge pt-4 text-base text-muted">Conseil : notez l’heure et le composant. Si le problème persiste après un nouvel essai, consultez le détail depuis l’administration.</p></> : <p className="text-lg text-muted">Sélectionnez une ligne pour lire son contexte.</p>}
        </aside>
      </div>
    </section>
  );
}

function FilterButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return <button type="button" aria-pressed={pressed} onClick={onClick} className="min-h-12 flex-none rounded-panel border-2 border-edge px-4 text-lg font-semibold aria-pressed:border-signal aria-pressed:bg-signal aria-pressed:text-signal-ink">{children}</button>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="grid h-full min-h-44 place-content-center px-8 text-center"><CircleAlert className="mx-auto size-10 text-muted" /><strong className="mt-3 text-xl">{title}</strong><p className="mt-1 text-base text-muted">{detail}</p></div>;
}

const isIncident = ({ level }: JournalEntry) => ["critical", "error", "warning"].includes(level);
const componentLabel = (component: JournalComponent) => ({ borne: "Borne", camera: "Caméra", impression: "Impression", reseau: "Réseau" })[component];
const time = (value: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
