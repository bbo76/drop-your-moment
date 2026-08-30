import type { ReactNode } from "react";
import {
  Activity,
  Camera,
  Check,
  CircleAlert,
  HardDrive,
  Images,
  Printer,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { GhostButton } from "../components/Screen";
import type { MaintenanceStatus } from "./maintenanceDiagnostics";

export function MaintenanceFrame({ title, status, onBack, children }: {
  title: string;
  status: MaintenanceStatus;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <main className="grid h-full grid-rows-[auto_1fr] gap-3 bg-ink p-4 text-body [--color-signal:#d8dee4] [--color-signal-ink:#101418] max-h-[600px]:p-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GhostButton onClick={onBack}>Retour</GhostButton>
          <h1 className="text-3xl leading-[1.08] font-bold tracking-[-0.02em]">{title}</h1>
        </div>
        <MaintenanceStatusBanner status={status} />
      </header>
      {children}
    </main>
  );
}

export function MaintenanceStatusBanner({ status }: { status: MaintenanceStatus }) {
  if (status !== "ready") {
    const labels = {
      paper: "Papier à recharger",
      camera: "Caméra absente",
      disk: "Stockage presque plein",
      printer: "Imprimante déconnectée",
    } as const;
    const Icon = status === "camera" ? Camera : status === "disk" ? HardDrive : Printer;
    return (
      <div className="relative grid size-12 flex-none place-items-center text-body after:absolute after:h-1 after:w-[2.65rem] after:-rotate-45 after:rounded-full after:bg-warn after:content-['']" role="status" aria-label={labels[status]}>
        <Icon className="size-[2.1rem]" strokeWidth={1.8} />
      </div>
    );
  }
  return <div className="flex min-h-14 items-center gap-3 px-1 text-lg font-semibold"><StatusMark state="ready" />Borne prête</div>;
}

export function MaintenanceIcon({ name, className = "size-[4.25rem] rounded-[0.55rem] bg-signal p-[0.9rem] fill-none stroke-current stroke-2 text-signal-ink [stroke-linecap:round] [stroke-linejoin:round]" }: {
  name: "health" | "print" | "gallery" | "settings";
  className?: string;
}) {
  const icons: Record<typeof name, LucideIcon> = { health: Activity, print: Printer, gallery: Images, settings: SlidersHorizontal };
  const Icon = icons[name];
  return <Icon className={className} strokeWidth={2} />;
}

export function StatusMark({ state }: { state: "ready" | "warning" }) {
  return (
    <span className={`inline-grid size-[1.65rem] flex-none place-items-center rounded-[0.3rem] border-2 text-base leading-none font-bold ${state === "ready" ? "border-[#7fc6a4] bg-[#7fc6a4] text-[#101418]" : "border-current text-warn"}`} aria-hidden="true">
      {state === "ready" ? <Check className="size-4" strokeWidth={3} /> : <CircleAlert className="size-4" strokeWidth={2.5} />}
    </span>
  );
}

export function ProgressMeter({ value, max = 100, warning, ariaLabel, className }: {
  value: number;
  max?: number;
  warning: boolean;
  ariaLabel: string;
  className: string;
}) {
  return <progress value={value} max={max} aria-label={ariaLabel} className={`${className} block w-full appearance-none overflow-hidden rounded-full bg-edge [&::-webkit-progress-bar]:bg-edge ${warning ? "[&::-moz-progress-bar]:bg-warn [&::-webkit-progress-value]:bg-warn" : "[&::-moz-progress-bar]:bg-signal [&::-webkit-progress-value]:bg-signal"}`} />;
}

export function MaintenanceChoice({ children, disabled, pressed, accentBorder = false, onClick }: {
  children: ReactNode;
  disabled: boolean;
  pressed?: boolean;
  accentBorder?: boolean;
  onClick: () => void;
}) {
  return <button type="button" disabled={disabled} aria-pressed={pressed} onClick={onClick} className={`min-h-[3.4rem] rounded-panel border-2 bg-transparent text-xl font-semibold text-body transition-[transform,background-color,color] duration-150 active:scale-[0.97] aria-pressed:border-signal aria-pressed:bg-signal aria-pressed:text-signal-ink disabled:cursor-wait ${accentBorder ? "border-signal" : "border-edge"}`}>{children}</button>;
}
