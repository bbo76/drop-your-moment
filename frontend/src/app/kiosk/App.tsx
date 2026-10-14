import { ConfirmationScreen } from "@/features/kiosk/components/ConfirmationScreen";
import { PreviewScreen } from "@/features/kiosk/components/PreviewScreen";
import { ReviewScreen } from "@/features/kiosk/components/ReviewScreen";
import {
  CenteredScreen,
  GhostButton,
  Lede,
  Muted,
  PrimaryButton,
  Title,
} from "@/features/kiosk/components/Screen";
import { useKioskState } from "@/features/kiosk/useKioskState";
import { MaintenanceAccess } from "@/features/kiosk/components/MaintenanceAccess";
import { RemotePowerNotice } from "@/features/kiosk/components/RemotePowerNotice";
import { useCallback, useEffect, useState } from "react";
import { Pause, Printer, Wrench } from "lucide-react";
import { applyAccentTheme } from "@/utils/theme";
import {
  DEBUG_FAILURES,
  debugFailuresEnabled,
  mockSystemStatus,
  type DebugFailure,
} from "@/features/kiosk/debugFailures";

export function App() {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [debugFailure, setDebugFailure] = useState<DebugFailure>("none");
  const closeMaintenance = useCallback(() => setMaintenanceOpen(false), []);
  const debugEnabled = debugFailuresEnabled();
  const {
    session,
    system: realSystem,
    event,
    connection,
    start,
    cancel,
    prepareCapture,
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

  if (session?.power_transition) {
    return <RemotePowerNotice transition={session.power_transition} />;
  }

  if (maintenanceOpen) {
    return (
      <>
        <MaintenanceAccess
          debugFailure={debugFailure}
          onExit={closeMaintenance}
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
        {maintenanceButton}
        <Title>Hors service</Title>
        <Lede>La borne ne parvient pas à démarrer.</Lede>
        <Muted>Prévenez l’organisateur ou ouvrez la maintenance.</Muted>
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
      if (event.capture_paused) {
        return (
          <CenteredScreen>
            {maintenanceButton}
            <div className="grid size-24 place-items-center rounded-full border-2 border-edge text-signal" aria-hidden="true">
              <Pause className="size-11" fill="currentColor" strokeWidth={1.5} />
            </div>
            <div className="grid justify-items-center gap-3 font-modern">
              <h1 className="max-w-[15ch] text-balance text-6xl leading-[0.95] font-bold tracking-[-0.025em] sm:text-[4.75rem]">
                Je fais une petite pause
              </h1>
              <p className="max-w-[28ch] text-balance text-2xl leading-tight font-medium text-muted sm:text-3xl">
                {event.pause_message}
              </p>
            </div>
          </CenteredScreen>
        );
      }
      return (
        <div className="relative h-full overflow-hidden">
          <LaunchArabesque className="top-0 left-0" />
          <LaunchArabesque className="bottom-0 right-0 rotate-180" />
          <CenteredScreen>
            {maintenanceButton}
            <PrintNotice system={system} />
            {debugEnabled && <DebugFailureBar value={debugFailure} onChange={setDebugFailure} />}
            <div className="grid min-h-56 max-w-[60vw] place-items-center">
              <Title font={event.launch_font} large>{event.launch_message}</Title>
            </div>
            <PrimaryButton onClick={start} disabled={!system.camera_ok} large>
              Prendre une photo
            </PrimaryButton>
            {!system.camera_ok && (
              <p className="mt-4 rounded-panel bg-warn-bg px-4 py-3 text-sm text-warn">
                Caméra non détectée — prévenez l'organisateur.
              </p>
            )}
          </CenteredScreen>
        </div>
      );

    case "preview":
      return (
        <PreviewScreen
            printAspectRatio={event.print_aspect_ratio}
            overlayUrl={event.overlay_url}
            remainingSeconds={session.remaining_seconds}
            defaultShotTimerSeconds={event.default_shot_timer_seconds}
            onPrepareCapture={prepareCapture}
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
            printsRemaining={system.prints_remaining}
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
      return <ConfirmationScreen printing={session.state === "printing"} outputMode={session.output_mode} outputCopies={session.output_copies} photoUrl={session.photo_url} onContinue={start} />;
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

function LaunchArabesque({ className }: { className: string }) {
  return (
    <svg className={`launch-arabesque pointer-events-none absolute size-56 text-body max-[700px]:hidden ${className}`} viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <path className="arabesque-stem" d="M14 233 C46 206 73 177 84 145 C96 111 99 80 83 52 C71 30 51 25 38 39 C22 56 38 83 58 77 C72 73 74 57 62 52 C53 48 46 55 49 64" />
      <path className="arabesque-stem" d="M80 160 C55 143 37 118 39 93 C42 66 70 64 86 79 C105 97 98 122 79 126 C62 129 53 112 63 101 C71 93 83 99 81 109" />
      <path className="arabesque-stem" d="M84 149 C114 137 135 116 134 87 C133 66 111 52 105 33 C99 17 110 8 124 13 C140 19 142 36 131 43 C122 50 113 45 114 36" />
      <path className="arabesque-stem" d="M84 153 C116 162 153 151 165 126 C178 99 161 79 143 83 C126 87 121 108 134 116 C146 123 157 110 151 100" />
      <path className="arabesque-fine" d="M38 204 C57 171 57 150 43 136 C25 119 13 138 20 152 C25 161 37 157 38 149 M105 134 C131 117 155 115 178 118 C201 120 212 104 202 87 C195 76 182 78 180 88" />
      <path className="arabesque-fine" d="M35 85 C13 80 8 59 19 46 M52 82 C37 61 46 34 64 23 M120 133 C139 133 157 140 171 151" />
      <path className="arabesque-leaf" d="M30 99 C21 94 17 86 19 78 C27 80 32 87 30 99 Z M36 115 C25 113 19 107 17 100 C27 101 34 106 36 115 Z M48 132 C37 132 30 126 27 119 C39 119 46 123 48 132 Z M104 49 C95 41 94 31 98 24 C106 30 109 39 104 49 Z M121 59 C119 48 123 40 131 36 C132 46 129 54 121 59 Z" />
      <path className="arabesque-leaf" d="M158 133 C166 123 175 120 183 122 C178 131 170 136 158 133 Z M173 147 C183 141 193 142 199 147 C190 153 181 153 173 147 Z M42 172 C30 169 25 161 25 153 C35 156 41 162 42 172 Z" />
      <g className="arabesque-leaf-variant arabesque-leaf-variant--one">
        <path d="M28 67 C17 63 13 56 14 48 C24 51 29 58 28 67 Z M160 156 C168 154 173 157 176 163 C168 165 163 162 160 156 Z" />
      </g>
      <g className="arabesque-leaf-variant arabesque-leaf-variant--two">
        <path d="M28 68 C17 67 10 62 8 54 C19 54 26 58 28 68 Z M158 155 C169 148 177 149 183 154 C175 161 167 161 158 155 Z" />
      </g>
      <g className="arabesque-leaf-variant arabesque-leaf-variant--three">
        <path d="M29 69 C19 61 19 53 23 46 C30 52 33 60 29 69 Z M157 154 C165 150 172 152 176 158 C168 162 162 160 157 154 Z" />
      </g>
    </svg>
  );
}
