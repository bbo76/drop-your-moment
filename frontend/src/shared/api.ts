/* Client d'API et types de réponse.
 *
 * Ces types sont écrits à la main en miroir des modèles Pydantic du backend. C'est
 * tenable tant que la surface est petite ; si elle grossit, la génération depuis le
 * schéma OpenAPI que FastAPI expose déjà supprimerait le risque de dérive.
 */

/** États de la machine à états de session, côté serveur. */
export type SessionState = "idle" | "preview" | "review" | "printing" | "done" | "error";

export type FilterName = "original" | "bw" | "sepia";

export const FILTER_LABELS: Record<FilterName, string> = {
  original: "Original",
  bw: "Noir & blanc",
  sepia: "Sépia",
};

export interface SessionStatus {
  state: SessionState;
  session_id: string | null;
  selected_filter: FilterName | null;
  /** Secondes avant retour automatique à l'accueil, ou null si l'état n'expire pas. */
  remaining_seconds: number | null;
  error: string | null;
  /** Porte déjà une révision anti-cache : à utiliser tel quel, sans y ajouter de suffixe. */
  photo_url: string | null;
}

/** Capacités du matériel. Ne changent qu'au rebranchement d'un périphérique. */
export interface SystemStatus {
  camera_ok: boolean;
  camera_driver: string;
  preview_size: [number, number];
  still_size: [number, number];
}

/** Réglages de l'événement. Modifiables depuis le portail d'administration. */
export interface EventInfo {
  event_name: string;
  available_filters: FilterName[];
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

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

export const api = {
  status: () => request<SessionStatus>("/api/status"),
  systemStatus: () => request<SystemStatus>("/api/system/status"),
  event: () => request<EventInfo>("/api/event"),

  startSession: () => post<SessionStatus>("/api/session"),
  cancelSession: () => post<SessionStatus>("/api/session/cancel"),

  capture: (sessionId: string) => post<SessionStatus>(`/api/session/${sessionId}/capture`),
  chooseFilter: (sessionId: string, name: FilterName) =>
    post<SessionStatus>(`/api/session/${sessionId}/filter`, { name }),
  retake: (sessionId: string) => post<SessionStatus>(`/api/session/${sessionId}/retake`),
};

/** URL du flux MJPEG.
 *
 * Le paramètre anti-cache est indispensable : sans lui, Chromium peut resservir une
 * frame mise en cache en revenant sur l'écran d'aperçu, ce qui se voit à l'écran comme
 * une image gelée.
 */
export const previewStreamUrl = () => `/api/preview/stream?t=${Date.now()}`;
