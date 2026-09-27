export const COUNTDOWN_STEP_MS = 1000;
export const SCREEN_FLASH_LEAD_MS = 300;
export const SCREEN_FLASH_HOLD_MS = 150;

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
    if (phase.value > 1) {
      setPhase({ kind: "counting", value: phase.value - 1 });
      return;
    }
    setPhase({ kind: "capturing" });
    capture();
  }, COUNTDOWN_STEP_MS);
  return () => clearTimeout(timer);
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function captureAfterScreenFlash<T>(
  screenFlashEnabled: boolean,
  capture: () => Promise<T>,
): Promise<T> {
  if (screenFlashEnabled) await wait(SCREEN_FLASH_LEAD_MS);
  const result = await capture();
  if (screenFlashEnabled) await wait(SCREEN_FLASH_HOLD_MS);
  return result;
}
