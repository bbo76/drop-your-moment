import type { ReactNode } from "react";

/** Écran plein cadre, contenu centré. Sert l'accueil, l'erreur et la perte du backend. */
export function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <main className="kiosk-stage grid h-full place-content-center gap-5 p-8 text-center justify-items-center">
      {children}
    </main>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="kiosk-title type-kiosk-display max-w-[14ch] text-5xl sm:text-6xl">{children}</h1>
  );
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="max-w-[34ch] text-xl font-medium sm:text-2xl">{children}</p>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-base text-muted sm:text-lg">{children}</p>;
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
      className="kiosk-button kiosk-button-primary type-kiosk-action min-h-16 cursor-pointer rounded-panel px-8 text-xl disabled:cursor-not-allowed disabled:opacity-40"
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
      className="kiosk-button type-kiosk-action min-h-14 cursor-pointer rounded-panel border-2 border-edge bg-transparent px-6 text-lg text-body"
    >
      {children}
    </button>
  );
}
