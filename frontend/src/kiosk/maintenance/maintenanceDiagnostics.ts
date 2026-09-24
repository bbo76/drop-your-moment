import type { AdminHealth, CounterReading, MaintenanceSnapshot } from "../../shared/api";

export type MaintenanceStatus = "ready" | "paper" | "camera" | "disk" | "printer";
export type MaintenancePrintNotice = {
  state: "printing" | "complete" | "error";
  copies: number;
  targetPrintsTotal: number;
  error?: string;
};

export function resolveMaintenancePrint(
  notice: MaintenancePrintNotice | null,
  snapshot: MaintenanceSnapshot,
): MaintenancePrintNotice | null {
  if (!notice || notice.state !== "printing") return notice;
  if (snapshot.print_error) return { ...notice, state: "error", error: snapshot.print_error };
  if (!snapshot.print_busy && snapshot.health.counters.prints_total >= notice.targetPrintsTotal) {
    return { ...notice, state: "complete" };
  }
  return notice;
}

export function supplyLevels(counters: CounterReading) {
  const cassette = Math.max(0, counters.cassette_capacity - counters.prints_since_cassette_reload);
  const ink = Math.max(0, counters.cartridge_capacity - counters.prints_since_reset);
  const stock = Math.max(0, counters.paper_stock_capacity - counters.prints_since_stock_set);
  return { cassette, ink, stock, printable: Math.min(cassette, ink, stock) };
}

export function maintenanceDiagnostics(snapshot: MaintenanceSnapshot) {
  const { health } = snapshot;
  const supplies = supplyLevels(health.counters);
  const storageLow = health.disk_free_bytes / health.disk_total_bytes <= 0.1;
  const healthNeedsAttention = !health.camera_ok
    || storageLow
    || (health.temperature_c !== null && health.temperature_c >= 80)
    || health.cpu_percent >= 85
    || health.memory_percent >= 85
    || health.undervoltage_now === true
    || health.undervoltage_occurred === true
    || health.throttled_now === true
    || health.throttled_occurred === true;
  const paperLow = supplies.printable <= 5;

  const status: MaintenanceStatus = paperLow
    ? "paper"
    : !health.camera_ok
      ? "camera"
      : storageLow
        ? "disk"
        : health.printer_driver === "offline"
          ? "printer"
          : "ready";

  return {
    status,
    supplies,
    healthNeedsAttention,
    printingNeedsAttention: paperLow || health.printer_driver === "offline",
    healthDetail: healthDetail(health),
    printingDetail: health.printer_driver === "offline"
      ? "Imprimante hors ligne · vérifier la liaison"
      : printingDetail(supplies),
  };
}

function printingDetail(supplies: ReturnType<typeof supplyLevels>) {
  if (supplies.stock === 0) return "Stock papier insuffisant · à mettre à jour";
  if (supplies.ink === 0) return "Cassette d’encre épuisée · à remplacer";
  if (supplies.cassette === 0) return "Bac vide · rechargez 18 feuilles";
  if (supplies.printable <= 2) return `Stock papier critique · ${supplies.printable} tirages restants`;
  if (supplies.printable <= 5) return `Stock papier bientôt faible · ${supplies.printable} tirages restants`;
  return `${supplies.printable} tirages avant intervention`;
}

function healthDetail(health: AdminHealth) {
  if (health.undervoltage_now) return "Sous-tension active · vérifier l’alimentation et le câble";
  if (health.undervoltage_occurred) return "Sous-tension détectée · vérifier l’alimentation et le câble";
  if (health.throttled_now) return "Performances limitées · vérifier alimentation et température";
  if (health.throttled_occurred) return "Throttling détecté depuis le démarrage · à surveiller";
  if (!health.camera_ok) return "Caméra absente · vérifier la connexion";
  if (health.disk_free_bytes / health.disk_total_bytes <= 0.1) return "Stockage presque plein · libérer de l’espace";
  if (health.temperature_c !== null && health.temperature_c >= 80) return "Température élevée · vérifier les aérations";
  if (health.cpu_percent >= 85) return "Processeur très sollicité · à surveiller";
  if (health.memory_percent >= 85) return "Mémoire très sollicitée · à surveiller";
  return `${Math.round(health.cpu_percent)} % CPU · ${Math.round(health.memory_percent)} % RAM`;
}
