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

export function App() {
  const {
    session,
    system,
    event,
    connection,
    start,
    cancel,
    capture,
    chooseFilter,
    retake,
    keepPhoto,
  } = useKioskState();

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
          <Title>{event.event_name}</Title>
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
      return (
        <ConfirmationScreen
          printing={session.state === "printing"}
          photoUrl={session.photo_url}
          remainingSeconds={session.remaining_seconds}
        />
      );
  }
}
