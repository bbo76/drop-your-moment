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
  } = useKioskState();
  const system = mockSystemStatus(realSystem, debugFailure);

  useEffect(() => {
    if (!event) return;
    const root = document.documentElement;
    applyAccentTheme(event.accent_color);
    return () => {
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--color-accent-ink");
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
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a4 4 0 0 0-5 5L3.5 17.5a2.1 2.1 0 0 0 3 3l6.2-6.2a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z" />
      </svg>
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
    <aside className="fixed bottom-3 left-1/2 z-60 flex -translate-x-1/2 items-center gap-1 rounded-panel border-2 border-warn bg-ink p-1.5 text-body" aria-label="Simulation visuelle des pannes">
      <strong className="px-2 text-sm text-warn uppercase">Simulation</strong>
      {DEBUG_FAILURES.map((failure) => (
        <button
          key={failure.value}
          type="button"
          aria-pressed={value === failure.value}
          onClick={() => onChange(failure.value)}
          className="min-h-10 rounded-[0.55rem] px-3 font-semibold text-body aria-pressed:bg-warn aria-pressed:text-ink"
        >
          {failure.label}
        </button>
      ))}
    </aside>
  );
}
