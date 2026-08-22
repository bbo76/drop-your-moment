import { useCallback, useEffect, useRef, useState } from "react";

import { api, type SessionStatus, type SystemStatus } from "../shared/api";

const POLL_INTERVAL_MS = 500;

export type Connection = "connecting" | "online" | "offline";

export interface KioskState {
  session: SessionStatus | null;
  system: SystemStatus | null;
  connection: Connection;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
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
  const [connection, setConnection] = useState<Connection>("connecting");

  // Lu dans la boucle sans la faire redémarrer à chaque changement d'état.
  const systemRef = useRef<SystemStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        // Le statut système ne change qu'au branchement ou débranchement d'un
        // périphérique : on ne le relit que si on ne l'a pas encore, ou si on l'a perdu.
        if (!systemRef.current) {
          const fresh = await api.systemStatus();
          if (cancelled) return;
          systemRef.current = fresh;
          setSystem(fresh);
        }
        const status = await api.status();
        if (cancelled) return;
        setSession(status);
        setConnection("online");
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        systemRef.current = null;
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

  // Les transitions sont appliquées immédiatement depuis la réponse, sans attendre le
  // prochain tour de boucle : un demi-tour de retard sur un appui se verrait.
  const start = useCallback(async () => {
    setSession(await api.startSession());
  }, []);

  const cancel = useCallback(async () => {
    setSession(await api.cancelSession());
  }, []);

  return { session, system, connection, start, cancel };
}
