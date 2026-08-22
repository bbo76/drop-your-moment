import { useEffect, useState } from "react";

import { previewStreamUrl } from "../../shared/api";
import { computeFraming } from "../../shared/framing";
import { FramingGuide } from "./FramingGuide";
import { GhostButton, PrimaryButton } from "./Screen";

const RETURN_HINT_THRESHOLD_S = 20;
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1000;

interface Props {
  previewSize: [number, number];
  printAspectRatio: number;
  remainingSeconds: number | null;
  onCapture: () => Promise<void>;
  onCancel: () => void;
}

/* Le décompte vit ici, pas dans la machine à états du serveur.
 *
 * C'est un choix : il ne pilote rien côté backend, ne survit pas à un rechargement de
 * page, et le faire remonter jusqu'au serveur imposerait un aller-retour par seconde
 * pour un effet purement visuel. Le déclenchement réel, lui, reste une transition
 * serveur. */
type Phase =
  | { kind: "waiting" }
  | { kind: "counting"; value: number }
  | { kind: "capturing" };

export function PreviewScreen({
  previewSize,
  printAspectRatio,
  remainingSeconds,
  onCapture,
  onCancel,
}: Props) {
  const framing = computeFraming(previewSize, printAspectRatio);
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });

  // Figé à la première image du composant : recalculer l'URL à chaque rendu
  // redémarrerait le flux MJPEG. Le montage et le démontage du composant suffisent à
  // ouvrir et fermer la connexion — React s'en charge quand on quitte cet écran.
  const [streamUrl] = useState(previewStreamUrl);

  useEffect(() => {
    if (phase.kind !== "counting") return;

    const timer = setTimeout(() => {
      if (phase.value > 1) {
        setPhase({ kind: "counting", value: phase.value - 1 });
        return;
      }
      // Le flash est affiché avant l'appel réseau, pas après : il doit coïncider avec
      // l'instant où le visiteur croit que la photo est prise.
      setPhase({ kind: "capturing" });
      void onCapture();
    }, COUNTDOWN_STEP_MS);

    return () => clearTimeout(timer);
  }, [phase, onCapture]);

  const showReturnHint =
    phase.kind === "waiting" &&
    remainingSeconds !== null &&
    remainingSeconds <= RETURN_HINT_THRESHOLD_S;

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

        {phase.kind === "counting" && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center">
            <span
              // `key` remonté à chaque chiffre pour rejouer l'animation d'apparition.
              key={phase.value}
              className="animate-[ping_1s_ease-out_1] text-[22vmin] leading-none font-bold text-white drop-shadow-[0_0_2rem_rgba(0,0,0,0.9)]"
            >
              {phase.value}
            </span>
          </div>
        )}

        {/* Flash logiciel : un éclairage d'appoint gratuit sur une borne, et le signal
            que la photo est prise. */}
        {phase.kind === "capturing" && (
          <div className="pointer-events-none absolute inset-0 bg-white" />
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted">
          {framing.maskPercent > 0 && phase.kind === "waiting"
            ? "Cadrez-vous entre les pointillés"
            : ""}
        </span>

        {phase.kind === "waiting" ? (
          <PrimaryButton onClick={() => setPhase({ kind: "counting", value: COUNTDOWN_FROM })}>
            Prendre la photo
          </PrimaryButton>
        ) : (
          <span className="text-sm text-muted">Souriez…</span>
        )}

        <span className="flex items-center gap-4">
          <span className="text-sm text-muted">
            {showReturnHint && `Retour à l'accueil dans ${Math.ceil(remainingSeconds)} s`}
          </span>
          {phase.kind === "waiting" && <GhostButton onClick={onCancel}>Annuler</GhostButton>}
        </span>
      </div>
    </div>
  );
}
