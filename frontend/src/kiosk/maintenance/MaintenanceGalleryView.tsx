import { ArrowLeft, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode, type UIEvent } from "react";

import { api, maintenancePhotoUrl, maintenanceThumbnailUrl, type GalleryEntry } from "../../shared/api";
import { MaintenanceIcon } from "./MaintenanceUi";

const PAGE_SIZE = 12;

interface Props {
  onExpired: () => void;
  printBusy: boolean;
  printError: string | null;
  printsRemaining: number;
}

export function MaintenanceGalleryView({ onExpired, printBusy, printError, printsRemaining }: Props) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [copies, setCopies] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const maxCopies = Math.max(1, Math.min(10, printsRemaining));

  const handleError = (cause: unknown, message: string) => {
    if (String(cause).includes("expirée")) onExpired();
    else setError(message);
  };

  useEffect(() => {
    api.maintenanceGallery(0, PAGE_SIZE).then(
      (page) => { setEntries(page.entries); setTotal(page.total); setLoading(false); },
      (cause) => { setLoading(false); handleError(cause, "Galerie indisponible."); },
    );
  }, [onExpired]);

  useEffect(() => setCopies((value) => Math.min(value, maxCopies)), [maxCopies]);

  const loadMore = async () => {
    if (loadingMore || entries.length >= total) return;
    setLoadingMore(true);
    try {
      const page = await api.maintenanceGallery(entries.length, PAGE_SIZE);
      setEntries((current) => [...current, ...page.entries]);
      setTotal(page.total);
    } catch (cause) {
      handleError(cause, "Impossible de charger les photos suivantes.");
    } finally {
      setLoadingMore(false);
    }
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 120) void loadMore();
  };

  const print = async () => {
    if (!selected) return;
    setFeedback(null);
    try {
      await api.printMaintenanceGalleryEntry(selected.session_id, copies);
      setFeedback(`${copies} exemplaire${copies > 1 ? "s" : ""} envoyé${copies > 1 ? "s" : ""} à l'impression.`);
    } catch (cause) {
      handleError(cause, "Impossible de relancer l'impression.");
    }
  };

  const remove = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await api.deleteMaintenanceGalleryEntry(selected.session_id);
      setEntries((current) => current.filter((entry) => entry.session_id !== selected.session_id));
      setTotal((current) => Math.max(0, current - 1));
      setSelected(null);
      setConfirmDelete(false);
      setFeedback(null);
    } catch (cause) {
      setConfirmDelete(false);
      handleError(cause, "Impossible de supprimer cette photo.");
    } finally {
      setDeleting(false);
    }
  };

  if (selected) {
    return (
      <section className="relative grid min-h-0 grid-cols-[1.2fr_0.8fr] gap-4 overflow-hidden">
        <div className="grid min-h-0 place-content-center overflow-hidden rounded-[0.9rem] bg-black">
          <img src={maintenancePhotoUrl(selected.session_id)} alt="Photo sélectionnée" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex min-h-0 flex-col justify-between rounded-[0.9rem] bg-surface p-5">
          <button type="button" onClick={() => { setSelected(null); setFeedback(null); setError(null); }} className="flex min-h-14 items-center gap-3 self-start rounded-panel border-2 border-edge px-4 text-lg font-semibold"><ArrowLeft className="size-6" />Galerie</button>
          <fieldset disabled={printBusy || printsRemaining === 0}>
            <legend className="mb-2 text-base font-medium text-muted">Exemplaires à imprimer</legend>
            <div className="grid grid-cols-[1fr_1.25fr_1fr] gap-2">
              <QuantityButton label="Retirer un exemplaire" disabled={copies === 1} onClick={() => setCopies((value) => value - 1)}><Minus /></QuantityButton>
              <output aria-live="polite" className="grid min-h-14 place-items-center rounded-panel bg-signal text-2xl font-bold tabular-nums text-signal-ink">{copies}</output>
              <QuantityButton label="Ajouter un exemplaire" disabled={copies === maxCopies} onClick={() => setCopies((value) => value + 1)}><Plus /></QuantityButton>
            </div>
          </fieldset>
          <div className="grid gap-2">
            {(feedback || printError || error) && <p className={`text-base font-medium ${printError || error ? "text-warn" : "text-signal"}`} role="status">{error ?? printError ?? feedback}</p>}
            <button type="button" disabled={printBusy || printsRemaining === 0} onClick={() => void print()} className="flex min-h-16 items-center justify-center gap-3 rounded-panel bg-signal px-4 text-xl font-bold text-signal-ink disabled:opacity-40"><Printer className="size-6" />{printBusy ? "Impression en cours" : `Imprimer ${copies} exemplaire${copies > 1 ? "s" : ""}`}</button>
            <button type="button" disabled={printBusy || deleting} onClick={() => setConfirmDelete(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-panel border-2 border-warn text-lg font-semibold text-warn disabled:opacity-40"><Trash2 className="size-5" />Supprimer la photo</button>
          </div>
        </div>
        {confirmDelete && <DeleteConfirmation deleting={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}
      </section>
    );
  }

  if (loading) return <div className="grid min-h-0 place-content-center rounded-[0.65rem] bg-surface text-xl text-muted">Chargement des photos…</div>;
  if (error) return <div className="grid min-h-0 place-content-center rounded-[0.65rem] bg-surface p-3.5 text-xl text-warn">{error}</div>;
  if (entries.length === 0) return <div className="grid min-h-0 place-content-center rounded-[0.65rem] bg-surface p-3.5 text-center"><MaintenanceIcon name="gallery" className="mx-auto mb-5 size-18 rounded-panel border-2 border-edge p-3.5 text-signal" /><p className="text-3xl font-bold">Aucune photo</p><p className="text-lg text-muted">Les photos conservées apparaîtront ici.</p></div>;

  return (
    <section className="grid min-h-0 grid-rows-[auto_1fr] gap-3 rounded-[0.65rem] bg-surface p-3.5">
      <p className="text-lg text-muted">{total} photo{total > 1 ? "s" : ""} · de la plus récente à la plus ancienne</p>
      <div onScroll={onScroll} className="grid min-h-0 grid-cols-4 auto-rows-[8.5rem] gap-3 overflow-y-auto p-0.5">
        {entries.map((entry) => <button type="button" key={entry.session_id} onClick={() => { setSelected(entry); setCopies(1); setFeedback(null); setError(null); }} className="overflow-hidden rounded-panel border-[3px] border-transparent bg-ink [content-visibility:auto] focus-visible:border-signal"><img src={maintenanceThumbnailUrl(entry.session_id)} alt="Ouvrir cette photo" loading="lazy" decoding="async" className="size-full object-cover" /></button>)}
        {entries.length < total && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="col-span-4 min-h-14 rounded-panel border-2 border-edge text-lg font-semibold disabled:opacity-45">{loadingMore ? "Chargement…" : "Afficher plus de photos"}</button>}
      </div>
    </section>
  );
}

function QuantityButton({ children, label, disabled, onClick }: { children: ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid min-h-14 place-items-center rounded-panel border-2 border-edge text-body active:scale-[0.97] disabled:opacity-35">{children}</button>;
}

function DeleteConfirmation({ deleting, onCancel, onConfirm }: { deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6" role="alertdialog" aria-modal="true" aria-labelledby="delete-photo-title"><div className="w-full max-w-xl rounded-panel border-2 border-warn bg-ink p-8 text-body"><h2 id="delete-photo-title" className="text-3xl font-bold">Supprimer cette photo ?</h2><p className="mt-4 text-xl text-muted">Elle disparaîtra définitivement de la galerie.</p><div className="mt-8 grid grid-cols-2 gap-3"><button type="button" disabled={deleting} onClick={onCancel} className="min-h-16 rounded-panel border-2 border-edge text-xl font-semibold">Annuler</button><button type="button" disabled={deleting} onClick={onConfirm} className="min-h-16 rounded-panel bg-warn text-xl font-bold text-ink disabled:opacity-40">{deleting ? "Suppression…" : "Supprimer"}</button></div></div></div>;
}
