import type { ReactNode } from "react";

/* Habillage partagé par les sections du portail.
 *
 * Le portail est une page qui défile, une `<section>` par sujet — pas d'onglets ni de
 * routeur. L'opérateur est sur un PC devant un écran qui défile, et trois sections ne
 * justifient pas un mécanisme de navigation. À reconsidérer le jour où la page devient
 * illisible. */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-section">
      <header className="admin-section-heading">
        <h1>{title}</h1>
      </header>
      <div className="admin-section-body">{children}</div>
    </section>
  );
}

/** Une ligne d'un tableau de valeurs. À placer dans un `<dl>` en deux colonnes. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded border border-edge bg-ink px-3 py-2 text-body " +
  "focus:border-accent focus:outline-none";

export function Button({
  children,
  onClick,
  disabled,
  type = "button",
  tone = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  tone?: "primary" | "secondary" | "warning";
}) {
  const toneClass = {
    primary: "border-accent bg-accent text-accent-ink",
    secondary: "border-edge bg-transparent text-body",
    warning: "border-warn bg-transparent text-warn",
  }[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded border px-4 py-2 font-medium transition-colors disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

/** Retour d'une action : le message d'erreur du backend, ou une confirmation. */
export function Feedback({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (error) {
    return <p className="rounded-panel bg-warn-bg px-4 py-3 text-sm text-warn">{error}</p>;
  }
  if (notice) return <p className="text-sm text-muted">{notice}</p>;
  return null;
}
