import { useState } from "react";

import type { MaintenanceSnapshot } from "../../shared/api";
import { InkCartridgeDialog } from "../../shared/InkCartridgeDialog";
import { PaperStockDialog } from "../../shared/PaperStockDialog";
import { supplyLevels } from "./maintenanceDiagnostics";
import { MaintenanceChoice, MaintenanceIcon, ProgressMeter, StatusMark } from "./MaintenanceUi";

export function MaintenancePrintingView({ snapshot, saving, onSaveSettings, onReloadCassette, onReplaceInk, onSetPaperStock }: {
  snapshot: MaintenanceSnapshot;
  saving: boolean;
  onSaveSettings: (changes: Partial<MaintenanceSnapshot["settings"]>) => Promise<void>;
  onReloadCassette: () => Promise<boolean>;
  onReplaceInk: (capacity: 36 | 54) => Promise<boolean>;
  onSetPaperStock: (capacity: number) => Promise<boolean>;
}) {
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [inkDialogOpen, setInkDialogOpen] = useState(false);
  const { health, settings } = snapshot;
  const { printable, cassette, ink, stock } = supplyLevels(health.counters);
  const printerLabel = health.printer_driver === "null" ? "Mode numérique" : health.printer_driver === "offline" ? "CP1500 déconnectée" : "CP1500 connectée";
  return (
    <section className="grid min-h-0 grid-cols-[0.9fr_1.1fr] gap-4 overflow-hidden">
      <div className="grid min-h-0 grid-rows-[1.05fr_1fr] overflow-hidden rounded-[0.65rem] bg-surface">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-5 py-[1.15rem]">
          <MaintenanceIcon name="print" className="size-14 rounded-panel border-2 border-edge p-2.5 text-accent" />
          <div><p className="text-lg font-medium text-muted">Tirages disponibles</p><p className="text-[4.5rem] leading-none font-bold tabular-nums max-h-[600px]:text-[4rem]">{printable}</p></div>
          <p className={`col-span-full mt-2 flex items-center gap-2.5 font-semibold ${health.printer_driver === "offline" ? "text-warn" : ""}`}><StatusMark state={health.printer_driver === "offline" ? "warning" : "ready"} />{printerLabel}</p>
        </div>
        <div className="grid content-center gap-3.5 border-t-2 border-edge px-5 py-4">
          <PrintSupply label="Bac" remaining={cassette} capacity={health.counters.cassette_capacity} />
          <PrintSupply label="Encre" remaining={ink} capacity={health.counters.cartridge_capacity} />
          <PrintSupply label="Réserve" remaining={stock} capacity={health.counters.paper_stock_capacity} unit=" feuilles" />
        </div>
      </div>
      <div className="grid min-h-0 grid-rows-[0.85fr_1.15fr] overflow-hidden rounded-[0.65rem] bg-surface">
        <div className="grid content-center gap-3.5 px-5 py-[1.1rem]"><div><h2 className="text-xl font-semibold">Copies par photo</h2><p className="text-base text-muted">Appliqué dès la prochaine photo</p></div><div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((copies) => <MaintenanceChoice key={copies} disabled={saving} pressed={settings.copies_per_print === copies} onClick={() => void onSaveSettings({ copies_per_print: copies })}>{copies}</MaintenanceChoice>)}</div></div>
        <div className="grid content-center gap-3.5 border-t-2 border-edge px-5 py-[1.1rem]"><h2 className="text-xl font-semibold">Après une intervention</h2><MaintenanceChoice accentBorder disabled={saving} onClick={() => void onReloadCassette()}>Bac rechargé · 18 feuilles</MaintenanceChoice><div className="grid grid-cols-2 gap-3"><MaintenanceChoice disabled={saving} onClick={() => setInkDialogOpen(true)}>Cassette d’encre remplacée</MaintenanceChoice><MaintenanceChoice disabled={saving} onClick={() => setStockDialogOpen(true)}>Mettre à jour la réserve</MaintenanceChoice></div></div>
        <PaperStockDialog open={stockDialogOpen} initialValue={Math.max(1, stock)} saving={saving} onClose={() => setStockDialogOpen(false)} onConfirm={async (total) => { if (await onSetPaperStock(total)) setStockDialogOpen(false); }} />
        <InkCartridgeDialog open={inkDialogOpen} saving={saving} onClose={() => setInkDialogOpen(false)} onConfirm={async (capacity) => { if (await onReplaceInk(capacity)) setInkDialogOpen(false); }} />
      </div>
    </section>
  );
}

function PrintSupply({ label, remaining, capacity, unit = "" }: { label: string; remaining: number; capacity: number; unit?: string }) {
  const percent = capacity > 0 ? Math.min(100, Math.round((remaining / capacity) * 100)) : 0;
  return <div><div className="flex items-baseline justify-between gap-3"><span className="text-lg font-medium">{label}</span><strong className={percent <= 10 ? "text-warn" : ""}>{remaining}{unit} <span className="font-normal text-muted">/ {capacity}</span></strong></div><ProgressMeter value={remaining} max={capacity} warning={percent <= 10} ariaLabel={`${label} restant`} className="mt-1 h-2.5" /></div>;
}
