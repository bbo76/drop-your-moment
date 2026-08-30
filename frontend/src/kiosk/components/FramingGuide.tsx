/** Géométrie du cadre de visée à superposer à l'aperçu. */
export interface Framing {
  /** Ratio du flux caméra, à imposer au conteneur pour que le repère soit juste. */
  aspectRatio: string;
  /** true si le rognage retire de la largeur, false s'il retire de la hauteur. */
  cropsWidth: boolean;
  /** Part masquée de chaque côté, en pourcentage. 0 quand aucun rognage n'a lieu. */
  maskPercent: number;
}

/* Trois ratios cohabitent dans la chaîne et doivent être réconciliés explicitement :
 * le capteur (16:9), le format de sortie (1,48 pour une carte postale) et l'écran
 * Waveshare (1024:600).
 * Sans repère visible, les visiteurs se cadrent sur toute la largeur de l'aperçu et se
 * retrouvent coupés une fois la photo recadrée au format de tirage.
 *
 * Les deux entrées viennent de sources différentes — la taille d'aperçu du matériel, le
 * ratio de sortie de l'événement — d'où deux paramètres plutôt qu'un objet. */
export function computeFraming(
  previewSize: [number, number],
  printAspectRatio: number,
): Framing {
  const [width, height] = previewSize;
  const previewAspect = width / height;
  const cropsWidth = printAspectRatio < previewAspect;
  const kept = cropsWidth
    ? printAspectRatio / previewAspect
    : previewAspect / printAspectRatio;

  return {
    aspectRatio: `${width} / ${height}`,
    cropsWidth,
    maskPercent: Math.max(0, ((1 - kept) / 2) * 100),
  };
}

/** Met hors foyer ce que le recadrage va retirer et matérialise la zone conservée.
 *
 * Sans ce repère, les visiteurs se cadrent sur toute la largeur de l'aperçu et se
 * retrouvent coupés une fois la photo recadrée au ratio du format de sortie.
 * `backdrop-filter` agit sur l'unique flux MJPEG déjà affiché : dupliquer l'image pour
 * fabriquer le flou ouvrirait un second flux caméra et doublerait inutilement l'encodage.
 */
export function FramingGuide({
  cropsWidth,
  maskPercent,
  overlayUrl,
}: {
  cropsWidth: boolean;
  maskPercent: number;
  overlayUrl: string | null;
}) {
  const veil = "absolute bg-black/15 backdrop-blur-[6px] backdrop-brightness-50";
  const overlayStyle = cropsWidth
    ? { inset: `0 auto 0 ${maskPercent}%`, width: `${100 - 2 * maskPercent}%` }
    : { inset: `${maskPercent}% 0 auto 0`, height: `${100 - 2 * maskPercent}%` };

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {overlayUrl && (
        <img
          src={overlayUrl}
          alt=""
          draggable={false}
          className="absolute h-full w-full object-fill"
          style={overlayStyle}
        />
      )}
      {maskPercent > 0 && (cropsWidth ? (
        <>
          <div className={`${veil} inset-y-0 left-0 border-r border-white/70`} style={{ width: `${maskPercent}%` }} />
          <div className={`${veil} inset-y-0 right-0 border-l border-white/70`} style={{ width: `${maskPercent}%` }} />
        </>
      ) : (
        <>
          <div className={`${veil} inset-x-0 top-0 border-b border-white/70`} style={{ height: `${maskPercent}%` }} />
          <div className={`${veil} inset-x-0 bottom-0 border-t border-white/70`} style={{ height: `${maskPercent}%` }} />
        </>
      ))}
    </div>
  );
}
