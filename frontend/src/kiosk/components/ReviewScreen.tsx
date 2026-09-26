import { Printer, RotateCcw, Save } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { FILTER_LABELS, type FilterName } from "../../shared/api";
import { PrimaryButton } from "./Screen";

const RETURN_HINT_THRESHOLD_S = 30;

interface Props {
  photoUrl: string;
  availableFilters: FilterName[];
  selectedFilter: FilterName | null;
  remainingSeconds: number | null;
  onChooseFilter: (name: FilterName) => void;
  onRetake: () => void;
  onKeep: (copies: number) => void;
  onSave: () => void;
  printingAvailable: boolean;
  printsRemaining: number;
}

export function ReviewScreen({
  photoUrl,
  availableFilters,
  selectedFilter,
  remainingSeconds,
  onChooseFilter,
  onRetake,
  onKeep,
  onSave,
  printingAvailable,
  printsRemaining,
}: Props) {
  const [copies, setCopies] = useState(1);
  const maxCopies = Math.max(1, Math.min(10, printsRemaining));
  useEffect(() => setCopies((value) => Math.min(value, maxCopies)), [maxCopies]);
  const showReturnHint =
    remainingSeconds !== null && remainingSeconds <= RETURN_HINT_THRESHOLD_S;

  return (
    <main className="grid h-full grid-cols-[1.3fr_1fr] gap-4 p-4">
      <div className="grid min-h-0 place-content-center">
        {/* L'URL porte déjà une révision côté serveur : elle change à chaque
            recomposition, ce qui suffit à écarter l'image précédente du cache. */}
        <img
          src={photoUrl}
          alt="Votre photo"
          className="photo-develop max-h-full max-w-full rounded-panel object-contain"
        />
      </div>

      <section className="flex min-h-0 flex-col justify-between rounded-panel bg-surface p-5">
        <div>
          <h1 className="text-3xl leading-[1.08] font-bold tracking-[-0.02em]">Votre photo</h1>
          <p className="mt-1 text-base text-muted">Choisissez un rendu, puis ce que vous voulez en faire.</p>
        </div>
        <div className="grid gap-2">
          {availableFilters.map((name) => (
            <FilterButton
              key={name}
              name={name}
              active={name === selectedFilter}
              onClick={() => onChooseFilter(name)}
            />
          ))}
        </div>
        <div className="grid gap-2">
          <span className="text-sm text-muted">
            {showReturnHint && `Retour à l'accueil dans ${Math.ceil(remainingSeconds)} s`}
          </span>
          {printingAvailable && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-muted">Nombre d'exemplaires</legend>
              <div className="grid grid-cols-[1fr_1.35fr_1fr] gap-2">
                <CopyStepButton
                  label="Retirer un exemplaire"
                  disabled={copies === 1}
                  onClick={() => setCopies((value) => value - 1)}
                >
                  −
                </CopyStepButton>
                <output
                  aria-live="polite"
                  className="grid min-h-14 place-items-center rounded-panel border-2 border-signal bg-signal text-2xl font-bold tabular-nums text-signal-ink"
                >
                  {copies}
                </output>
                <CopyStepButton
                  label="Ajouter un exemplaire"
                  disabled={copies === maxCopies}
                  onClick={() => setCopies((value) => value + 1)}
                >
                  +
                </CopyStepButton>
              </div>
            </fieldset>
          )}
          <PrimaryButton onClick={() => onKeep(copies)} disabled={!printingAvailable}>
            <Printer className="size-6" aria-hidden="true" />
            {printingAvailable
              ? `Imprimer ${copies} exemplaire${copies > 1 ? "s" : ""}`
              : "Impression indisponible"}
          </PrimaryButton>
          {!printingAvailable && <p className="text-center text-sm text-warn">Vous pouvez toujours enregistrer la photo.</p>}
          <div className="grid grid-cols-2 gap-2">
            <ReviewAction icon={<Save />} onClick={onSave}>Enregistrer sans imprimer</ReviewAction>
            <ReviewAction icon={<RotateCcw />} onClick={onRetake}>Refaire la photo</ReviewAction>
          </div>
        </div>
      </section>
    </main>
  );
}

function CopyStepButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="min-h-14 rounded-panel border-2 border-edge text-3xl font-medium text-body transition-transform duration-150 active:scale-[0.97] disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function ReviewAction({
  children,
  icon,
  onClick,
}: {
  children: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center justify-center gap-2 rounded-panel border-2 border-edge px-3 text-base leading-tight font-medium text-body transition-[background-color,transform] duration-150 active:scale-[0.97]"
    >
      <span className="[&>svg]:size-5" aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}

function FilterButton({
  name,
  active,
  onClick,
}: {
  name: FilterName;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-14 cursor-pointer rounded-panel border-2 px-5 text-left text-lg font-medium transition-[background-color,border-color,color,transform] duration-240 active:scale-[0.98] ${
        active
          ? "border-signal bg-signal text-signal-ink"
          : "border-edge text-body"
      }`}
    >
      {FILTER_LABELS[name]}
    </button>
  );
}
