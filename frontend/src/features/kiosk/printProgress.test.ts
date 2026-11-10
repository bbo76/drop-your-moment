import assert from "node:assert/strict";
import { copyLabel, globalProgress } from "./printProgress.ts";

const batch = {
  batch_id: "b", requested: 3, current_index: 2, completed: 1,
  phase: "printing", job_state: "printing", job_id: "cups-2", elapsed_s: 25, error: null,
} as const;
assert.equal(copyLabel(batch), "Exemplaire 2 sur 3");
assert.equal(globalProgress(batch), 50);
assert.ok(globalProgress({ ...batch, completed: 2, current_index: 3, elapsed_s: 1000 })! < 100);
assert.equal(globalProgress({ ...batch, phase: "pending" }), null);
assert.equal(globalProgress({ ...batch, phase: "uncertain" }), null);
assert.equal(globalProgress({ ...batch, completed: 3, phase: "completed" }), 100);
