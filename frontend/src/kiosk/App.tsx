import { ConfirmationScreen } from "./components/ConfirmationScreen";
import { PreviewScreen } from "./components/PreviewScreen";
import { ReviewScreen } from "./components/ReviewScreen";
import {
  CenteredScreen,
  GhostButton,
  Lede,
  Muted,
  PrimaryButton,
  Title,
} from "./components/Screen";
import { useKioskState } from "./useKioskState";
import { MaintenanceAccess } from "./components/MaintenanceAccess";
import { useEffect, useState } from "react";
import { Printer, Wrench } from "lucide-react";
import { applyAccentTheme } from "../shared/theme";
import {
  DEBUG_FAILURES,
  debugFailuresEnabled,
  mockSystemStatus,
  type DebugFailure,
} from "./debugFailures";

export function App() {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [debugFailure, setDebugFailure] = useState<DebugFailure>("none");
  const debugEnabled = debugFailuresEnabled();
  const {
    session,
    system: realSystem,
    event,
    connection,
    start,
    cancel,
    capture,
    chooseFilter,
    retake,
    keepPhoto,
    savePhoto,
  } = useKioskState();
  const system = mockSystemStatus(realSystem, debugFailure);
  const printingAvailable = Boolean(system?.printer_ok && system.prints_remaining > 0);

  useEffect(() => {
    if (!event) return;
    const root = document.documentElement;
    applyAccentTheme(event.accent_color);
    return () => {
      root.style.removeProperty("--color-signal");
      root.style.removeProperty("--color-signal-ink");
    };
  }, [event]);

  if (maintenanceOpen) {
    return (
      <>
        <MaintenanceAccess
          debugFailure={debugFailure}
          onExit={() => setMaintenanceOpen(false)}
        />
        {debugEnabled && <DebugFailureBar value={debugFailure} onChange={setDebugFailure} />}
      </>
    );
  }

  const maintenanceButton = (
    <button
      type="button"
      onClick={() => setMaintenanceOpen(true)}
      className="fixed top-4 right-4 z-40 grid size-14 place-items-center rounded-panel border-2 border-[color-mix(in_srgb,var(--color-body)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-ink)_78%,transparent)] text-body"
      aria-label="Ouvrir la maintenance"
    >
      <Wrench className="size-7" strokeWidth={2} />
      {system?.operator_attention && <span className="absolute -top-[0.3rem] -right-[0.3rem] size-4 rounded-full border-[3px] border-ink bg-warn" aria-hidden="true" />}
      {system?.operator_attention && <span className="sr-only">Une intervention est à vérifier</span>}
    </button>
  );

  if (connection === "offline") {
    return (
      <CenteredScreen>
        <Title>Hors service</Title>
        <Lede>Le backend ne répond pas.</Lede>
        <Muted>Prévenez l'organisateur.</Muted>
      </CenteredScreen>
    );
  }

  if (!session || !system || !event) {
    return (
      <CenteredScreen>
        <Muted>Démarrage…</Muted>
      </CenteredScreen>
    );
  }

  switch (session.state) {
    case "idle":
      return (
        <CenteredScreen>
          {maintenanceButton}
          <PrintNotice system={system} />
          {debugEnabled && <DebugFailureBar value={debugFailure} onChange={setDebugFailure} />}
          <Title font={event.launch_font}>{event.launch_message}</Title>
          <Lede>Touchez l'écran pour prendre une photo</Lede>
          <PrimaryButton onClick={start} disabled={!system.camera_ok}>
            Commencer
          </PrimaryButton>
          {!system.camera_ok && (
            <p className="mt-4 rounded-panel bg-warn-bg px-4 py-3 text-sm text-warn">
              Caméra non détectée — prévenez l'organisateur.
            </p>
          )}
        </CenteredScreen>
      );

    case "preview":
      return (
        <PreviewScreen
            previewSize={system.preview_size}
            printAspectRatio={event.print_aspect_ratio}
            overlayUrl={event.overlay_url}
            remainingSeconds={session.remaining_seconds}
            defaultShotTimerSeconds={event.default_shot_timer_seconds}
            screenFlashEnabled={event.screen_flash_enabled}
            onCapture={capture}
            onCancel={cancel}
          />
      );

    case "review":
      // photo_url est renseigné dès la capture, mais la boucle de polling peut livrer un
      // état `review` une fraction de seconde avant la réponse de capture.
      return session.photo_url ? (
        <ReviewScreen
            photoUrl={session.photo_url}
            availableFilters={event.available_filters}
            selectedFilter={session.selected_filter}
            remainingSeconds={session.remaining_seconds}
            onChooseFilter={chooseFilter}
            onRetake={retake}
            onKeep={keepPhoto}
            onSave={savePhoto}
            printingAvailable={printingAvailable}
          />
      ) : (
        <CenteredScreen>
          <Muted>Développement de votre photo…</Muted>
        </CenteredScreen>
      );

    case "error":
      return (
        <CenteredScreen>
          <Title>Oups</Title>
          <Lede>Impossible de continuer. Réessayez dans un instant.</Lede>
          <GhostButton onClick={cancel}>Retour à l'accueil</GhostButton>
        </CenteredScreen>
      );

    case "printing":
    case "done":
      return <ConfirmationScreen printing={session.state === "printing"} outputMode={session.output_mode} photoUrl={session.photo_url} remainingSeconds={session.remaining_seconds} />;
  }
}

function DebugFailureBar({
  value,
  onChange,
}: {
  value: DebugFailure;
  onChange: (failure: DebugFailure) => void;
}) {
  return (
    <aside className="fixed bottom-3 left-1/2 z-60 flex -translate-x-1/2 items-center gap-3 rounded-panel border-2 border-warn bg-ink p-2 text-body">
      <label htmlFor="debug-failure" className="px-1 text-sm font-bold text-warn uppercase">Simulation</label>
      <select
        id="debug-failure"
        value={value}
        onChange={(event) => onChange(event.target.value as DebugFailure)}
        className="min-h-11 min-w-64 rounded-[0.55rem] border-2 border-edge bg-surface px-3 text-base font-semibold text-body"
      >
        {DEBUG_FAILURES.map((failure) => <option key={failure.value} value={failure.value}>{failure.label}</option>)}
      </select>
    </aside>
  );
}

function PrintNotice({ system }: { system: NonNullable<ReturnType<typeof mockSystemStatus>> }) {
  if (system.printer_ok && system.prints_remaining > 5) return null;

  const message = !system.printer_ok
    ? "Imprimante déconnectée"
    : system.prints_remaining === 0
      ? "Impression indisponible"
      : system.prints_remaining <= 2
        ? `Plus que ${system.prints_remaining} tirages`
        : `${system.prints_remaining} tirages restants`;

  return (
    <div className="fixed top-4 right-20 flex min-h-14 items-center gap-2.5 rounded-panel border-2 border-warn bg-warn-bg px-4 text-base font-semibold text-warn" role="status">
      <Printer className="size-5" aria-hidden="true" />
      {message}
    </div>
  );
}
