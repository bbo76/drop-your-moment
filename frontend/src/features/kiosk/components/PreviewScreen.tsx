import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { Camera, Home, X } from "lucide-react";

import { api, BLANK_PIXEL, previewStreamUrl, type AutofocusSettings, type ShotTimerSeconds } from "@/api/client";
import { scheduleCountdownStep, type CapturePhase } from "../captureTiming";
import { FramingGuide } from "./FramingGuide";

const RETURN_HINT_THRESHOLD_S = 20;
const DEFAULT_AUTOFOCUS_SETTINGS: AutofocusSettings = {
  mode: "continuous",
  range: "normal",
  speed: "fast",
  window: [1 / 3, 1 / 3, 1 / 3, 1 / 3],
};
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
  const [preparing, setPreparing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [focusWindow, setFocusWindow] = useState<AutofocusSettings["window"] | null>(null);
  const [focusLocked, setFocusLocked] = useState(false);
  const [focusDimmed, setFocusDimmed] = useState(false);
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusMessage, setFocusMessage] = useState<string | null>(null);

  // Figé à la première image du composant : recalculer l'URL à chaque rendu redémarrerait
  // le flux MJPEG.
  const [streamUrl] = useState(previewStreamUrl);
  const blurredPreview = useRef<HTMLImageElement>(null);
  const preview = useRef<HTMLImageElement>(null);

  useEffect(() => {
    void api.setAutofocusSettings(DEFAULT_AUTOFOCUS_SETTINGS).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!focusMessage || focusMessage === "Mise au point…") return;
    const timeout = setTimeout(() => setFocusMessage(null), 2500);
    return () => clearTimeout(timeout);
  }, [focusMessage]);

  useEffect(() => {
    if (!focusWindow || focusBusy || focusMessage === "Mise au point…") {
      setFocusDimmed(false);
      return;
    }
    const timeout = setTimeout(() => setFocusDimmed(true), 1500);
    return () => clearTimeout(timeout);
  }, [focusWindow, focusBusy, focusMessage]);

  // Le démontage ne ferme pas la connexion, contrairement à ce qu'on pourrait croire.
  // React retire l'`<img>` du DOM, mais Chromium garde la requête
  // `multipart/x-mixed-replace` en cours : le backend continue d'encoder des frames pour
  // un écran que plus personne ne regarde, la webcam reste retenue, et la page de santé
  // affiche un flux actif à vie — à raison. Il faut annuler la requête explicitement.
  useEffect(() => {
    const blurredImage = blurredPreview.current;
    const framedImage = preview.current;
    // React StrictMode rejoue setup → cleanup → setup en développement. Le setup doit
    // donc restaurer le flux que le premier cleanup vient volontairement d'annuler.
    if (blurredImage) blurredImage.src = streamUrl;
    if (framedImage) framedImage.src = streamUrl;
    return () => {
      if (blurredImage) blurredImage.src = BLANK_PIXEL;
      if (framedImage) framedImage.src = BLANK_PIXEL;
    };
  }, [streamUrl]);

  useEffect(() => {
    if (phase.kind !== "counting") return;

    return scheduleCountdownStep(phase, setPhase, async () => {
      try {
        await onCapture();
      } catch {
        setCaptureError(true);
        setPhase({ kind: "waiting" });
      }
    });
  }, [phase, onCapture]);

  const showReturnHint =
    phase.kind === "waiting" &&
    remainingSeconds !== null &&
    remainingSeconds <= RETURN_HINT_THRESHOLD_S;
  const afWindowStyle = focusWindow
    ? displayedAutofocusWindow(focusWindow, printAspectRatio)
    : null;

  const focusAtTouch = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (phase.kind !== "waiting" || focusBusy) return;
    const window = autofocusWindowAtPoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      printAspectRatio,
    );
    const settings: AutofocusSettings = {
      mode: "auto",
      range: "normal",
      speed: "fast",
      window,
    };
    setFocusWindow(window);
    setFocusBusy(true);
    setFocusMessage("Mise au point…");
    try {
      await api.setAutofocusSettings(settings);
      const result = await api.triggerAutofocus();
      setFocusLocked(result.focused);
      setFocusMessage(result.focused ? "Mise au point verrouillée" : "Point non confirmé · touchez à nouveau");
    } catch {
      setFocusLocked(false);
      setFocusMessage("Mise au point indisponible · réessayez");
    } finally {
      setFocusBusy(false);
    }
  };

  const resumeContinuousFocus = async () => {
    setFocusBusy(true);
    try {
      await api.setAutofocusSettings(DEFAULT_AUTOFOCUS_SETTINGS);
      setFocusLocked(false);
      setFocusWindow(null);
      setFocusMessage("Autofocus continu");
    } catch {
      setFocusMessage("Impossible de reprendre l’autofocus continu");
    } finally {
      setFocusBusy(false);
    }
  };

  return (
    <main className="relative h-full overflow-hidden bg-ink">
      <img
        ref={blurredPreview}
        src={streamUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-[1.08] object-cover blur-[18px] saturate-[0.78] opacity-80"
      />
      <div
        className="absolute inset-y-0 left-1/2 z-10 h-full -translate-x-1/2 overflow-hidden bg-black"
        style={{ aspectRatio: printAspectRatio }}
      >
        <img ref={preview} src={streamUrl} alt="" className="block h-full w-full object-cover" />
        <FramingGuide overlayUrl={overlayUrl} />
        <button
          type="button"
          aria-label="Aperçu caméra. Touchez le sujet pour faire la mise au point"
          disabled={phase.kind !== "waiting" || focusBusy}
          onClick={(event) => void focusAtTouch(event)}
          className="absolute inset-0 z-10 cursor-pointer bg-transparent p-0 disabled:cursor-default"
        />
        {focusWindow && afWindowStyle && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
            <div
              aria-hidden="true"
              className={`absolute rounded-[0.7rem] border-[3px] border-signal bg-signal/10 shadow-[0_0_0_2px_#101418] transition-opacity duration-700 ${focusDimmed ? "opacity-[0.14]" : "opacity-100"}`}
              style={afWindowStyle}
            />
            {focusLocked && phase.kind === "waiting" && (
              <button
                type="button"
                aria-label="Reprendre l’autofocus continu"
                title="Reprendre l’autofocus continu"
                disabled={focusBusy}
                onClick={() => void resumeContinuousFocus()}
                className="pointer-events-auto absolute z-30 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-signal/80 bg-ink/90 text-signal shadow-[0_1px_5px_#000] backdrop-blur-sm active:bg-ink disabled:opacity-50"
                style={{
                  left: `calc(${afWindowStyle.left} + ${afWindowStyle.width})`,
                  top: afWindowStyle.top,
                }}
              >
                <X aria-hidden="true" className="size-5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
        {focusMessage && phase.kind === "waiting" && (
          <p role="status" className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-panel bg-ink/90 px-4 py-2 text-center text-base font-semibold text-body">
            {focusMessage}
          </p>
        )}
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

      {phase.kind !== "waiting" && (
        <button
          type="button"
          aria-label="Annuler et revenir à l'accueil"
          onClick={() => {
            setPhase({ kind: "waiting" });
            onCancel();
          }}
          className="absolute right-6 top-5 z-20 grid size-14 cursor-pointer place-items-center rounded-full border-2 border-edge/90 bg-ink/70 text-body backdrop-blur-sm"
        >
          <Home aria-hidden="true" className="size-7" strokeWidth={2.25} />
        </button>
      )}

      {phase.kind === "waiting" && (
        <>
          <button
            type="button"
            aria-label="Prendre la photo"
            disabled={preparing}
            onClick={async () => {
              setPreparing(true);
              setCaptureError(false);
              try {
                await onPrepareCapture();
                setPhase({ kind: "counting", value: defaultShotTimerSeconds });
              } catch {
                setCaptureError(true);
              } finally {
                setPreparing(false);
              }
            }}
            className="absolute bottom-3 left-1/2 z-20 grid size-24 -translate-x-1/2 cursor-pointer place-items-center rounded-full border-4 border-ink bg-signal text-signal-ink transition-transform duration-150 active:scale-[0.94] disabled:opacity-50"
          >
            <Camera aria-hidden="true" className="size-11" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Retour à l'accueil"
            onClick={() => {
              setPhase({ kind: "waiting" });
              onCancel();
            }}
            className="absolute right-6 top-5 z-20 grid size-14 cursor-pointer place-items-center rounded-full border-2 border-edge/90 bg-ink/70 text-body backdrop-blur-sm transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
          >
            <Home aria-hidden="true" className="size-7" strokeWidth={2.25} />
          </button>
        </>
      )}

      {showReturnHint && (
            <p className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-panel bg-ink px-5 py-2 text-base font-medium text-body">
              Retour à l'accueil dans {Math.ceil(remainingSeconds)} s
            </p>
      )}

      {captureError && phase.kind === "waiting" && (
        <p role="alert" className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-panel bg-ink px-5 py-2 text-center text-base font-medium text-body">
          La capture n’a pas pu démarrer. Réessayez ou revenez à l’accueil.
        </p>
      )}

    </main>
  );
}

function displayedAutofocusWindow(
  [x, y, width, height]: [number, number, number, number],
  frameAspectRatio: number,
): CSSProperties {
  const streamAspectRatio = 16 / 9;
  const visibleWidth = Math.min(1, frameAspectRatio / streamAspectRatio);
  const visibleHeight = Math.min(1, streamAspectRatio / frameAspectRatio);
  const cropX = (1 - visibleWidth) / 2;
  const cropY = (1 - visibleHeight) / 2;
  return {
    left: `${((x - cropX) / visibleWidth) * 100}%`,
    top: `${((y - cropY) / visibleHeight) * 100}%`,
    width: `${(width / visibleWidth) * 100}%`,
    height: `${(height / visibleHeight) * 100}%`,
  };
}

function autofocusWindowAtPoint(
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  frameAspectRatio: number,
): AutofocusSettings["window"] {
  const streamAspectRatio = 16 / 9;
  const visibleWidth = Math.min(1, frameAspectRatio / streamAspectRatio);
  const visibleHeight = Math.min(1, streamAspectRatio / frameAspectRatio);
  const cropX = (1 - visibleWidth) / 2;
  const cropY = (1 - visibleHeight) / 2;
  const windowWidth = visibleWidth * 0.2;
  const windowHeight = visibleHeight * 0.2;
  const centerX = cropX + clamp((clientX - bounds.left) / bounds.width, 0, 1) * visibleWidth;
  const centerY = cropY + clamp((clientY - bounds.top) / bounds.height, 0, 1) * visibleHeight;
  return [
    clamp(centerX - windowWidth / 2, 0, 1 - windowWidth),
    clamp(centerY - windowHeight / 2, 0, 1 - windowHeight),
    windowWidth,
    windowHeight,
  ];
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
