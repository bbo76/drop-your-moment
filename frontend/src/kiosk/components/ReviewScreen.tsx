import { FILTER_LABELS, type FilterName } from "../../shared/api";
import { GhostButton, PrimaryButton } from "./Screen";

const RETURN_HINT_THRESHOLD_S = 30;

interface Props {
  photoUrl: string;
  availableFilters: FilterName[];
  selectedFilter: FilterName | null;
  remainingSeconds: number | null;
  onChooseFilter: (name: FilterName) => void;
  onRetake: () => void;
  onKeep: () => void;
}

export function ReviewScreen({
  photoUrl,
  availableFilters,
  selectedFilter,
  remainingSeconds,
  onChooseFilter,
  onRetake,
  onKeep,
}: Props) {
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
          className="max-h-full max-w-full rounded-panel object-contain"
        />
      </div>

      <section className="flex min-h-0 flex-col justify-between rounded-panel bg-surface p-5">
        <div>
          <h1 className="text-3xl leading-[1.08] font-bold tracking-[-0.02em]">Votre photo</h1>
          <p className="mt-1 text-base text-muted">Choisissez un rendu, puis gardez-la.</p>
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
          <GhostButton onClick={onRetake}>Refaire la photo</GhostButton>
          {/* « Je garde » plutôt que « Imprimer » : pendant la phase numérique rien ne
              sort physiquement, et promettre un tirage serait mensonger. Le libellé
              deviendra « Imprimer » quand une imprimante sera branchée. */}
          <PrimaryButton onClick={onKeep}>Je garde cette photo</PrimaryButton>
        </div>
      </section>
    </main>
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
      className={`min-h-14 cursor-pointer rounded-panel border-2 px-5 text-left text-lg font-medium ${
        active
          ? "border-signal bg-signal text-signal-ink"
          : "border-edge text-body"
      }`}
    >
      {FILTER_LABELS[name]}
    </button>
  );
}
