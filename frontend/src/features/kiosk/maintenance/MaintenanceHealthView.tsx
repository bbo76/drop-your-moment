import { Camera, HardDrive, PlugZap, Power, RefreshCcw, Thermometer, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { MaintenanceSnapshot } from "@/api/client";
import { MaintenanceDialog, ProgressMeter, WarningMark } from "./MaintenanceUi";
import { api } from "@/api/client";

export function MaintenanceHealthView({ snapshot, onRefresh, onPowerAction }: { snapshot: MaintenanceSnapshot; onRefresh: () => Promise<void>; onPowerAction: (action: "reboot" | "poweroff") => Promise<void> }) {
  const [storageAction, setStorageAction] = useState<"refresh" | "eject" | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<"reboot" | "poweroff" | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);
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
        <div className="flex flex-1 flex-col justify-center gap-4"><div className="flex items-center gap-3"><HealthIcon name="temperature" /><div><p className="font-medium text-muted">Température</p><p className={`text-2xl font-bold tabular-nums ${health.temperature_c !== null && health.temperature_c >= 80 ? "text-warn" : ""}`}>{health.temperature_c === null ? "Indisponible" : `${Math.round(health.temperature_c)} °C`}</p></div></div><ResourceMeter label="Processeur" percent={health.cpu_percent} /><ResourceMeter label="Mémoire" percent={health.memory_percent} /></div>
        <div className="border-t-2 border-edge pt-3">
          <h2 className="text-base font-semibold">Actions d’alimentation</h2>
          <div className="mt-2 grid gap-2">
            <PowerAction disabled={!snapshot.power_available} onClick={() => { setPowerError(null); setConfirmation("reboot"); }}>
              <RefreshCcw className="size-5" aria-hidden="true" />Redémarrer la borne
            </PowerAction>
            <PowerAction destructive disabled={!snapshot.power_available} onClick={() => { setPowerError(null); setConfirmation("poweroff"); }}>
              <Power className="size-5" aria-hidden="true" />Éteindre la borne
            </PowerAction>
          </div>
          <p className={`mt-2 text-sm leading-tight ${powerError ? "text-warn" : "text-muted"}`} role="status">
            {powerError ?? (snapshot.power_available ? "À utiliser seulement au repos." : "Actions indisponibles hors Raspberry Pi avec systemd.")}
          </p>
        </div>
      </div>
      {confirmation && <PowerConfirmation action={confirmation} onCancel={() => setConfirmation(null)} onConfirm={async () => { const action = confirmation; setConfirmation(null); try { await onPowerAction(action); } catch { setPowerError("Action refusée : terminez la session photo avant de réessayer."); } }} />}
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

function PowerAction({ children, disabled, destructive = false, onClick }: { children: ReactNode; disabled: boolean; destructive?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`flex min-h-12 items-center justify-center gap-2 rounded-panel border-2 px-3 text-base font-semibold outline-none focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-40 ${destructive ? "border-warn text-warn" : "border-edge text-body"}`}>{children}</button>;
}

function PowerConfirmation({ action, onCancel, onConfirm }: { action: "reboot" | "poweroff"; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const reboot = action === "reboot";
  return <MaintenanceDialog label={reboot ? "Confirmer le redémarrage" : "Confirmer l’arrêt"} onCancel={onCancel}><div className={`w-full max-w-xl rounded-panel border-2 bg-ink p-8 ${reboot ? "border-signal" : "border-warn"}`}><h2 className="text-3xl font-bold">{reboot ? "Redémarrer la borne ?" : "Éteindre la borne ?"}</h2><p className="mt-4 text-xl text-muted">{reboot ? "Le kiosque reviendra automatiquement après le redémarrage." : "La borne restera éteinte. Il faudra appuyer physiquement sur son alimentation pour la rallumer."}</p><div className="mt-8 grid grid-cols-2 gap-3"><button type="button" autoFocus className="min-h-16 rounded-panel border-2 border-edge text-xl font-semibold" onClick={onCancel}>Annuler</button><button type="button" className={`min-h-16 rounded-panel text-xl font-bold text-ink ${reboot ? "bg-signal" : "bg-warn"}`} onClick={() => void onConfirm()}>{reboot ? "Confirmer le redémarrage" : "Confirmer l’arrêt"}</button></div></div></MaintenanceDialog>;
}

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;
const powerWarning = (health: MaintenanceSnapshot["health"]) => health.undervoltage_now === true || health.undervoltage_occurred === true || health.throttled_now === true || health.throttled_occurred === true;
const powerLabel = (health: MaintenanceSnapshot["health"]) => health.undervoltage_now ? "Sous-tension active" : health.undervoltage_occurred ? "Sous-tension détectée" : health.throttled_now ? "Performances limitées" : health.throttled_occurred ? "Throttling détecté" : health.undervoltage_now === null ? "Indisponible" : "Alimentation OK";
const powerDetail = (health: MaintenanceSnapshot["health"]) => powerWarning(health) ? "Vérifiez le bloc secteur et le câble USB-C" : health.undervoltage_now === null ? "Mesure disponible sur Raspberry Pi" : "Aucune anomalie depuis le démarrage";
