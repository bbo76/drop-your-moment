import { Camera, HardDrive, PlugZap, Thermometer, type LucideIcon } from "lucide-react";
import { useState } from "react";

import type { MaintenanceSnapshot } from "@/api/client";
import { ProgressMeter, WarningMark } from "./MaintenanceUi";
import { api } from "@/api/client";

export function MaintenanceHealthView({ snapshot, onRefresh }: { snapshot: MaintenanceSnapshot; onRefresh: () => Promise<void> }) {
  const [storageAction, setStorageAction] = useState<"refresh" | "eject" | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const { health } = snapshot;
  const storageFree = health.photo_storage_free_bytes ?? health.disk_free_bytes;
  const storageTotal = health.photo_storage_total_bytes ?? health.disk_total_bytes;
  const freeRatio = storageTotal ? storageFree / storageTotal : 0;
  const freePercent = Math.round(freeRatio * 100);
  const storageReady = freeRatio > 0.1;
  return (
    <section className="grid min-h-0 grid-cols-[1.25fr_0.75fr] gap-4 overflow-hidden">
      <div className="grid min-h-0 grid-rows-[1fr_1.2fr] overflow-hidden rounded-[0.65rem] bg-surface">
        <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-4 p-5">
          <HealthIcon name="camera" />
          <div className="min-w-0"><p className="text-lg font-medium text-muted">Caméra</p><p className={`text-3xl font-bold ${health.camera_ok ? "text-signal" : "text-warn"}`}>{health.camera_ok ? "Prête à photographier" : "Non détectée"}</p><p className="mt-1 text-base text-muted">{health.camera_ok ? "Connexion et capture opérationnelles" : "Vérifiez le câble et redémarrez la borne"}</p></div>
          {!health.camera_ok && <WarningMark />}
        </div>
        <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 border-t-2 border-edge p-5">
          <HealthIcon name="storage" />
          <div className="min-w-0"><div className="flex items-baseline justify-between gap-4"><div><p className="text-lg font-medium text-muted">Stockage · {health.photo_storage_label}</p><p className={`text-3xl font-bold tabular-nums ${storageReady ? "" : "text-warn"}`}>{freePercent} % libre</p></div><p className="text-right text-lg font-bold tabular-nums">{gigabytes(storageFree)} <span className="font-normal text-muted">sur {gigabytes(storageTotal)}</span></p></div><ProgressMeter value={freePercent} warning={!storageReady} ariaLabel="Espace de stockage libre" className="mt-2.5 h-3" /><p className="mt-2 text-base text-muted">{health.photo_storage_reason ? `Repli SD : ${health.photo_storage_reason}` : health.photo_storage_low_space ? "Espace faible : moins de 512 Mo disponibles" : storageReady ? `Destination active : ${health.photo_storage_path}` : "Espace presque épuisé"}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={storageAction !== null} onClick={() => void storageRequest("refresh")} className="min-h-11 rounded-panel border-2 border-edge px-3 text-base font-semibold">{storageAction === "refresh" ? "Détection…" : "Relancer la détection"}</button><button type="button" disabled={storageAction !== null || health.photo_storage_mode !== "external"} onClick={() => void storageRequest("eject")} className="min-h-11 rounded-panel border-2 border-edge px-3 text-base font-semibold">{storageAction === "eject" ? "Sécurisation…" : "Préparer le retrait"}</button></div>{storageMessage && <p role="status" className="mt-2 text-sm text-muted">{storageMessage}</p>}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-col rounded-[0.65rem] bg-surface p-5">
        <div className="flex items-center gap-4 border-b-2 border-edge pb-4"><HealthIcon name="power" /><div><p className="text-base font-medium text-muted">Alimentation</p><p className={`text-2xl font-bold ${powerWarning(health) ? "text-warn" : ""}`}>{powerLabel(health)}</p><p className="mt-1 text-sm leading-tight text-muted">{powerDetail(health)}</p></div></div>
        <div className="flex flex-1 flex-col justify-center gap-5"><div className="flex items-center gap-3"><HealthIcon name="temperature" /><div><p className="font-medium text-muted">Température</p><p className={`text-2xl font-bold tabular-nums ${health.temperature_c !== null && health.temperature_c >= 80 ? "text-warn" : ""}`}>{health.temperature_c === null ? "Indisponible" : `${Math.round(health.temperature_c)} °C`}</p></div></div><ResourceMeter label="Processeur" percent={health.cpu_percent} /><ResourceMeter label="Mémoire" percent={health.memory_percent} /></div>
      </div>
    </section>
  );

  async function storageRequest(action: "refresh" | "eject") {
    setStorageAction(action);
    setStorageMessage(null);
    try {
      if (action === "refresh") await api.refreshMaintenanceStorage();
      else await api.ejectMaintenanceStorage();
      await onRefresh();
      setStorageMessage(action === "eject" ? "Écritures terminées. Vous pouvez retirer le support." : "Détection terminée.");
    } catch (cause) {
      setStorageMessage(cause instanceof Error ? cause.message : "Action impossible.");
    } finally {
      setStorageAction(null);
    }
  }
}

function HealthIcon({ name }: { name: "camera" | "storage" | "temperature" | "power" }) {
  const icons: Record<typeof name, LucideIcon> = { camera: Camera, storage: HardDrive, temperature: Thermometer, power: PlugZap };
  const Icon = icons[name];
  return <Icon className="size-14 rounded-panel border-2 border-edge p-2.5 text-signal" strokeWidth={1.8} />;
}

function ResourceMeter({ label, percent }: { label: string; percent: number }) {
  const bounded = Math.max(0, Math.min(100, percent));
  return <div><div className="flex items-baseline justify-between"><span className="font-medium text-muted">{label}</span><strong className="text-[2rem] tabular-nums">{Math.round(bounded)} %</strong></div><ProgressMeter value={bounded} warning={bounded >= 85} ariaLabel={`Utilisation ${label}`} className="mt-1.5 h-[1.15rem]" /></div>;
}

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
const powerWarning = (health: MaintenanceSnapshot["health"]) => health.undervoltage_now === true || health.undervoltage_occurred === true || health.throttled_now === true || health.throttled_occurred === true;
const powerLabel = (health: MaintenanceSnapshot["health"]) => health.undervoltage_now ? "Sous-tension active" : health.undervoltage_occurred ? "Sous-tension détectée" : health.throttled_now ? "Performances limitées" : health.throttled_occurred ? "Throttling détecté" : health.undervoltage_now === null ? "Indisponible" : "Alimentation OK";
const powerDetail = (health: MaintenanceSnapshot["health"]) => powerWarning(health) ? "Vérifiez le bloc secteur et le câble USB-C" : health.undervoltage_now === null ? "Mesure disponible sur Raspberry Pi" : "Aucune anomalie depuis le démarrage";
