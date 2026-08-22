import { useState } from "react";

import { previewStreamUrl, type SystemStatus } from "../../shared/api";
import { computeFraming } from "../../shared/framing";
import { GhostButton } from "./Screen";

const RETURN_HINT_THRESHOLD_S = 20;

interface Props {
  system: SystemStatus;
  remainingSeconds: number | null;
  onCancel: () => void;
}

export function PreviewScreen({ system, remainingSeconds, onCancel }: Props) {
  const framing = computeFraming(system);

  // Figé à la première image du composant : recalculer l'URL à chaque rendu
  // redémarrerait le flux MJPEG. Le montage et le démontage du composant suffisent à
  // ouvrir et fermer la connexion — React s'en charge quand on quitte cet écran.
  const [streamUrl] = useState(previewStreamUrl);

  const showReturnHint =
    remainingSeconds !== null && remainingSeconds <= RETURN_HINT_THRESHOLD_S;

  return (
    <div className="grid h-full grid-rows-[1fr_auto] gap-3 p-3">
      <div
        className="relative m-auto max-h-full min-h-0 w-full max-w-full overflow-hidden rounded-panel bg-black"
        // La largeur est prise, le ratio en déduit la hauteur, et max-h la borne en
        // réduisant la largeur d'autant. On tient l'image entière — la rogner ferait
        // mentir le cadre de visée sur ce qui est réellement conservé.
        style={{ aspectRatio: framing.aspectRatio }}
      >
        <img src={streamUrl} alt="" className="block h-full w-full" />
        <FramingGuide {...framing} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted">
          {framing.maskPercent > 0 ? "Cadrez-vous entre les pointillés" : ""}
        </span>
        <span className="text-sm text-muted">
          {showReturnHint && `Retour à l'accueil dans ${Math.ceil(remainingSeconds)} s`}
        </span>
        <GhostButton onClick={onCancel}>Annuler</GhostButton>
      </div>
    </div>
  );
}

/** Assombrit ce que le recadrage va retirer et matérialise la zone conservée. */
function FramingGuide({
  cropsWidth,
  maskPercent,
}: {
  cropsWidth: boolean;
  maskPercent: number;
}) {
  if (maskPercent <= 0) return null;

  const mask = <div className="bg-black/55" style={{ flex: `0 0 ${maskPercent}%` }} />;
  const border = cropsWidth
    ? "border-x-2 border-dashed border-white/65"
    : "border-y-2 border-dashed border-white/65";

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex ${cropsWidth ? "flex-row" : "flex-col"}`}
    >
      {mask}
      <div className={`flex-auto ${border}`} />
      {mask}
    </div>
  );
}
