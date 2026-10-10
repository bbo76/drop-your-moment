export const COUNTDOWN_STEP_MS = 1000;
export type CapturePhase =
  | { kind: "waiting" }
  | { kind: "counting"; value: number }
  | { kind: "capturing" };

export function scheduleCountdownStep(
  phase: Extract<CapturePhase, { kind: "counting" }>,
  setPhase: (phase: CapturePhase) => void,
  capture: () => void,
) {
  const timer = setTimeout(() => {
    if (phase.value > 0) {
      setPhase({ kind: "counting", value: phase.value - 1 });
      return;
    }
    setPhase({ kind: "capturing" });
    capture();
  }, COUNTDOWN_STEP_MS);
  return () => clearTimeout(timer);
}
