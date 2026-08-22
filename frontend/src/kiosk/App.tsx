import { PreviewScreen } from "./components/PreviewScreen";
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
  const { session, system, connection, start, cancel } = useKioskState();

  if (connection === "offline") {
    return (
      <CenteredScreen>
        <Title>Hors service</Title>
        <Lede>Le backend ne répond pas.</Lede>
        <Muted>Prévenez l'organisateur.</Muted>
      </CenteredScreen>
    );
  }

  if (!session || !system) {
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
          <Title>Drop Your Moment</Title>
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
          system={system}
          remainingSeconds={session.remaining_seconds}
          onCancel={cancel}
        />
      );

    case "error":
      return (
        <CenteredScreen>
          <Title>Oups</Title>
          <Lede>Impossible de continuer. Réessayez dans un instant.</Lede>
          <GhostButton onClick={cancel}>Retour à l'accueil</GhostButton>
        </CenteredScreen>
      );

    // Ces états existent déjà côté serveur mais n'ont pas encore d'écran : la capture
    // arrive au jalon 2. On le dit clairement au lieu d'afficher un écran vide.
    case "review":
    case "printing":
    case "done":
      return (
        <CenteredScreen>
          <Muted>État « {session.state} » — écran pas encore implémenté.</Muted>
          <GhostButton onClick={cancel}>Retour à l'accueil</GhostButton>
        </CenteredScreen>
      );
  }
}
