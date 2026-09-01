import { useEffect, useRef, useState, type CSSProperties } from "react";

import { BLANK_PIXEL, previewStreamUrl, type ShotTimerSeconds } from "../../shared/api";
import { computeFraming, FramingGuide } from "./FramingGuide";
import { GhostButton, PrimaryButton } from "./Screen";

const RETURN_HINT_THRESHOLD_S = 20;
const COUNTDOWN_STEP_MS = 1000;
const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];

interface Props {
  previewSize: [number, number];
  printAspectRatio: number;
  overlayUrl: string | null;
  remainingSeconds: number | null;
  defaultShotTimerSeconds: ShotTimerSeconds;
  screenFlashEnabled: boolean;
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
  overlayUrl,
  remainingSeconds,
  defaultShotTimerSeconds,
  screenFlashEnabled,
  onCapture,
  onCancel,
}: Props) {
  const framing = computeFraming(previewSize, printAspectRatio);
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });
  const [shotTimerSeconds, setShotTimerSeconds] = useState(defaultShotTimerSeconds);

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
    <main className="grid h-full grid-rows-[1fr_auto] gap-3 bg-black p-3">
      <div
        className="relative m-auto h-full max-h-full min-h-0 w-auto max-w-full overflow-hidden rounded-panel bg-black"
        // La hauteur disponible est prise et le ratio en déduit la largeur. On tient
        // l'image entière sans l'étirer — la rogner ferait
        // mentir le cadre de visée sur ce qui est réellement conservé.
        style={{ aspectRatio: framing.aspectRatio }}
      >
        <img ref={preview} src={streamUrl} alt="" className="block h-full w-full" />
        <FramingGuide {...framing} overlayUrl={overlayUrl} />

        {phase.kind === "counting" && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center">
            <CountdownNumber value={phase.value} />
          </div>
        )}

        {/* Flash logiciel : un éclairage d'appoint gratuit sur une borne, et le signal
            que la photo est prise. */}
        {phase.kind === "capturing" && screenFlashEnabled && (
          <div className="pointer-events-none absolute inset-0 bg-white" />
        )}
      </div>

      <div className="relative grid min-h-22 grid-cols-[minmax(0,1fr)_auto_14rem_8rem] items-center gap-3 rounded-panel bg-ink p-3 max-[900px]:gap-2 max-[900px]:p-2 [&>button]:w-full">
        <span className="text-lg leading-tight font-medium tracking-[0.01em] text-muted max-[900px]:max-w-36 max-[900px]:text-base">
          {framing.maskPercent > 0 && phase.kind === "waiting"
            ? "La zone nette sera conservée"
            : ""}
        </span>

        {phase.kind === "waiting" ? (
          <fieldset>
            <legend className="sr-only">Durée du minuteur</legend>
            <div className="flex h-16 items-stretch rounded-panel border-2 border-edge bg-surface p-1">
              {SHOT_TIMER_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  aria-pressed={shotTimerSeconds === seconds}
                  onClick={() => setShotTimerSeconds(seconds)}
                  className={`min-h-13 min-w-14 cursor-pointer rounded-lg px-3 text-lg font-bold tabular-nums transition-[background-color,color,transform] duration-150 active:scale-[0.97] max-[900px]:min-w-12 max-[900px]:px-2 ${
                    shotTimerSeconds === seconds
                      ? "bg-signal text-signal-ink"
                      : "text-body"
                  }`}
                >
                  {seconds} s
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <span className="capture-cue pointer-events-none absolute inset-0 grid place-items-center text-3xl leading-[1.08] font-bold tracking-[-0.02em] text-signal">
            Souriez…
          </span>
        )}

        {phase.kind === "waiting" && (
          <PrimaryButton
            onClick={() => setPhase({ kind: "counting", value: shotTimerSeconds })}
          >
            Prendre la photo
          </PrimaryButton>
        )}

        <span className="flex items-center justify-end gap-3">
          <span className="text-base leading-[1.3] font-normal text-muted max-[900px]:hidden">
            {showReturnHint && `Retour à l'accueil dans ${Math.ceil(remainingSeconds)} s`}
          </span>
          {phase.kind === "waiting" && <GhostButton onClick={onCancel}>Annuler</GhostButton>}
        </span>
      </div>
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
