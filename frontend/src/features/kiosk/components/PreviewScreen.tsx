import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, Crosshair, Home, SlidersHorizontal } from "lucide-react";

import { api, BLANK_PIXEL, previewStreamUrl, type CameraDiagnostics, type ShotTimerSeconds } from "@/api/client";
import { scheduleCountdownStep, type CapturePhase } from "../captureTiming";
import { AutofocusDebugPanel } from "./AutofocusDebugPanel";
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
  const [preparing, setPreparing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cameraDiagnostics, setCameraDiagnostics] = useState<CameraDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState(false);

  // Figé à la première image du composant : recalculer l'URL à chaque rendu redémarrerait
  // le flux MJPEG.
  const [streamUrl] = useState(previewStreamUrl);
  const blurredPreview = useRef<HTMLImageElement>(null);
  const preview = useRef<HTMLImageElement>(null);

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

  useEffect(() => {
    if (!debugOpen) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const fresh = await api.cameraDiagnostics();
        if (active) {
          setCameraDiagnostics(fresh);
          setDiagnosticsError(false);
        }
      } catch {
        if (active) setDiagnosticsError(true);
      } finally {
        if (active) timer = setTimeout(refresh, 500);
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [debugOpen]);

  const showReturnHint =
    phase.kind === "waiting" &&
    remainingSeconds !== null &&
    remainingSeconds <= RETURN_HINT_THRESHOLD_S;
  const afWindowStyle = cameraDiagnostics?.autofocus_settings?.window
    ? displayedAutofocusWindow(cameraDiagnostics.autofocus_settings.window, printAspectRatio)
    : null;

  return (
    <main className="relative h-full overflow-hidden bg-ink">
      <button
        type="button"
        aria-label={debugOpen ? "Fermer le diagnostic autofocus" : "Afficher le diagnostic autofocus"}
        aria-pressed={debugOpen}
        onClick={() => setDebugOpen((open) => !open)}
        className="absolute left-6 top-5 z-30 flex h-12 items-center gap-1.5 rounded-panel border-2 border-edge/90 bg-ink/80 px-3 text-body backdrop-blur-sm aria-pressed:border-signal aria-pressed:text-signal"
      >
        <Crosshair className="size-5" aria-hidden="true" />
        <span className="text-sm font-bold">AF</span>
      </button>
      {debugOpen && (
        <aside
          className="pointer-events-none absolute inset-0 z-30"
          aria-label="Diagnostic autofocus"
          style={{
            color: "#ffd400",
            WebkitTextStroke: "1px #101418",
            paintOrder: "stroke fill",
            textShadow: "0 2px 4px #000, 0 0 8px #000",
          }}
        >
          {diagnosticsError ? (
            <p className="absolute left-4 top-1/2 w-[26%] -translate-y-1/2 text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight font-bold">
              Diagnostic indisponible
            </p>
          ) : cameraDiagnostics ? (
            <>
              <dl className="absolute left-4 top-1/2 w-[26%] max-w-[15rem] -translate-y-1/2 space-y-5 text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight font-bold">
                <div>
                  <dt className="text-[0.8em] uppercase">Autofocus</dt>
                  <dd className="text-[1.25em]">{autofocusLabel(cameraDiagnostics.autofocus_state)}</dd>
                </div>
                <div>
                  <dt className="text-[0.8em] uppercase">Netteté</dt>
                  <dd className="text-[1.25em]">{cameraDiagnostics.focus_fom?.toFixed(0) ?? "—"}</dd>
                </div>
              </dl>
              <dl className="absolute right-4 top-1/2 w-[26%] max-w-[15rem] -translate-y-1/2 space-y-5 text-right text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight font-bold">
                <div>
                  <dt className="text-[0.8em] uppercase">Distance estimée</dt>
                  <dd className="text-[1.25em]">
                    {cameraDiagnostics.lens_position && cameraDiagnostics.lens_position > 0
                      ? `~${Math.round(100 / cameraDiagnostics.lens_position)} cm`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.8em] uppercase">Lentille</dt>
                  <dd>{cameraDiagnostics.lens_position === null ? "—" : `${cameraDiagnostics.lens_position.toFixed(2)} D`}</dd>
                  <dd className="text-[0.8em]">
                    {cameraDiagnostics.exposure_time_us === null ? "—" : `${(cameraDiagnostics.exposure_time_us / 1000).toFixed(1)} ms`}
                    {" · "}
                    {cameraDiagnostics.analogue_gain?.toFixed(1) ?? "—"}× gain
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="absolute left-4 top-1/2 w-[26%] -translate-y-1/2 text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight font-bold">
              Lecture autofocus…
            </p>
          )}
        </aside>
      )}
      {debugOpen && phase.kind === "waiting" && (
        <button
          type="button"
          aria-label={settingsOpen ? "Masquer les réglages autofocus" : "Régler l’autofocus"}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
          className="absolute left-28 top-5 z-40 flex h-12 items-center gap-2 rounded-panel border-2 border-edge bg-ink/90 px-3 text-body"
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          <span className="text-base font-bold">Régler</span>
        </button>
      )}
      <img
        ref={blurredPreview}
        src={streamUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-[1.08] object-cover blur-[18px] saturate-[0.78] opacity-80"
      />
      <div
        className="absolute inset-y-0 left-1/2 z-10 h-full -translate-x-1/2 overflow-hidden bg-black"
        // Ce rectangle est le fichier final : `object-cover` reproduit exactement le
        // recadrage central du pipeline, puis l'overlay en épouse les quatre bords.
        style={{ aspectRatio: printAspectRatio }}
      >
        <img ref={preview} src={streamUrl} alt="" className="block h-full w-full object-cover" />
        <FramingGuide overlayUrl={overlayUrl} />
        {debugOpen && afWindowStyle && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
            <div className="absolute border-[3px] border-signal bg-signal/10" style={afWindowStyle}>
              <span className="absolute -top-8 left-0 rounded-t bg-ink px-2 py-1 text-sm font-bold text-signal">ZONE AF</span>
            </div>
          </div>
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

      {debugOpen && settingsOpen && phase.kind === "waiting" && (
        <AutofocusDebugPanel
          settings={cameraDiagnostics?.autofocus_settings ?? null}
          supported={cameraDiagnostics?.autofocus_controls_supported ?? false}
          onApply={async (settings) => {
            const applied = await api.setAutofocusSettings(settings);
            setCameraDiagnostics((current) => current ? { ...current, autofocus_settings: applied } : current);
          }}
          onTrigger={async () => {
            const result = await api.triggerAutofocus();
            const fresh = await api.cameraDiagnostics();
            setCameraDiagnostics(fresh);
            return result.focused;
          }}
        />
      )}

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
                setSettingsOpen(false);
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
            <p className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-panel bg-ink px-5 py-2 text-base font-medium text-body">
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

function autofocusLabel(state: string | null) {
  return ({ idle: "au repos", scanning: "recherche…", focused: "net", failed: "échec" } as Record<string, string>)[state ?? ""] ?? state ?? "—";
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
