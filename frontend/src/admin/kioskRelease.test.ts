import assert from "node:assert/strict";

import type { AdminHealth } from "../shared/api";
import { canReleaseKiosk, releaseKioskCopy } from "./kioskRelease.ts";

const health = (session_state: AdminHealth["session_state"], maintenance_active = false) => ({
  session_state,
  maintenance_active,
} as AdminHealth);

assert.equal(canReleaseKiosk(health("idle")), false);
assert.equal(canReleaseKiosk(health("idle", true)), true);
assert.equal(canReleaseKiosk(health("preview")), true);
assert.equal(canReleaseKiosk(health("review")), true);
assert.equal(canReleaseKiosk(health("done")), true);
assert.equal(canReleaseKiosk(health("error")), true);
assert.equal(canReleaseKiosk(health("printing")), false);
assert.equal(canReleaseKiosk(health("printing", true)), false);
assert.equal(releaseKioskCopy(health("idle", true)).confirm, "Fermer la maintenance");
assert.equal(releaseKioskCopy(health("review")).confirm, "Ramener à l’accueil");
