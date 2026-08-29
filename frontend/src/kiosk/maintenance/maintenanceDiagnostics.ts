import type { AdminHealth, CounterReading, MaintenanceSnapshot } from "../../shared/api";

export type MaintenanceStatus = "ready" | "paper" | "camera" | "disk" | "printer";

export function supplyLevels(counters: CounterReading) {
  const cassette = Math.max(0, counters.cassette_capacity - counters.prints_since_cassette_reload);
  const ink = Math.max(0, counters.cartridge_capacity - counters.prints_since_reset);
  const stock = Math.max(0, counters.paper_stock_capacity - counters.prints_since_stock_set);
  return { cassette, ink, stock, printable: Math.min(cassette, ink, stock) };
}

export function maintenanceDiagnostics(snapshot: MaintenanceSnapshot) {
  const { health, settings } = snapshot;
  const supplies = supplyLevels(health.counters);
  const storageLow = health.disk_free_bytes / health.disk_total_bytes <= 0.1;
  const healthNeedsAttention = !health.camera_ok
    || storageLow
    || (health.temperature_c !== null && health.temperature_c >= 80)
    || health.cpu_percent >= 85
    || health.memory_percent >= 85;
  const paperReady = supplies.printable >= settings.copies_per_print;

  const status: MaintenanceStatus = !paperReady
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
    printingNeedsAttention: !paperReady || health.printer_driver === "offline",
    healthDetail: healthDetail(health),
    printingDetail: health.printer_driver === "offline"
      ? "Imprimante hors ligne · vérifier la liaison"
      : printingDetail(supplies, settings.copies_per_print),
  };
}

function printingDetail(supplies: ReturnType<typeof supplyLevels>, copies: number) {
  if (supplies.stock < copies) return "Stock papier insuffisant · à mettre à jour";
  if (supplies.ink < copies) return "Cassette d’encre épuisée · à remplacer";
  if (supplies.cassette < copies) return "Bac vide · rechargez 18 feuilles";
  return `${copies} copie${copies > 1 ? "s" : ""} · ${supplies.printable} tirages avant intervention`;
}

function healthDetail(health: AdminHealth) {
  if (!health.camera_ok) return "Caméra absente · vérifier la connexion";
  if (health.disk_free_bytes / health.disk_total_bytes <= 0.1) return "Stockage presque plein · libérer de l’espace";
  if (health.temperature_c !== null && health.temperature_c >= 80) return "Température élevée · vérifier les aérations";
  if (health.cpu_percent >= 85) return "Processeur très sollicité · à surveiller";
  if (health.memory_percent >= 85) return "Mémoire très sollicitée · à surveiller";
  return `${Math.round(health.cpu_percent)} % CPU · ${Math.round(health.memory_percent)} % RAM`;
}
