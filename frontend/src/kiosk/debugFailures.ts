import type { MaintenanceSnapshot, SystemStatus } from "../shared/api";

export type DebugFailure = "none" | "cassette" | "printer" | "camera" | "disk";

export const DEBUG_FAILURES: Array<{ value: DebugFailure; label: string }> = [
  { value: "none", label: "Réel" },
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
  return {
    ...status,
    camera_ok: failure === "camera" ? false : status.camera_ok,
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
  if (failure === "cassette") {
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
