import { useEffect, useState } from "react";

import { api, maintenancePhotoUrl, maintenanceThumbnailUrl, type GalleryEntry } from "../../shared/api";
import { MaintenanceIcon } from "./MaintenanceUi";

export function MaintenanceGalleryView({ onExpired }: { onExpired: () => void }) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.maintenanceGallery().then((page) => { setEntries(page.entries); setTotal(page.total); }, (cause) => { if (String(cause).includes("expirée")) onExpired(); else setError("Galerie indisponible."); });
  }, [onExpired]);
  if (selected) return <div className="relative min-h-0 overflow-hidden rounded-[0.9rem] bg-black"><img src={maintenancePhotoUrl(selected.session_id)} alt="Photo sélectionnée" className="size-full object-contain" /><button type="button" onClick={() => setSelected(null)} className="absolute right-4 bottom-4 min-h-14 rounded-panel bg-accent px-5 text-lg font-semibold text-accent-ink">Retour à la galerie</button></div>;
  if (error) return <div className="grid min-h-0 place-content-center rounded-[0.65rem] bg-surface p-3.5 text-xl text-warn max-h-[600px]:p-3">{error}</div>;
  if (entries.length === 0) return <div className="grid min-h-0 place-content-center rounded-[0.65rem] bg-surface p-3.5 text-center max-h-[600px]:p-3"><MaintenanceIcon name="gallery" className="mx-auto mb-5 size-18 rounded-panel border-2 border-edge p-3.5 text-accent" /><p className="text-3xl font-bold">Aucune photo</p><p className="text-lg text-muted">Les photos conservées apparaîtront ici.</p></div>;
  return <section className="grid min-h-0 grid-rows-[auto_1fr] gap-3 rounded-[0.65rem] bg-surface p-3.5 max-h-[600px]:p-3"><p className="text-lg text-muted">{total} photo{total > 1 ? "s" : ""} · les plus récentes</p><div className="grid min-h-0 grid-cols-4 gap-3 overflow-y-auto p-0.5">{entries.map((entry) => <button type="button" key={entry.session_id} onClick={() => setSelected(entry)} className="min-h-32 overflow-hidden rounded-panel border-[3px] border-transparent bg-ink focus-visible:border-accent"><img src={maintenanceThumbnailUrl(entry.session_id)} alt="Ouvrir cette photo" className="size-full object-cover" /></button>)}</div></section>;
}
