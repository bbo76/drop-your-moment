import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button as ShadButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/* Habillage partagé par les sections du portail.
 *
 * Le portail est une page qui défile, une `<section>` par sujet — pas d'onglets ni de
 * routeur. L'opérateur est sur un PC devant un écran qui défile, et trois sections ne
 * justifient pas un mécanisme de navigation. À reconsidérer le jour où la page devient
 * illisible. */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mx-auto max-w-7xl gap-0 py-0">
      <CardHeader className="border-b px-6 py-5">
        <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-6 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:min-h-10 [&_select]:min-h-10">{children}</CardContent>
    </Card>
  );
}

/** Une ligne d'un tableau de valeurs. À placer dans un `<dl>` en deux colonnes. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
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
    <Label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

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
  const variant = {
    primary: "default",
    secondary: "outline",
    warning: "destructive",
  }[tone] as "default" | "outline" | "destructive";
  return (
    <ShadButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      size="lg"
      className="min-h-11 px-4"
    >
      {children}
    </ShadButton>
  );
}

/** Retour d'une action : le message d'erreur du backend, ou une confirmation. */
export function Feedback({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (error) {
    return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  }
  if (notice) return <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>;
  return null;
}
