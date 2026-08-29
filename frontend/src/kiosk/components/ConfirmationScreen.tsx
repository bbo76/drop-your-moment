import { Lede } from "./Screen";

interface Props {
  /** `printing` tant que le tirage court, `done` une fois terminé. */
  printing: boolean;
  photoUrl: string | null;
  /** Secondes avant le retour automatique à l'accueil, rendues par le serveur. */
  remainingSeconds: number | null;
}

/* Sortie du parcours : l'écran d'attente puis la confirmation.
 *
 * Le retour à l'accueil n'est pas piloté ici — le timeout de l'état `done` vit dans la
 * machine à états du serveur, et le frontend ne fait que suivre. Il se contente d'annoncer
 * le compte à rebours pour que le visiteur sache que la borne va se libérer.
 *
 * Avec le pilote neutre, l'état `printing` ne dure que le temps d'un aller-retour et le
 * visiteur ne le voit pas. Il durera une quarantaine de secondes avec la CP1500. */
export function ConfirmationScreen({ printing, photoUrl, remainingSeconds }: Props) {
  return (
    <main className="grid h-full grid-cols-[1.2fr_1fr] gap-5 p-5">
      <div className="grid min-h-0 place-content-center">
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Votre photo"
            className="max-h-full max-w-full rounded-panel object-contain"
          />
        )}
      </div>

      <div className="grid place-content-center justify-items-start gap-3 rounded-panel bg-accent p-8 text-accent-ink">
        {printing ? (
          <>
            <h1 className="text-5xl leading-none font-bold tracking-[-0.02em]">Un instant…</h1>
            <Lede>Votre photo est en cours d'enregistrement.</Lede>
          </>
        ) : (
          <>
            <h1 className="text-5xl leading-none font-bold tracking-[-0.02em]">C'est enregistré !</h1>
            <Lede>Merci, et à bientôt devant l'objectif.</Lede>
            <p className="text-base leading-[1.3] font-normal text-accent-ink/70 sm:text-lg">
              {remainingSeconds !== null
                ? `Retour à l'accueil dans ${Math.ceil(remainingSeconds)} s`
                : "Retour à l'accueil…"}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
