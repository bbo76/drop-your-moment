import type { SystemStatus } from "./api";

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
 * retrouvent coupés une fois la photo recadrée au format de tirage. */
export function computeFraming({
  preview_size: [width, height],
  print_aspect_ratio: printAspect,
}: SystemStatus): Framing {
  const previewAspect = width / height;
  const cropsWidth = printAspect < previewAspect;
  const kept = cropsWidth ? printAspect / previewAspect : previewAspect / printAspect;

  return {
    aspectRatio: `${width} / ${height}`,
    cropsWidth,
    maskPercent: Math.max(0, ((1 - kept) / 2) * 100),
  };
}
