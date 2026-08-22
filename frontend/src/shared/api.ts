/* Client d'API et types de réponse.
 *
 * Ces types sont écrits à la main en miroir des modèles Pydantic du backend. C'est
 * tenable tant que la surface est petite ; si elle grossit, la génération depuis le
 * schéma OpenAPI que FastAPI expose déjà supprimerait le risque de dérive.
 */

/** États de la machine à états de session, côté serveur. */
export type SessionState = "idle" | "preview" | "review" | "printing" | "done" | "error";

export type FilterName = "original" | "bw" | "sepia";

export interface SessionStatus {
  state: SessionState;
  session_id: string | null;
  selected_filter: FilterName | null;
  /** Secondes avant retour automatique à l'accueil, ou null si l'état n'expire pas. */
  remaining_seconds: number | null;
  error: string | null;
}

export interface SystemStatus {
  camera_ok: boolean;
  camera_driver: string;
  preview_size: [number, number];
  still_size: [number, number];
  print_format_name: string;
  print_aspect_ratio: number;
}

export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`${path} → HTTP ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  if (!response.ok) throw new ApiError(path, response.status);
  return (await response.json()) as T;
}

export const api = {
  status: () => request<SessionStatus>("/api/status"),
  systemStatus: () => request<SystemStatus>("/api/system/status"),
  startSession: () => request<SessionStatus>("/api/session", { method: "POST" }),
  cancelSession: () => request<SessionStatus>("/api/session/cancel", { method: "POST" }),
};

/** URL du flux MJPEG.
 *
 * Le paramètre anti-cache est indispensable : sans lui, Chromium peut resservir une
 * frame mise en cache en revenant sur l'écran d'aperçu, ce qui se voit à l'écran comme
 * une image gelée.
 */
export const previewStreamUrl = () => `/api/preview/stream?t=${Date.now()}`;
