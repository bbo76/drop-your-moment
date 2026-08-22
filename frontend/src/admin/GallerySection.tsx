import { useCallback, useEffect, useState } from "react";

import {
  api,
  ARCHIVE_URL,
  photoDownloadUrl,
  photoViewUrl,
  thumbnailUrl,
  type GalleryEntry,
  type GalleryPage,
} from "../shared/api";
import { Button, Section } from "./ui";

/* Galerie de l'événement.
 *
 * Chargée par tranches : un événement produit plusieurs centaines de photos, et les
 * charger toutes ferait décoder autant de vignettes d'un coup sur un Pi.
 *
 * Pas de sondage périodique, contrairement à la page de santé. Une galerie qui se
 * réordonne sous le curseur pendant qu'on parcourt une page est pénible, et les vignettes
 * portent un cache court côté navigateur qu'un rechargement automatique combattrait. Un
 * bouton, que l'opérateur presse quand il veut voir les dernières prises. */

const PAGE_SIZE = 24;

export function GallerySection() {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<GalleryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setPage(await api.gallery(offset, PAGE_SIZE));
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }, [offset]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Section title="Galerie">
        <p className="text-warn">{error}</p>
      </Section>
    );
  }
  if (!page) {
    return (
      <Section title="Galerie">
        <p className="text-muted">Chargement…</p>
      </Section>
    );
  }

  const shown = page.entries.length;
  const hasPrevious = offset > 0;
  const hasNext = offset + shown < page.total;
  const selectedIndex = selected
    ? page.entries.findIndex((entry) => entry.session_id === selected.session_id)
    : -1;

  const deleteEntry = async (entry: GalleryEntry) => {
    setDeleting(true);
    try {
      await api.deleteGalleryEntry(entry.session_id);
      setSelected(null);
      setError(null);
      if (page.entries.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
      } else {
        await load();
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Section title="Galerie">
      {page.total === 0 ? (
        <p className="text-muted">Aucune photo pour l'instant.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted">
              {offset + 1}–{offset + shown} sur {page.total}
            </span>
            <a
              href={ARCHIVE_URL}
              className="text-accent underline"
              /* Le backend répond en flux : l'archive commence à arriver avant d'être
                 construite, il n'y a donc rien à attendre côté page. */
            >
              Télécharger tout (zip)
            </a>
            <button onClick={() => void load()} className="text-muted underline">
              Rafraîchir
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {page.entries.map((entry) => (
              <Thumbnail key={entry.session_id} entry={entry} onOpen={() => setSelected(entry)} />
            ))}
          </ul>

          <div className="mt-4 flex gap-3">
            <Button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={!hasPrevious}
            >
              Précédent
            </Button>
            <Button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={!hasNext}>
              Suivant
            </Button>
          </div>

          {selected && (
            <Lightbox
              entry={selected}
              deleting={deleting}
              onClose={() => setSelected(null)}
              onDelete={() => void deleteEntry(selected)}
              onPrevious={
                selectedIndex > 0 ? () => setSelected(page.entries[selectedIndex - 1]!) : undefined
              }
              onNext={
                selectedIndex >= 0 && selectedIndex < page.entries.length - 1
                  ? () => setSelected(page.entries[selectedIndex + 1]!)
                  : undefined
              }
            />
          )}
        </>
      )}
    </Section>
  );
}

function Thumbnail({ entry, onOpen }: { entry: GalleryEntry; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title="Afficher cette photo en grand"
        className="block w-full cursor-zoom-in"
      >
        <img
          src={thumbnailUrl(entry.session_id)}
          alt={`Photo du ${moment(entry.captured_at)}`}
          /* Chargement paresseux natif : une grille de 24 vignettes ne décode que ce qui
             est à l'écran, sans bibliothèque ni observateur d'intersection. */
          loading="lazy"
          className="aspect-[3/2] w-full rounded border border-edge object-cover"
        />
      </button>
      <p className="mt-1 text-xs text-muted">
        {moment(entry.captured_at)} · {kilobytes(entry.size_bytes)}
      </p>
    </li>
  );
}

function Lightbox({
  entry,
  deleting,
  onClose,
  onDelete,
  onPrevious,
  onNext,
}: {
  entry: GalleryEntry;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setConfirmingDelete(false);
  }, [entry.session_id]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrevious?.();
      if (event.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose, onNext, onPrevious]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo du ${moment(entry.captured_at)}`}
      className="fixed inset-0 z-50 grid bg-black/90 p-4 sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="m-auto flex max-h-full max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted">
            {moment(entry.captured_at)} · {kilobytes(entry.size_bytes)}
          </p>
          <button type="button" onClick={onClose} className="text-2xl" aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="flex min-h-0 items-center gap-3">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!onPrevious}
            className="px-2 text-3xl disabled:invisible"
            aria-label="Photo précédente"
          >
            ‹
          </button>
          <img
            src={photoViewUrl(entry.session_id)}
            alt={`Photo du ${moment(entry.captured_at)}`}
            className="max-h-[75vh] min-w-0 rounded-panel object-contain"
          />
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="px-2 text-3xl disabled:invisible"
            aria-label="Photo suivante"
          >
            ›
          </button>
        </div>

        {confirmingDelete ? (
          <div className="rounded-panel border border-warn bg-warn-bg p-4">
            <p className="font-medium text-warn">Supprimer définitivement cette photo ?</p>
            <p className="mt-1 text-sm text-muted">
              La session complète sera effacée. Cette action est irréversible.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded border border-edge px-4 py-2 disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded bg-warn px-4 py-2 font-medium text-ink disabled:opacity-40"
              >
                {deleting ? "Suppression…" : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-3">
            <a
              href={photoDownloadUrl(entry.session_id)}
              className="rounded bg-accent px-4 py-2 font-medium text-accent-ink"
            >
              Télécharger
            </a>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded border border-warn px-4 py-2 text-warn"
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** `captured_at` arrive en secondes, comme un `mtime` POSIX. */
const moment = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const kilobytes = (bytes: number) => `${Math.round(bytes / 1024)} ko`;
