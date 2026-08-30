import { useCallback, useEffect, useState } from "react";

import { Button as ShadButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";

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
        <p className="text-destructive">{error}</p>
      </Section>
    );
  }
  if (!page) {
    return (
      <Section title="Galerie">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="aspect-[3/2]" />)}</div>
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
        <p className="text-muted-foreground">Aucune photo pour l'instant.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {offset + 1}–{offset + shown} sur {page.total}
            </span>
            <a
              href={ARCHIVE_URL}
              className="text-foreground underline"
              /* Le backend répond en flux : l'archive commence à arriver avant d'être
                 construite, il n'y a donc rien à attendre côté page. */
            >
              Télécharger tout (zip)
            </a>
            <ShadButton variant="link" size="sm" onClick={() => void load()} className="px-0 text-muted-foreground">
              Rafraîchir
            </ShadButton>
          </div>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {page.entries.map((entry) => (
              <Thumbnail key={entry.session_id} entry={entry} onOpen={() => setSelected(entry)} />
            ))}
          </ul>

          <Pagination className="mt-4 justify-start">
            <PaginationContent>
              <PaginationItem><Button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={!hasPrevious}>Précédent</Button></PaginationItem>
              <PaginationItem><Button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={!hasNext}>Suivant</Button></PaginationItem>
            </PaginationContent>
          </Pagination>

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
      <ShadButton
        type="button"
        variant="ghost"
        onClick={onOpen}
        title="Afficher cette photo en grand"
        className="h-auto w-full cursor-zoom-in p-0"
      >
        <img
          src={thumbnailUrl(entry.session_id)}
          alt={`Photo du ${moment(entry.captured_at)}`}
          /* Chargement paresseux natif : une grille de 24 vignettes ne décode que ce qui
             est à l'écran, sans bibliothèque ni observateur d'intersection. */
          loading="lazy"
          className="aspect-[3/2] w-full rounded border border-border object-cover"
        />
      </ShadButton>
      <p className="mt-1 text-xs text-muted-foreground">
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
      if (event.key === "ArrowLeft") onPrevious?.();
      if (event.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose, onNext, onPrevious]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col bg-background sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Photo du {moment(entry.captured_at)}</DialogTitle>
          <DialogDescription>{kilobytes(entry.size_bytes)}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 items-center gap-3">
          <ShadButton
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onPrevious}
            disabled={!onPrevious}
            className="disabled:invisible"
            aria-label="Photo précédente"
          >
            <ChevronLeft />
          </ShadButton>
          <img
            src={photoViewUrl(entry.session_id)}
            alt={`Photo du ${moment(entry.captured_at)}`}
            className="max-h-[75vh] min-w-0 rounded-lg object-contain"
          />
          <ShadButton
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onNext}
            disabled={!onNext}
            className="disabled:invisible"
            aria-label="Photo suivante"
          >
            <ChevronRight />
          </ShadButton>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <ShadButton asChild>
            <a href={photoDownloadUrl(entry.session_id)}><Download />Télécharger</a>
          </ShadButton>
          <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <AlertDialogTrigger asChild>
              <ShadButton type="button" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive">Supprimer</ShadButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer définitivement cette photo ?</AlertDialogTitle>
                <AlertDialogDescription>La session complète sera effacée. Cette action est irréversible.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete} disabled={deleting}>{deleting ? "Suppression…" : "Confirmer la suppression"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
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
