import type { MaintenanceSnapshot, SystemStatus } from "../shared/api";

export type DebugFailure =
  | "none"
  | "paper-low"
  | "paper-critical"
  | "paper-empty"
  | "cassette"
  | "printer"
  | "camera"
  | "disk";

export const DEBUG_FAILURES: Array<{ value: DebugFailure; label: string }> = [
  { value: "none", label: "Réel" },
  { value: "paper-low", label: "Papier bientôt faible · 5" },
  { value: "paper-critical", label: "Papier critique · 2" },
  { value: "paper-empty", label: "Papier insuffisant · 0" },
  { value: "cassette", label: "Bac vide" },
  { value: "printer", label: "Imprimante" },
  { value: "camera", label: "Caméra" },
  { value: "disk", label: "Disque" },
];

export function debugFailuresEnabled() {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export function mockSystemStatus(
  status: SystemStatus | null,
  failure: DebugFailure,
): SystemStatus | null {
  if (!status || failure === "none") return status;
  const simulatedRemaining = failure === "paper-low"
    ? 5
    : failure === "paper-critical"
      ? 2
      : failure === "paper-empty" || failure === "cassette"
        ? 0
        : status.prints_remaining;
  return {
    ...status,
    camera_ok: failure === "camera" ? false : status.camera_ok,
    printer_ok: failure === "printer" ? false : status.printer_ok,
    prints_remaining: simulatedRemaining,
    operator_attention: true,
  };
}

export function mockMaintenanceSnapshot(
  snapshot: MaintenanceSnapshot,
  failure: DebugFailure,
): MaintenanceSnapshot {
  if (failure === "none") return snapshot;
  // Chaque scénario part d'une base saine : une panne réelle ne doit pas masquer celle
  // que le développeur cherche précisément à inspecter.
  const health = {
    ...snapshot.health,
    camera_ok: true,
    disk_free_bytes: Math.max(
      snapshot.health.disk_free_bytes,
      Math.floor(snapshot.health.disk_total_bytes * 0.2),
    ),
    counters: {
      ...snapshot.health.counters,
      prints_since_cassette_reload: 0,
      prints_since_reset: 0,
    },
  };
  const paperRemaining = failure === "paper-low" ? 5 : failure === "paper-critical" ? 2 : failure === "paper-empty" ? 0 : null;
  if (paperRemaining !== null) {
    health.counters.prints_since_stock_set = Math.max(
      0,
      health.counters.paper_stock_capacity - paperRemaining,
    );
  } else if (failure === "cassette") {
    health.counters.prints_since_cassette_reload = health.counters.cassette_capacity;
  } else if (failure === "printer") {
    health.printer_driver = "offline";
  } else if (failure === "camera") {
    health.camera_ok = false;
  } else if (failure === "disk") {
    health.disk_free_bytes = Math.floor(health.disk_total_bytes * 0.05);
  }
  return { ...snapshot, health };
}
