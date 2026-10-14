import type { ReactNode } from "react";
import type { LaunchFont } from "@/api/client";
import { LAUNCH_FONT_CLASSES } from "@/utils/theme";

/** Écran plein cadre, contenu centré. Sert l'accueil, l'erreur et la perte du backend. */
export function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid h-full place-content-center justify-items-center gap-5 bg-ink p-8 text-center">
      {children}
    </main>
  );
}

export function Title({ children, font = "modern", large = false }: { children: ReactNode; font?: LaunchFont; large?: boolean }) {
  return (
    <h1 className={`max-w-[14ch] text-balance leading-none font-bold tracking-[-0.02em] ${large ? "text-[3.25rem] sm:text-[4.125rem]" : "text-5xl sm:text-6xl"} ${LAUNCH_FONT_CLASSES[font]}`}>{children}</h1>
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
  large = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex cursor-pointer items-center justify-center gap-3 rounded-panel bg-signal font-medium text-signal-ink transition-[background-color,color,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${large ? "min-h-18 px-10 text-[1.375rem]" : "min-h-16 px-8 text-xl"}`}
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
      className="min-h-14 cursor-pointer rounded-panel border-2 border-edge bg-transparent px-6 text-lg font-medium text-body transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}
