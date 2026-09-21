import { Power, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import {
  api,
  type AdminHealth,
  type PowerAction,
  type PowerTransition,
} from "../shared/api";

export function PowerControls({
  health,
  onScheduled,
}: {
  health: AdminHealth;
  onScheduled: (transition: PowerTransition) => void;
}) {
  const [confirmation, setConfirmation] = useState<PowerAction | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = usePowerCountdown(health.power_transition);
  const printing = health.session_state === "printing";
  const blocked = printing || !health.power_available || health.power_transition !== null || working;

  const schedule = async () => {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    setWorking(true);
    setError(null);
    try {
      onScheduled(await api.schedulePowerAction(action));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid gap-3">
      {health.power_transition && (
        <Alert className="border-amber-600/35 bg-amber-50 text-amber-900" role="status">
          <AlertTitle>
            {health.power_transition.action === "reboot" ? "Redémarrage" : "Arrêt"} dans {remaining} s
          </AlertTitle>
          <AlertDescription>Le kiosk affiche l’avertissement.</AlertDescription>
        </Alert>
      )}

      {printing && (
        <p className="flex items-start gap-2 text-sm font-medium text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Impression en cours — les commandes d’alimentation sont verrouillées.
        </p>
      )}
      {!printing && !health.power_available && (
        <p className="text-sm text-muted-foreground">Commandes disponibles uniquement sur la borne Raspberry Pi.</p>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" disabled={blocked} onClick={() => setConfirmation("reboot")}>
          <RotateCcw aria-hidden="true" />
          Redémarrer
        </Button>
        <Button type="button" variant="destructive" disabled={blocked} onClick={() => setConfirmation("poweroff")}>
          <Power aria-hidden="true" />
          Éteindre
        </Button>
      </div>

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "reboot" ? "Redémarrer la borne ?" : "Éteindre la borne ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le kiosk avertira les personnes présentes pendant 30 secondes. {confirmation === "reboot"
                ? "Il reviendra automatiquement après le redémarrage."
                : "Un rallumage physique sera nécessaire."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation === "poweroff" ? "destructive" : "default"}
              onClick={() => void schedule()}
            >
              {confirmation === "reboot" ? "Programmer le redémarrage" : "Programmer l’arrêt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function usePowerCountdown(transition: PowerTransition | null) {
  const [remaining, setRemaining] = useState(() => secondsUntil(transition));

  useEffect(() => {
    setRemaining(secondsUntil(transition));
    if (!transition) return;
    const timer = window.setInterval(() => setRemaining(secondsUntil(transition)), 1_000);
    return () => window.clearInterval(timer);
  }, [transition]);

  return remaining;
}

const secondsUntil = (transition: PowerTransition | null) =>
  transition ? Math.max(0, Math.ceil(transition.execute_at - Date.now() / 1000)) : 0;
