import assert from "node:assert/strict";
import { mock } from "node:test";

import {
  captureAfterScreenFlash,
  scheduleCountdownStep,
  type CapturePhase,
} from "./captureTiming.ts";

mock.timers.enable({ apis: ["setTimeout"] });

const initial = { kind: "counting", value: 3 } as const;
let phase: CapturePhase = initial;
const seen: CapturePhase[] = [initial];
let captures = 0;
let cancel = () => {};
const capture = () => { captures += 1; };
const advance = (next: CapturePhase) => {
  phase = next;
  seen.push(next);
  if (next.kind === "counting") cancel = scheduleCountdownStep(next, advance, capture);
};

cancel = scheduleCountdownStep(initial, advance, capture);
mock.timers.tick(999);
assert.deepEqual(seen, [{ kind: "counting", value: 3 }]);
mock.timers.tick(1);
assert.deepEqual(phase, { kind: "counting", value: 2 });
mock.timers.tick(1000);
assert.deepEqual(phase, { kind: "counting", value: 1 });
mock.timers.tick(999);
assert.equal(captures, 0);
mock.timers.tick(1);
assert.deepEqual(phase, { kind: "capturing" });
assert.equal(captures, 1);
cancel();

let exposed = false;
let completed = false;
const result = captureAfterScreenFlash(true, async () => {
  exposed = true;
  return "photo";
}).then((value) => {
  completed = true;
  return value;
});

mock.timers.tick(299);
await Promise.resolve();
assert.equal(exposed, false);
mock.timers.tick(1);
await Promise.resolve();
await Promise.resolve();
assert.equal(exposed, true);
assert.equal(completed, false);
mock.timers.tick(149);
await Promise.resolve();
assert.equal(completed, false);
mock.timers.tick(1);
assert.equal(await result, "photo");

mock.timers.reset();

assert.equal(
  await captureAfterScreenFlash(false, async () => "sans flash"),
  "sans flash",
);
