import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, Home, Timer } from "lucide-react";

import { BLANK_PIXEL, previewStreamUrl, type ShotTimerSeconds } from "@/api/client";
import { scheduleCountdownStep, type CapturePhase } from "../captureTiming";
import { FramingGuide } from "./FramingGuide";

const RETURN_HINT_THRESHOLD_S = 20;
const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];

interface Props {
  printAspectRatio: number;
  overlayUrl: string | null;
  remainingSeconds: number | null;
  defaultShotTimerSeconds: ShotTimerSeconds;
  screenFlashEnabled: boolean;
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
  screenFlashEnabled,
  onPrepareCapture,
  onCapture,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<CapturePhase>({ kind: "waiting" });
  const [shotTimerSeconds, setShotTimerSeconds] = useState(defaultShotTimerSeconds);
  const [timerOpen, setTimerOpen] = useState(false);

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
      // Le flash est affiché avant l'appel réseau, pas après : il doit coïncider avec
      // l'instant où le visiteur croit que la photo est prise.
      void onCapture();
    });
  }, [phase, onCapture]);

  const showReturnHint =
    phase.kind === "waiting" &&
    remainingSeconds !== null &&
    remainingSeconds <= RETURN_HINT_THRESHOLD_S;

  return (
    <main className="relative h-full overflow-hidden bg-ink">
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
      </div>

      {phase.kind === "waiting" && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-end gap-6">
          <fieldset className="relative justify-self-start">
            <legend className="sr-only">Durée du minuteur</legend>
            <div
              id="shot-timer-options"
              aria-hidden={!timerOpen}
              className={`absolute bottom-16 left-1/2 grid -translate-x-1/2 grid-cols-3 gap-1.5 transition-[opacity,transform] duration-180 ease-out motion-reduce:transition-none ${
                timerOpen
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              {SHOT_TIMER_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  disabled={!timerOpen}
                  aria-pressed={shotTimerSeconds === seconds}
                  onClick={() => {
                    setShotTimerSeconds(seconds);
                    setTimerOpen(false);
                  }}
                  className={`size-14 cursor-pointer rounded-full border-2 text-lg font-bold tabular-nums transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                    shotTimerSeconds === seconds
                      ? "border-signal bg-signal text-signal-ink"
                      : "border-edge bg-surface text-body"
                  }`}
                >
                  {seconds}<span className="text-sm font-medium"> s</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label={`Minuteur, ${shotTimerSeconds} secondes`}
              aria-expanded={timerOpen}
              aria-controls="shot-timer-options"
              onClick={() => setTimerOpen((open) => !open)}
              className={`grid size-14 cursor-pointer place-items-center rounded-full border-2 bg-surface text-body transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                timerOpen ? "border-signal text-signal" : "border-edge"
              }`}
            >
              <Timer aria-hidden="true" className="size-7" strokeWidth={2.25} />
            </button>
          </fieldset>
          <button
            type="button"
            aria-label="Prendre la photo"
            onClick={() => {
              void onPrepareCapture();
              setPhase({ kind: "counting", value: shotTimerSeconds });
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
      )}

      {phase.kind === "waiting" && (
        <>

          {showReturnHint && (
            <p className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-panel bg-ink px-5 py-2 text-base font-medium text-body">
              Retour à l'accueil dans {Math.ceil(remainingSeconds)} s
            </p>
          )}
        </>
      )}

      {/* Le flash couvre désormais toute la dalle, pas seulement le futur tirage. */}
      {phase.kind === "capturing" && screenFlashEnabled && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-white" />
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
