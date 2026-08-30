import { Camera, HardDrive, Thermometer, type LucideIcon } from "lucide-react";

import type { MaintenanceSnapshot } from "../../shared/api";
import { ProgressMeter, StatusMark } from "./MaintenanceUi";

export function MaintenanceHealthView({ snapshot }: { snapshot: MaintenanceSnapshot }) {
  const { health } = snapshot;
  const freeRatio = health.disk_free_bytes / health.disk_total_bytes;
  const freePercent = Math.round(freeRatio * 100);
  const storageReady = freeRatio > 0.1;
  return (
    <section className="grid min-h-0 grid-cols-[1.25fr_0.75fr] gap-4 overflow-hidden">
      <div className="grid min-h-0 grid-rows-[1fr_1.2fr] overflow-hidden rounded-[0.65rem] bg-surface">
        <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-4 p-5">
          <HealthIcon name="camera" />
          <div className="min-w-0"><p className="text-lg font-medium text-muted">Caméra</p><p className={`text-3xl font-bold ${health.camera_ok ? "" : "text-warn"}`}>{health.camera_ok ? "Prête à photographier" : "Non détectée"}</p><p className="mt-1 text-base text-muted">{health.camera_ok ? "Connexion et capture opérationnelles" : "Vérifiez le câble et redémarrez la borne"}</p></div>
          <StatusMark state={health.camera_ok ? "ready" : "warning"} />
        </div>
        <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 border-t-2 border-edge p-5">
          <HealthIcon name="storage" />
          <div className="min-w-0"><div className="flex items-baseline justify-between gap-4"><div><p className="text-lg font-medium text-muted">Stockage</p><p className={`text-3xl font-bold tabular-nums ${storageReady ? "" : "text-warn"}`}>{freePercent} % libre</p></div><p className="text-right text-lg font-bold tabular-nums">{gigabytes(health.disk_free_bytes)} <span className="font-normal text-muted">sur {gigabytes(health.disk_total_bytes)}</span></p></div><ProgressMeter value={freePercent} warning={!storageReady} ariaLabel="Espace de stockage libre" className="mt-2.5 h-3" /><p className="mt-2 text-base text-muted">{storageReady ? "Espace suffisant pour les prochaines photos" : "Libérez de l’espace avant de poursuivre"}</p></div>
        </div>
      </div>
      <div className="flex min-h-0 flex-col rounded-[0.65rem] bg-surface p-5">
        <div className="flex items-center gap-4 border-b-2 border-edge pb-4"><HealthIcon name="temperature" /><div><p className="text-base font-medium text-muted">Température</p><p className={`text-3xl font-bold tabular-nums ${health.temperature_c !== null && health.temperature_c >= 80 ? "text-warn" : ""}`}>{health.temperature_c === null ? "Indisponible" : `${Math.round(health.temperature_c)} °C`}</p></div></div>
        <div className="flex flex-1 flex-col justify-center gap-7"><ResourceMeter label="Processeur" percent={health.cpu_percent} /><ResourceMeter label="Mémoire" percent={health.memory_percent} /></div>
      </div>
    </section>
  );
}

function HealthIcon({ name }: { name: "camera" | "storage" | "temperature" }) {
  const icons: Record<typeof name, LucideIcon> = { camera: Camera, storage: HardDrive, temperature: Thermometer };
  const Icon = icons[name];
  return <Icon className="size-14 rounded-panel border-2 border-edge p-2.5 text-signal" strokeWidth={1.8} />;
}

function ResourceMeter({ label, percent }: { label: string; percent: number }) {
  const bounded = Math.max(0, Math.min(100, percent));
  return <div><div className="flex items-baseline justify-between"><span className="font-medium text-muted">{label}</span><strong className="text-[2rem] tabular-nums">{Math.round(bounded)} %</strong></div><ProgressMeter value={bounded} warning={bounded >= 85} ariaLabel={`Utilisation ${label}`} className="mt-1.5 h-[1.15rem]" /></div>;
}

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
