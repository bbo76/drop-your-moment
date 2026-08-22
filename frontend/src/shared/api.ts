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
  preview_size: [number, number];
}

/** Format de sortie, en miroir du modèle `PrintFormat`. Quatre nombres, pas davantage. */
export interface PrintFormatPayload {
  name: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
}

/** Configuration d'événement complète, en miroir de `EventConfig`.
 *
 * `EventInfo` en est la projection que le kiosque consomme ; celle-ci est l'objet que
 * l'administration lit et réécrit tel quel. Le `PUT` remplace tout : d'où l'importance de
 * renvoyer l'objet reçu, `overlay_file` compris, plutôt qu'un sous-ensemble.
 */
export interface EventConfigPayload {
  event_name: string;
  overlay_file: string | null;
  available_filters: FilterName[];
  print_format: PrintFormatPayload;
  copies_per_print: number;
}

/** Réglages de l'événement. Modifiables depuis le portail d'administration. */
export interface EventInfo {
  event_name: string;
  available_filters: FilterName[];
  print_format_name: string;
  print_aspect_ratio: number;
}

/** Diagnostic servi par le portail d'administration, sur l'autre socket. */
export interface AdminHealth {
  camera_ok: boolean;
  camera_driver: string;
  session_state: SessionState;
  print_format_name: string;
  print_aspect_ratio: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(await errorMessage(response, path));
  return (await response.json()) as T;
}

interface ValidationIssue {
  loc?: unknown[];
  msg?: string;
}

/** Le `detail` de FastAPI plutôt qu'un code HTTP nu.
 *
 * Un opérateur qui téléverse un overlay au mauvais ratio doit lire les deux ratios, pas
 * « HTTP 422 » : le backend prend soin de composer ce message, autant l'afficher. Sur un
 * 422 de validation, `detail` est une liste d'objets par champ fautif — d'où les deux
 * formes traitées ici.
 */
async function errorMessage(response: Response, path: string): Promise<string> {
  try {
    const { detail } = (await response.json()) as { detail?: string | ValidationIssue[] };
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      // `loc` commence par « body » : sans intérêt pour l'opérateur, on le retire.
      return detail
        .map((issue) => `${issue.loc?.slice(1).join(".") ?? "?"} : ${issue.msg ?? "invalide"}`)
        .join(" ; ");
    }
  } catch {
    /* Réponse sans corps JSON : le code HTTP est tout ce qu'on a. */
  }
  return `${path} → HTTP ${response.status}`;
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
  printPhoto: (sessionId: string) => post<SessionStatus>(`/api/session/${sessionId}/print`),

  health: () => request<AdminHealth>("/admin/system/health"),
  eventConfig: () => request<EventConfigPayload>("/admin/event-config"),
  uploadOverlay: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    // Pas d'en-tête Content-Type : c'est au navigateur de composer la frontière multipart,
    // et la fixer à la main produit un corps que le backend ne sait pas découper.
    return request<EventConfigPayload>("/admin/overlay", { method: "POST", body: form });
  },
  deleteOverlay: () => request<EventConfigPayload>("/admin/overlay", { method: "DELETE" }),
  saveEventConfig: (config: EventConfigPayload) =>
    request<EventConfigPayload>("/admin/event-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
};

/** URL du flux MJPEG.
 *
 * Le paramètre anti-cache est indispensable : sans lui, Chromium peut resservir une
 * frame mise en cache en revenant sur l'écran d'aperçu, ce qui se voit à l'écran comme
 * une image gelée.
 */
export const previewStreamUrl = () => `/api/preview/stream?t=${Date.now()}`;

/** URL de l'overlay courant.
 *
 * La révision est indispensable même si le backend répond `no-store` : un `<img>` dont le
 * `src` ne change pas ne redemande rien, et l'opérateur croirait son téléversement perdu.
 */
export const overlayUrl = (revision: number) => `/admin/overlay?v=${revision}`;
