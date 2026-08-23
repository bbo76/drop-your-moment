import { useEffect, useRef, useState } from "react";

import { BLANK_PIXEL, previewStreamUrl, type ShotTimerSeconds } from "../../shared/api";
import { computeFraming, FramingGuide } from "./FramingGuide";
import { GhostButton, PrimaryButton } from "./Screen";

const RETURN_HINT_THRESHOLD_S = 20;
const COUNTDOWN_STEP_MS = 1000;
const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];

interface Props {
  previewSize: [number, number];
  printAspectRatio: number;
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
        className="relative m-auto max-h-full min-h-0 w-full max-w-full overflow-hidden rounded-panel bg-black"
        // La largeur est prise, le ratio en déduit la hauteur, et max-h la borne en
        // réduisant la largeur d'autant. On tient l'image entière — la rogner ferait
        // mentir le cadre de visée sur ce qui est réellement conservé.
        style={{ aspectRatio: framing.aspectRatio }}
      >
        <img ref={preview} src={streamUrl} alt="" className="block h-full w-full" />
        <FramingGuide {...framing} />

        {phase.kind === "counting" && (
          <div className="pointer-events-none absolute inset-0 grid place-content-center">
            <span
              // `key` remonté à chaque chiffre pour rejouer l'animation d'apparition.
              key={phase.value}
              className="capture-countdown text-[30vmin] font-black"
            >
              {phase.value}
            </span>
          </div>
        )}

        {/* Flash logiciel : un éclairage d'appoint gratuit sur une borne, et le signal
            que la photo est prise. */}
        {phase.kind === "capturing" && screenFlashEnabled && (
          <div className="pointer-events-none absolute inset-0 bg-white" />
        )}
      </div>

      <div className="preview-action-bar relative grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-panel bg-ink p-3">
        <span className="preview-framing-hint type-kiosk-label text-lg leading-tight text-muted">
          {framing.maskPercent > 0 && phase.kind === "waiting"
            ? "Cadrez-vous entre les pointillés"
            : ""}
        </span>

        {phase.kind === "waiting" ? (
          <fieldset>
            <legend className="sr-only">Durée du minuteur</legend>
            <div className="shot-timer-control flex rounded-panel border-2 border-edge bg-surface p-1">
              {SHOT_TIMER_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  aria-pressed={shotTimerSeconds === seconds}
                  onClick={() => setShotTimerSeconds(seconds)}
                  className={`timer-choice type-kiosk-data min-w-14 rounded-lg px-3 text-lg ${
                    shotTimerSeconds === seconds
                      ? "bg-accent text-accent-ink"
                      : "text-body"
                  }`}
                >
                  {seconds} s
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <span className="pointer-events-none absolute inset-0 grid place-items-center type-kiosk-screen-title text-3xl text-accent">
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
          <span className="preview-return-hint type-kiosk-meta text-base text-muted">
            {showReturnHint && `Retour à l'accueil dans ${Math.ceil(remainingSeconds)} s`}
          </span>
          {phase.kind === "waiting" && <GhostButton onClick={onCancel}>Annuler</GhostButton>}
        </span>
      </div>
    </main>
  );
}
