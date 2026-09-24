import assert from "node:assert/strict";

import type { MaintenanceSnapshot, SystemStatus } from "../../shared/api";
import { mockMaintenanceSnapshot, mockSystemStatus } from "../debugFailures.ts";
import { maintenanceDiagnostics, resolveMaintenancePrint } from "./maintenanceDiagnostics.ts";

const snapshot = {
  power_available: true,
  print_busy: false,
  print_error: null,
  settings: {
    default_shot_timer_seconds: 3,
    screen_flash_enabled: true,
    accent_color: "#ffd400",
    launch_font: "modern",
  },
  health: {
    camera_ok: true,
    camera_driver: "camera",
    preview_streams: 0,
    preview_size: [1024, 600],
    still_size: [1800, 1200],
    printer_driver: "cp1500",
    session_state: "idle",
    maintenance_active: true,
    power_available: true,
    power_transition: null,
    event_name: "Test",
    print_format_name: "postcard",
    print_aspect_ratio: 1.5,
    counters: {
      prints_total: 0,
      prints_since_reset: 0,
      reset_at: null,
      cartridge_capacity: 36,
      prints_since_cassette_reload: 0,
      cassette_capacity: 18,
      paper_stock_capacity: 50,
      prints_since_stock_set: 0,
      stock_set_at: null,
    },
    disk_free_bytes: 20,
    disk_total_bytes: 100,
    cpu_percent: 10,
    memory_used_bytes: 10,
    memory_total_bytes: 100,
    memory_percent: 10,
    temperature_c: 40,
    undervoltage_now: false,
    undervoltage_occurred: false,
    throttled_now: false,
    throttled_occurred: false,
  },
} satisfies MaintenanceSnapshot;

assert.equal(maintenanceDiagnostics(snapshot).status, "ready");
const printing = { state: "printing", copies: 2, targetPrintsTotal: 2 } as const;
assert.equal(resolveMaintenancePrint(printing, snapshot)?.state, "printing");
assert.equal(
  resolveMaintenancePrint(printing, {
    ...snapshot,
    health: { ...snapshot.health, counters: { ...snapshot.health.counters, prints_total: 2 } },
  })?.state,
  "complete",
);
assert.equal(
  resolveMaintenancePrint(printing, { ...snapshot, print_error: "papier bloqué" })?.state,
  "error",
);
assert.equal(
  maintenanceDiagnostics({ ...snapshot, health: { ...snapshot.health, undervoltage_now: true } }).healthDetail,
  "Sous-tension active · vérifier l’alimentation et le câble",
);
assert.equal(
  maintenanceDiagnostics({
    ...snapshot,
    health: { ...snapshot.health, counters: { ...snapshot.health.counters, prints_since_cassette_reload: 18 } },
  }).status,
  "paper",
);
assert.equal(
  maintenanceDiagnostics({ ...snapshot, health: { ...snapshot.health, camera_ok: false } }).healthDetail,
  "Caméra absente · vérifier la connexion",
);
const lowPaper = {
  ...snapshot,
  health: {
    ...snapshot.health,
    counters: { ...snapshot.health.counters, paper_stock_capacity: 5 },
  },
} satisfies MaintenanceSnapshot;
assert.equal(maintenanceDiagnostics(lowPaper).status, "paper");
assert.equal(
  maintenanceDiagnostics(lowPaper).printingDetail,
  "Stock papier bientôt faible · 5 tirages restants",
);
const criticalPaper = {
  ...snapshot,
  health: {
    ...snapshot.health,
    counters: { ...snapshot.health.counters, paper_stock_capacity: 2 },
  },
} satisfies MaintenanceSnapshot;
assert.equal(
  maintenanceDiagnostics(criticalPaper).printingDetail,
  "Stock papier critique · 2 tirages restants",
);

const system = {
  camera_ok: true,
  printer_ok: true,
  operator_attention: false,
  prints_remaining: 18,
  preview_size: [640, 360],
} satisfies SystemStatus;
assert.equal(mockSystemStatus(system, "paper-low")?.prints_remaining, 5);
assert.equal(mockSystemStatus(system, "paper-critical")?.prints_remaining, 2);
assert.equal(mockSystemStatus(system, "paper-empty")?.prints_remaining, 0);
assert.equal(mockSystemStatus(system, "printer")?.printer_ok, false);
assert.equal(
  maintenanceDiagnostics(mockMaintenanceSnapshot(snapshot, "power")).healthDetail,
  "Sous-tension active · vérifier l’alimentation et le câble",
);
assert.equal(
  maintenanceDiagnostics(mockMaintenanceSnapshot(snapshot, "paper-empty")).printingDetail,
  "Stock papier insuffisant · à mettre à jour",
);
