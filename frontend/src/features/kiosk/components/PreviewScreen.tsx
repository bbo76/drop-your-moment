import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, Home } from "lucide-react";

import { BLANK_PIXEL, previewStreamUrl, type ShotTimerSeconds } from "@/api/client";
import { scheduleCountdownStep, type CapturePhase } from "../captureTiming";
import { FramingGuide } from "./FramingGuide";

const RETURN_HINT_THRESHOLD_S = 20;
interface Props {
  printAspectRatio: number;
  overlayUrl: string | null;
  remainingSeconds: number | null;
  defaultShotTimerSeconds: ShotTimerSeconds;
  onPrepareCapture: () => Promise<void>;
  onCapture: () => Promise<void>;
  onCancel: () => void;
}

/* Le décompte vit ici, pas dans la machine à états du serveur.
 *
 * C'est un choix : il ne pilote rien côté backend, ne survit pas à un rechargement de
 * page, et le faire remonter jusqu'au serveur imposerait un aller-retour par seconde
 * pour un effet purement visuel. Le déclenchement réel, lui, reste une transition
 * serveur. */
export function PreviewScreen({
  printAspectRatio,
  overlayUrl,
  remainingSeconds,
  defaultShotTimerSeconds,
  onPrepareCapture,
  onCapture,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<CapturePhase>({ kind: "waiting" });

  // Figé à la première image du composant : recalculer l'URL à chaque rendu redémarrerait
  // le flux MJPEG.
  const [streamUrl] = useState(previewStreamUrl);
  const preview = useRef<HTMLImageElement>(null);

  // Le démontage ne ferme pas la connexion, contrairement à ce qu'on pourrait croire.
  // React retire l'`<img>` du DOM, mais Chromium garde la requête
  // `multipart/x-mixed-replace` en cours : le backend continue d'encoder des frames pour
  // un écran que plus personne ne regarde, la webcam reste retenue, et la page de santé
  // affiche un flux actif à vie — à raison. Il faut annuler la requête explicitement.
  useEffect(() => {
    const image = preview.current;
    // React StrictMode rejoue setup → cleanup → setup en développement. Le setup doit
    // donc restaurer le flux que le premier cleanup vient volontairement d'annuler.
    if (image) image.src = streamUrl;
    return () => {
      if (image) image.src = BLANK_PIXEL;
    };
  }, [streamUrl]);

  useEffect(() => {
    if (phase.kind !== "counting") return;

    return scheduleCountdownStep(phase, setPhase, () => {
      void onCapture();
    });
  }, [phase, onCapture]);

  const showReturnHint =
    phase.kind === "waiting" &&
    remainingSeconds !== null &&
    remainingSeconds <= RETURN_HINT_THRESHOLD_S;

  return (
    <main className={`relative h-full overflow-hidden bg-ink ${phase.kind === "counting" ? "countdown-breath" : ""}`}>
      <div
        className="absolute inset-y-0 left-1/2 h-full -translate-x-1/2 overflow-hidden bg-black"
        // Ce rectangle est le fichier final : `object-cover` reproduit exactement le
        // recadrage central du pipeline, puis l'overlay en épouse les quatre bords.
        style={{ aspectRatio: printAspectRatio }}
      >
        <img ref={preview} src={streamUrl} alt="" className="block h-full w-full object-cover" />
        <FramingGuide overlayUrl={overlayUrl} />

        {phase.kind === "counting" && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center">
            <CountdownNumber value={phase.value} />
          </div>
        )}
        {phase.kind === "capturing" && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center">
            <CountdownNumber value={0} />
          </div>
        )}
      </div>

      {phase.kind === "waiting" && (
        <>
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-end gap-6">
            <span aria-hidden="true" className="size-14" />
            <button
              type="button"
              aria-label="Prendre la photo"
              onClick={() => {
                void onPrepareCapture();
                setPhase({ kind: "counting", value: defaultShotTimerSeconds });
              }}
              className="grid size-24 cursor-pointer place-items-center rounded-full border-4 border-ink bg-signal text-signal-ink transition-transform duration-150 active:scale-[0.94]"
            >
              <Camera aria-hidden="true" className="size-11" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Retour à l'accueil"
              onClick={onCancel}
              className="grid size-14 cursor-pointer place-items-center rounded-full border-2 border-edge bg-surface text-body transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
            >
              <Home aria-hidden="true" className="size-7" strokeWidth={2.25} />
            </button>
          </div>
        </>
      )}

      {showReturnHint && (
            <p className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-panel bg-ink px-5 py-2 text-base font-medium text-body">
              Retour à l'accueil dans {Math.ceil(remainingSeconds)} s
            </p>
      )}

    </main>
  );
}

function CountdownNumber({ value }: { value: number }) {
  return (
    <span className="relative grid size-[1.08em] place-items-center overflow-hidden rounded-[0.12em] bg-signal text-[30vmin] leading-none font-black text-signal-ink">
      <span
        className="countdown-reel"
        style={{ "--countdown-value": value } as CSSProperties}
        aria-hidden="true"
      />
      <span className="sr-only" aria-live="polite">{value}</span>
    </span>
  );
}
