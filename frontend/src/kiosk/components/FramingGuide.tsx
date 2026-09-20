/** L'aperçu est déjà le futur tirage : l'overlay en épouse donc directement les bords. */
export function FramingGuide({ overlayUrl }: { overlayUrl: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {overlayUrl && (
        <img
          src={overlayUrl}
          alt=""
          draggable={false}
          className="absolute h-full w-full object-fill"
        />
      )}
    </div>
  );
}
