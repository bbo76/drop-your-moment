import type { PrintProgress } from "@/api/client";

export function copyLabel(batch: PrintProgress): string {
  return `Exemplaire ${batch.current_index} sur ${batch.requested}`;
}

// Estimation CP1500 : environ 50 s pour les passes physiques observées.
// Le backend garde la main sur les erreurs et peut terminer plus tôt si nécessaire.
/** Only CUPS completions are definite; intra-job time is an estimate, not physical progress. */
export function globalProgress(batch: PrintProgress | null): number | null {
  if (!batch) return null;
  if (batch.phase === "completed" && batch.completed === batch.requested) return 100;
  if (batch.phase !== "printing" || batch.elapsed_s === null) return null;
  return Math.min(99, ((batch.completed + Math.min(0.9, batch.elapsed_s / 50)) / batch.requested) * 100);
}
