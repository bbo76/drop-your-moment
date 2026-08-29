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

/** Assombrit ce que le recadrage va retirer et matérialise la zone conservée.
 *
 * Sans ce repère, les visiteurs se cadrent sur toute la largeur de l'aperçu et se
 * retrouvent coupés une fois la photo recadrée au ratio du format de sortie.
 */
export function FramingGuide({
  cropsWidth,
  maskPercent,
}: {
  cropsWidth: boolean;
  maskPercent: number;
}) {
  if (maskPercent <= 0) return null;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full fill-black/55 stroke-white/65"
    >
      {cropsWidth ? (
        <>
          <rect width={maskPercent} height="100" stroke="none" />
          <rect x={100 - maskPercent} width={maskPercent} height="100" stroke="none" />
          <line x1={maskPercent} x2={maskPercent} y2="100" strokeWidth="2" strokeDasharray="8 8" vectorEffect="non-scaling-stroke" />
          <line x1={100 - maskPercent} x2={100 - maskPercent} y2="100" strokeWidth="2" strokeDasharray="8 8" vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <>
          <rect width="100" height={maskPercent} stroke="none" />
          <rect y={100 - maskPercent} width="100" height={maskPercent} stroke="none" />
          <line y1={maskPercent} y2={maskPercent} x2="100" strokeWidth="2" strokeDasharray="8 8" vectorEffect="non-scaling-stroke" />
          <line y1={100 - maskPercent} y2={100 - maskPercent} x2="100" strokeWidth="2" strokeDasharray="8 8" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}
