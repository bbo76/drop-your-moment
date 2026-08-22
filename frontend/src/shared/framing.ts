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
 * le capteur (16:9), le format de sortie (1,48 pour une carte postale) et l'écran (5:3).
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
