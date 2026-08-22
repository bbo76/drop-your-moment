import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  type EventInfo,
  type FilterName,
  type SessionStatus,
  type SystemStatus,
} from "../shared/api";

const POLL_INTERVAL_MS = 500;

export type Connection = "connecting" | "online" | "offline";

export interface KioskState {
  session: SessionStatus | null;
  system: SystemStatus | null;
  event: EventInfo | null;
  connection: Connection;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  capture: () => Promise<void>;
  chooseFilter: (name: FilterName) => Promise<void>;
  retake: () => Promise<void>;
}

/* Le frontend n'est qu'un afficheur : il lit l'état de la machine à états du serveur et
 * lui transmet les gestes du visiteur. Aucune règle de parcours ne vit ici, ce qui
 * permettra à une tablette ou un Mac de consommer la même API sans dupliquer de logique.
 *
 * La boucle enchaîne des setTimeout au lieu d'un setInterval : si le backend répond
 * lentement, les requêtes ne s'empilent pas. */
export function useKioskState(): KioskState {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");

  // Lus dans la boucle sans la faire redémarrer à chaque changement d'état.
  const systemRef = useRef<SystemStatus | null>(null);
  const eventRef = useRef<EventInfo | null>(null);

  // L'identifiant de session vient du serveur ; les actions le relisent ici pour éviter
  // de recréer les callbacks à chaque tour de boucle.
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = session?.session_id ?? null;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        // Capacités matérielles et réglages d'événement ne sont relus que s'ils
        // manquent : le premier ne change qu'au rebranchement, le second qu'au passage
        // de l'opérateur sur le portail d'administration.
        if (!systemRef.current) {
          const fresh = await api.systemStatus();
          if (cancelled) return;
          systemRef.current = fresh;
          setSystem(fresh);
        }
        if (!eventRef.current) {
          const fresh = await api.event();
          if (cancelled) return;
          eventRef.current = fresh;
          setEvent(fresh);
        }
        const status = await api.status();
        if (cancelled) return;
        setSession(status);
        setConnection("online");
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        systemRef.current = null;
        eventRef.current = null;
        setConnection("offline");
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  /* Les transitions sont appliquées immédiatement depuis la réponse, sans attendre le
   * prochain tour de boucle : un demi-tour de retard sur un appui se verrait. */
  const start = useCallback(async () => {
    setSession(await api.startSession());
  }, []);

  const cancel = useCallback(async () => {
    setSession(await api.cancelSession());
  }, []);

  /* Les actions liées à une session avalent un 409 : il signifie que la session a expiré
   * pendant l'interaction, et le prochain tour de boucle ramènera l'écran d'accueil. Ce
   * n'est pas une panne, inutile de basculer en « hors service ». */
  const withSession = useCallback(
    async (action: (id: string) => Promise<SessionStatus>) => {
      const id = sessionIdRef.current;
      if (!id) return;
      try {
        setSession(await action(id));
      } catch (error) {
        console.warn(error);
      }
    },
    [],
  );

  const capture = useCallback(() => withSession(api.capture), [withSession]);
  const retake = useCallback(() => withSession(api.retake), [withSession]);
  const chooseFilter = useCallback(
    (name: FilterName) => withSession((id) => api.chooseFilter(id, name)),
    [withSession],
  );

  return {
    session,
    system,
    event,
    connection,
    start,
    cancel,
    capture,
    chooseFilter,
    retake,
  };
}
