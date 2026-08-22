import type { ReactNode } from "react";

/** Écran plein cadre, contenu centré. Sert l'accueil, l'erreur et la perte du backend. */
export function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-content-center gap-4 p-5 text-center justify-items-center">
      {children}
    </div>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{children}</h1>
  );
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="text-base sm:text-xl">{children}</p>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted sm:text-base">{children}</p>;
}

/* Hauteur minimale généreuse : la cible est un doigt sur un écran de 7 pouces, pas un
 * curseur. `disabled:` couvre le cas d'une caméra absente. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-14 cursor-pointer rounded-panel bg-accent px-8 text-lg font-semibold text-accent-ink disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 cursor-pointer rounded-panel border border-edge px-5 text-muted"
    >
      {children}
    </button>
  );
}
