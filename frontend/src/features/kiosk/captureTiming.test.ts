import assert from "node:assert/strict";
import { mock } from "node:test";

import { scheduleCountdownStep, type CapturePhase } from "./captureTiming.ts";

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
assert.deepEqual(phase, { kind: "counting", value: 0 });
mock.timers.tick(999);
assert.equal(captures, 0);
mock.timers.tick(1);
assert.deepEqual(phase, { kind: "capturing" });
assert.equal(captures, 1);
cancel();

mock.timers.reset();
