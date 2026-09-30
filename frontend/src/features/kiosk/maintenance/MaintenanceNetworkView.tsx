import { useState } from "react";
import { Radio, Smartphone, Wifi } from "lucide-react";

import type { HotspotStatus } from "@/api/client";
import { MaintenanceDialog } from "./MaintenanceUi";

export function MaintenanceNetworkView({ hotspot, saving, onChange }: {
  hotspot: HotspotStatus;
  saving: boolean;
  onChange: (action: "activate" | "deactivate") => Promise<void>;
}) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const change = async (action: "activate" | "deactivate") => {
    await onChange(action);
    setConfirmDeactivate(false);
  };
  return <section className="grid min-h-0 grid-cols-[1.1fr_0.9fr] gap-3">
    <div className="grid content-start gap-3 rounded-[0.65rem] bg-surface p-5">
      <div className="flex items-center gap-4"><Wifi className="size-12 text-signal" /><div><h2 className="text-2xl font-semibold">{hotspot.ssid}</h2><p className={hotspot.active ? "text-signal" : "text-muted"}>{hotspot.active ? "Réseau actif" : "Réseau désactivé"}</p></div></div>
      <dl className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-2 border-t border-edge pt-4 text-lg"><dt className="text-muted">Mot de passe Wi-Fi</dt><dd className="font-mono font-semibold">{hotspot.secret ?? "Non configuré"}</dd><dt className="text-muted">Code administrateur</dt><dd className="font-mono text-2xl font-bold tracking-[0.18em]">{hotspot.admin_code ?? "—"}</dd><dt className="text-muted">Portail</dt><dd className="break-all font-mono text-base">{hotspot.portal_url}</dd><dt className="text-muted">Appareils</dt><dd>{hotspot.client_count}</dd></dl>
      <button type="button" disabled={saving || !hotspot.available} onClick={() => hotspot.active ? setConfirmDeactivate(true) : void change("activate")} className={`mt-2 min-h-16 rounded-panel text-xl font-bold disabled:opacity-40 ${hotspot.active ? "border-2 border-warn text-warn" : "bg-signal text-signal-ink"}`}>{hotspot.active ? "Désactiver le réseau" : "Activer le réseau"}</button>
      {!hotspot.available && <p className="text-warn">Configuration hotspot absente. Lancez la procédure d’installation Raspberry Pi.</p>}
    </div>
    <div className="grid grid-rows-2 gap-3">
      <QrCard title="Connexion Wi-Fi" icon={<Wifi />} src="/api/maintenance/hotspot/qr/wifi" visible={hotspot.secret !== null} />
      <QrCard title="Ouvrir le portail" icon={<Smartphone />} src="/api/maintenance/hotspot/qr/portal" visible={hotspot.secret !== null} />
    </div>
    {confirmDeactivate && <MaintenanceDialog label="Confirmer la désactivation du réseau" onCancel={() => setConfirmDeactivate(false)}><div className="w-full max-w-xl rounded-panel border-2 border-warn bg-ink p-8"><Radio className="size-12 text-warn" /><h2 className="mt-4 text-3xl font-bold">Couper le réseau opérateur ?</h2><p className="mt-4 text-xl text-muted">Tous les appareils seront déconnectés et leurs accès au portail invalidés.</p><div className="mt-8 grid grid-cols-2 gap-3"><button type="button" autoFocus className="min-h-16 rounded-panel border-2 border-edge text-xl font-semibold" onClick={() => setConfirmDeactivate(false)}>Annuler</button><button type="button" className="min-h-16 rounded-panel bg-warn text-xl font-bold text-ink" onClick={() => void change("deactivate")}>Désactiver</button></div></div></MaintenanceDialog>}
  </section>;
}

function QrCard({ title, icon, src, visible }: { title: string; icon: React.ReactNode; src: string; visible: boolean }) {
  return <div className="grid min-h-0 grid-cols-[1fr_auto] items-center gap-3 rounded-[0.65rem] bg-surface p-4"><h3 className="flex items-center gap-2 text-xl font-semibold">{icon}{title}</h3>{visible ? <img className="size-40 rounded bg-white p-1" src={src} alt={`QR code — ${title}`} /> : <div className="grid size-40 place-items-center rounded bg-edge text-muted">Indisponible</div>}</div>;
}
