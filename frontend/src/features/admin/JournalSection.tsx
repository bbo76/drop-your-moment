import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Download, Radio, RefreshCw, Search } from "lucide-react";

import {
  api,
  type JournalComponent,
  type JournalEntry,
  type JournalLevel,
  type JournalQuery,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Feedback, Section } from "./ui";

const LEVELS: Array<{ value: "" | JournalLevel; label: string }> = [
  { value: "", label: "Tous les niveaux" },
  { value: "critical", label: "Critique" },
  { value: "error", label: "Erreur" },
  { value: "warning", label: "Attention" },
  { value: "info", label: "Information" },
  { value: "debug", label: "Détail" },
];

const COMPONENTS: Array<{ value: "" | JournalComponent; label: string }> = [
  { value: "", label: "Tous les composants" },
  { value: "borne", label: "Borne" },
  { value: "camera", label: "Caméra" },
  { value: "impression", label: "Impression" },
  { value: "reseau", label: "Réseau" },
];

export function JournalSection() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [query, setQuery] = useState<JournalQuery>({ limit: 100 });
  const [draft, setDraft] = useState({ since: "", until: "", level: "", component: "", search: "" });
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const loading = useRef(false);

  const load = useCallback(async (nextQuery: JournalQuery, nextOffsetValue: number, preserveSelection = false) => {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    try {
      const page = await api.adminJournal({ ...nextQuery, offset: nextOffsetValue, limit: 100 });
      setEntries(page.entries);
      setSelected((current) => preserveSelection
        ? page.entries.find((entry) => entryKey(entry) === entryKey(current)) ?? current ?? page.entries[0] ?? null
        : (page.entries[0] ?? null));
      setNextOffset(page.next_offset);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de lire les journaux.");
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load({ limit: 100 }, 0); }, [load]);
  useEffect(() => {
    if (!live || offset !== 0) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(query, 0, true);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [live, load, offset, query]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery: JournalQuery = {
      since: draft.since ? new Date(draft.since).toISOString() : undefined,
      until: draft.until ? new Date(draft.until).toISOString() : undefined,
      level: (draft.level || undefined) as JournalLevel | undefined,
      component: (draft.component || undefined) as JournalComponent | undefined,
      search: draft.search.trim() || undefined,
    };
    setQuery(nextQuery);
    setOffset(0);
    void load(nextQuery, 0);
  };

  const paginate = (next: number) => {
    if (next > 0) setLive(false);
    setOffset(next);
    void load(query, next);
  };

  return (
    <Section title="Journaux">
      <div className="space-y-5">
        <form onSubmit={submit} className="grid gap-3 lg:grid-cols-[1fr_1fr_0.85fr_0.85fr_1.3fr_auto]">
          <Field label="Depuis"><Input type="datetime-local" value={draft.since} onChange={(event) => setDraft({ ...draft, since: event.target.value })} /></Field>
          <Field label="Jusqu’à"><Input type="datetime-local" value={draft.until} onChange={(event) => setDraft({ ...draft, until: event.target.value })} /></Field>
          <Field label="Niveau"><NativeSelect value={draft.level} onChange={(value) => setDraft({ ...draft, level: value })} options={LEVELS} /></Field>
          <Field label="Composant"><NativeSelect value={draft.component} onChange={(value) => setDraft({ ...draft, component: value })} options={COMPONENTS} /></Field>
          <Field label="Texte"><Input type="search" maxLength={120} placeholder="hotspot, caméra…" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></Field>
          <Button type="submit" className="self-end" disabled={busy}><Search />Rechercher</Button>
        </form>

        <Feedback error={error} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
          <p className="text-sm text-muted-foreground">{entries.length ? `${entries.length} événements · plus récents en premier` : "Aucun événement pour ces filtres"}</p>
          <div className="flex gap-2">
            <Button variant={live ? "default" : "outline"} aria-pressed={live} onClick={() => setLive((current) => !current)}><Radio className={live ? "animate-pulse" : ""} />{live ? "Live activé" : "Live arrêté"}</Button>
            <Button variant="outline" disabled={busy} onClick={() => void load(query, offset)}><RefreshCw className={busy ? "animate-spin" : ""} />Actualiser</Button>
            <Button variant="outline" disabled={!entries.length} onClick={() => exportEntries(entries, "txt")}><Download />Texte</Button>
            <Button variant="outline" disabled={!entries.length} onClick={() => exportEntries(entries, "json")}><Download />JSON</Button>
          </div>
        </div>

        <div className="grid min-h-[28rem] gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.75fr)]">
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="max-h-[42rem] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted"><tr><th className="px-4 py-3 text-left font-medium">Date</th><th className="px-4 py-3 text-left font-medium">Niveau</th><th className="px-4 py-3 text-left font-medium">Composant</th><th className="px-4 py-3 text-left font-medium">Message</th></tr></thead>
                <tbody>{entries.map((entry) => <tr key={`${entry.timestamp}-${entry.message}`} onClick={() => setSelected(entry)} className="cursor-pointer border-t align-top hover:bg-muted/60 focus-within:bg-muted/60"><td className="whitespace-nowrap px-4 py-3 tabular-nums"><button type="button" className="text-left outline-none" onClick={() => setSelected(entry)}>{dateTime(entry.timestamp)}</button></td><td className={`px-4 py-3 font-medium ${isIncident(entry) ? "text-destructive" : "text-muted-foreground"}`}>{levelLabel(entry.level)}</td><td className="px-4 py-3">{componentLabel(entry.component)}</td><td className="max-w-lg px-4 py-3 text-foreground">{entry.message.split("\n")[0]}</td></tr>)}</tbody>
              </table>
              {!entries.length && !error && <p className="px-6 py-16 text-center text-muted-foreground">Reproduisez le problème, puis actualisez ou élargissez la période.</p>}
            </div>
            <div className="flex items-center justify-between border-t p-3"><Button variant="outline" disabled={busy || offset === 0} onClick={() => paginate(Math.max(0, offset - 100))}>Plus récents</Button><span className="text-sm tabular-nums text-muted-foreground">{entries.length ? `${offset + 1}–${offset + entries.length}` : "0 événement"}</span><Button variant="outline" disabled={busy || nextOffset === null} onClick={() => paginate(nextOffset ?? offset)}>Plus anciens</Button></div>
          </div>

          <aside className="self-start rounded-xl border bg-muted/30 p-5 xl:sticky xl:top-20" aria-label="Détail du journal">
            {selected ? <><div className="flex items-center justify-between gap-3"><strong className={isIncident(selected) ? "text-destructive" : "text-foreground"}>{levelLabel(selected.level)}</strong><time className="text-sm tabular-nums text-muted-foreground">{dateTime(selected.timestamp, true)}</time></div><h2 className="mt-5 text-xl font-semibold">{componentLabel(selected.component)}</h2><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6">{selected.message}</pre>{Object.keys(selected.context).length > 0 && <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t pt-4 text-sm">{Object.entries(selected.context).map(([label, value]) => <div className="contents" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>}</> : <p className="text-sm text-muted-foreground">Sélectionnez un événement pour lire son contexte nettoyé.</p>}
          </aside>
        </div>
      </div>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{label}</span>{children}</label>;
}

function NativeSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
}

function exportEntries(entries: JournalEntry[], format: "txt" | "json") {
  const body = format === "json" ? JSON.stringify(entries, null, 2) : entries.map((entry) => `${entry.timestamp}\t${entry.level}\t${entry.component}\t${entry.message.replaceAll("\n", " ")}`).join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: format === "json" ? "application/json" : "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `journaux-${new Date().toISOString().slice(0, 10)}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

const isIncident = ({ level }: JournalEntry) => ["critical", "error", "warning"].includes(level);
const levelLabel = (level: JournalLevel) => ({ critical: "Critique", error: "Erreur", warning: "Attention", info: "Info", debug: "Détail" })[level];
const componentLabel = (component: JournalComponent) => ({ borne: "Borne", camera: "Caméra", impression: "Impression", reseau: "Réseau" })[component];
const entryKey = (entry: JournalEntry | null) => entry ? `${entry.timestamp}-${entry.message}` : "";
const dateTime = (value: string, seconds = false) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: seconds ? "medium" : "short" }).format(new Date(value));
