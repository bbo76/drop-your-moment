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
import { applyAccentTheme, LAUNCH_FONT_FAMILIES } from "../shared/theme";
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
  } = useKioskState();
  const system = mockSystemStatus(realSystem, debugFailure);

  useEffect(() => {
    if (!event) return;
    const root = document.documentElement;
    applyAccentTheme(event.accent_color);
    root.style.setProperty("--font-launch", LAUNCH_FONT_FAMILIES[event.launch_font]);
    return () => {
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--color-accent-ink");
      root.style.removeProperty("--font-launch");
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
      className="maintenance-entry fixed top-4 right-4 z-40 grid size-14 place-items-center rounded-panel"
      aria-label="Ouvrir la maintenance"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a4 4 0 0 0-5 5L3.5 17.5a2.1 2.1 0 0 0 3 3l6.2-6.2a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z" />
      </svg>
      {system?.operator_attention && <span className="maintenance-attention" aria-hidden="true" />}
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
          {debugEnabled && <DebugFailureBar value={debugFailure} onChange={setDebugFailure} />}
          <Title>{event.launch_message}</Title>
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
      return <ConfirmationScreen printing={session.state === "printing"} photoUrl={session.photo_url} remainingSeconds={session.remaining_seconds} />;
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
    <aside className="debug-failure-bar" aria-label="Simulation visuelle des pannes">
      <strong>Simulation</strong>
      {DEBUG_FAILURES.map((failure) => (
        <button
          key={failure.value}
          type="button"
          aria-pressed={value === failure.value}
          onClick={() => onChange(failure.value)}
        >
          {failure.label}
        </button>
      ))}
    </aside>
  );
}
