import { Power, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import type { PowerTransition } from "../../shared/api";

const NOTICE_SECONDS = 30;

export function RemotePowerNotice({ transition }: { transition: PowerTransition }) {
  const [remaining, setRemaining] = useState(() => secondsUntil(transition.execute_at));

  useEffect(() => {
    setRemaining(secondsUntil(transition.execute_at));
    const timer = window.setInterval(
      () => setRemaining(secondsUntil(transition.execute_at)),
      250,
    );
    return () => window.clearInterval(timer);
  }, [transition.execute_at]);

  const reboot = transition.action === "reboot";
  const Icon = reboot ? RotateCcw : Power;

  return (
    <main
      className="fixed inset-0 z-100 grid place-items-center bg-black/75 p-6 text-body"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remote-power-title"
      aria-describedby="remote-power-description"
    >
      <section className="w-full max-w-2xl rounded-panel border-2 border-warn bg-ink p-8">
        <Icon className="size-16 text-warn" strokeWidth={1.8} aria-hidden="true" />
        <h1 id="remote-power-title" className="mt-6 text-5xl leading-none font-bold tracking-[-0.02em]">
          {reboot ? "Redémarrage programmé" : "Arrêt programmé"}
        </h1>
        <p id="remote-power-description" className="mt-4 text-2xl text-muted">
          Une demande a été envoyée depuis l’administration.
        </p>
        <div className="mt-8 flex items-end justify-between gap-6">
          <span className="text-xl font-medium text-muted">
            {reboot ? "La borne va redémarrer dans" : "La borne va s’éteindre dans"}
          </span>
          <strong className="text-6xl leading-none font-bold tabular-nums text-warn">
            {remaining} s
          </strong>
        </div>
        <div className="mt-4 h-4 overflow-hidden rounded-[0.35rem] border-2 border-edge bg-surface">
          <span
            className="block h-full bg-warn transition-[width] duration-250 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.min(100, (remaining / NOTICE_SECONDS) * 100)}%` }}
          />
        </div>
      </section>
    </main>
  );
}

const secondsUntil = (executeAt: number) =>
  Math.max(0, Math.ceil(executeAt - Date.now() / 1000));
