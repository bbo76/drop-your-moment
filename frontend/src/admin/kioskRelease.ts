import type { AdminHealth } from "../shared/api";

export function canReleaseKiosk(health: AdminHealth): boolean {
  return health.session_state !== "printing"
    && (health.session_state !== "idle" || health.maintenance_active);
}

export function releaseKioskCopy(health: AdminHealth) {
  return health.maintenance_active
    ? {
        button: "Fermer la maintenance à distance",
        title: "Fermer la maintenance ?",
        description: "L’intervention locale sera interrompue et la borne reviendra à l’accueil.",
        confirm: "Fermer la maintenance",
      }
    : {
        button: "Ramener la borne à l’accueil",
        title: "Ramener la borne à l’accueil ?",
        description: "La session en cours sera interrompue. Les invités devront recommencer leur parcours.",
        confirm: "Ramener à l’accueil",
      };
}
