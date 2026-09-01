import { Check, Printer } from "lucide-react";
import { useEffect, useState } from "react";

import { Lede } from "./Screen";

const ESTIMATED_PRINT_DURATION_MS = 8000;

interface Props {
  printing: boolean;
  outputMode: "print" | "save" | null;
  photoUrl: string | null;
  remainingSeconds: number | null;
}

export function ConfirmationScreen({ printing, outputMode, photoUrl, remainingSeconds }: Props) {
  const [progress, setProgress] = useState(printing ? 8 : 100);

  useEffect(() => {
    if (!printing) {
      setProgress(100);
      return;
    }
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setProgress(Math.min(94, 8 + (elapsed / ESTIMATED_PRINT_DURATION_MS) * 86));
    }, 120);
    return () => window.clearInterval(timer);
  }, [printing]);

  const printed = outputMode === "print";

  return (
    <main className="grid h-full grid-cols-[1.16fr_1fr] gap-5 p-5">
      <div className="relative grid min-h-0 place-content-center overflow-hidden rounded-panel bg-black">
        {photoUrl && <img src={photoUrl} alt="Votre photo" className="max-h-full max-w-full object-contain" />}
      </div>

      {printing ? (
        <section className="flex min-h-0 flex-col justify-between rounded-panel bg-surface p-8">
          <Printer className="size-14 text-signal" strokeWidth={1.8} aria-hidden="true" />
          <div className="grid gap-3">
            <h1 className="max-w-[9ch] text-5xl leading-none font-bold tracking-[-0.02em]">Votre photo prend forme</h1>
            <Lede>Encore un instant, elle arrive.</Lede>
          </div>
          <div className="grid gap-3">
            <div className="flex items-end justify-between">
              <span className="text-lg font-medium text-muted">Impression en cours</span>
              <span className="text-3xl font-bold tabular-nums text-body">{Math.round(progress)} %</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progression estimée de l'impression"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="h-5 overflow-hidden rounded-[0.35rem] border-2 border-edge bg-ink"
            >
              <span
                className="block h-full bg-signal transition-[width] duration-150 ease-out motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-muted">Elle peut encore prendre quelques instants.</p>
          </div>
        </section>
      ) : (
        <section className="grid place-content-center justify-items-start gap-4 rounded-panel bg-signal p-8 text-signal-ink">
          <span className="success-mark grid size-14 place-items-center rounded-full border-[3px] border-signal-ink" aria-hidden="true">
            <Check className="size-8" strokeWidth={3} />
          </span>
          <h1 className="max-w-[10ch] text-5xl leading-none font-bold tracking-[-0.02em]">
            {printed ? "Votre photo est prête !" : "C'est enregistré !"}
          </h1>
          <Lede>{printed ? "Vous pouvez la récupérer." : "Votre photo reste dans la galerie."}</Lede>
          <p className="text-lg text-signal-ink/70">
            {remainingSeconds !== null ? `Nouvelle photo dans ${Math.ceil(remainingSeconds)} s` : "Retour à l'accueil…"}
          </p>
        </section>
      )}
    </main>
  );
}
