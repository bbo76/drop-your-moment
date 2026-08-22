import { useCallback, useEffect, useState } from "react";

import {
  api,
  ARCHIVE_URL,
  photoDownloadUrl,
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
              <Thumbnail key={entry.session_id} entry={entry} />
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
        </>
      )}
    </Section>
  );
}

function Thumbnail({ entry }: { entry: GalleryEntry }) {
  return (
    <li>
      <a href={photoDownloadUrl(entry.session_id)} title="Télécharger cette photo">
        <img
          src={thumbnailUrl(entry.session_id)}
          alt={`Photo du ${moment(entry.captured_at)}`}
          /* Chargement paresseux natif : une grille de 24 vignettes ne décode que ce qui
             est à l'écran, sans bibliothèque ni observateur d'intersection. */
          loading="lazy"
          className="aspect-[3/2] w-full rounded border border-edge object-cover"
        />
      </a>
      <p className="mt-1 text-xs text-muted">
        {moment(entry.captured_at)} · {kilobytes(entry.size_bytes)}
      </p>
    </li>
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
