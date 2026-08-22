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
    <div className="grid h-full grid-rows-[1fr_auto] gap-3 p-3">
      <div className="grid min-h-0 place-content-center">
        {/* L'URL porte déjà une révision côté serveur : elle change à chaque
            recomposition, ce qui suffit à écarter l'image précédente du cache. */}
        <img
          src={photoUrl}
          alt="Votre photo"
          className="max-h-full max-w-full rounded-panel object-contain"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {availableFilters.map((name) => (
            <FilterButton
              key={name}
              name={name}
              active={name === selectedFilter}
              onClick={() => onChooseFilter(name)}
            />
          ))}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">
            {showReturnHint && `Retour à l'accueil dans ${Math.ceil(remainingSeconds)} s`}
          </span>
          <GhostButton onClick={onRetake}>Refaire la photo</GhostButton>
          {/* « Je garde » plutôt que « Imprimer » : pendant la phase numérique rien ne
              sort physiquement, et promettre un tirage serait mensonger. Le libellé
              deviendra « Imprimer » quand une imprimante sera branchée. */}
          <PrimaryButton onClick={onKeep}>Je garde cette photo</PrimaryButton>
        </div>
      </div>
    </div>
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
      className={`min-h-12 cursor-pointer rounded-panel border px-5 text-base ${
        active
          ? "border-accent bg-accent font-semibold text-accent-ink"
          : "border-edge text-body"
      }`}
    >
      {FILTER_LABELS[name]}
    </button>
  );
}
