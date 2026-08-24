import { useEffect, useState } from "react";

import {
  api,
  FILTER_LABELS,
  overlayUrl,
  type EventConfigPayload,
  type FilterName,
  type LaunchFont,
  type PrintFormatPayload,
  type ShotTimerSeconds,
} from "../shared/api";
import { Button, Feedback, Field, inputClass, Section } from "./ui";

/* Réglages de l'événement.
 *
 * Un formulaire sur un objet unique : on lit la configuration, on l'édite localement, on
 * la renvoie entière. Pas de fusion partielle côté serveur — l'opérateur a l'objet complet
 * sous les yeux, et un PATCH demanderait de distinguer « champ absent » de « champ vidé ».
 *
 * `overlay_file` n'est pas un champ de saisie mais voyage dans le brouillon : le `PUT`
 * remplace tout, et l'oublier effacerait le branding de l'événement à chaque
 * enregistrement. Seul le téléversement écrit ce champ. */

const ALL_FILTERS = Object.keys(FILTER_LABELS) as FilterName[];
const SHOT_TIMER_OPTIONS: ShotTimerSeconds[] = [3, 5, 10];
const LAUNCH_FONTS: Array<{ value: LaunchFont; label: string; sample: string }> = [
  { value: "modern", label: "Moderne", sample: "Un moment à vous" },
  { value: "geometric", label: "Graphique", sample: "Place à la fête" },
  { value: "prestigious", label: "Prestigieuse", sample: "Célébrons ensemble" },
  { value: "editorial", label: "Romantique", sample: "Notre belle histoire" },
  { value: "couture", label: "Couture", sample: "Une soirée d’exception" },
  { value: "handwritten", label: "Manuscrite", sample: "Souriez !" },
  { value: "elegant_script", label: "Calligraphique", sample: "Pour toujours" },
  { value: "festive", label: "Festive", sample: "Que la fête commence" },
  { value: "playful", label: "Ludique", sample: "Cheese !" },
  { value: "spooky", label: "Halloween", sample: "Entrez si vous osez" },
  { value: "ceremonial", label: "Cérémonie", sample: "Un jour mémorable" },
  { value: "cinematic", label: "Cinéma", sample: "À vous la lumière" },
];

export function EventSection() {
  const [draft, setDraft] = useState<EventConfigPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Anti-cache de l'aperçu : l'URL de l'overlay est fixe, donc rien ne rechargerait
  // l'image après un remplacement.
  const [overlayRevision, setOverlayRevision] = useState(0);

  useEffect(() => {
    api.eventConfig().then(setDraft, (cause) => setError(String(cause)));
  }, []);

  if (!draft) {
    return (
      <Section title="Événement">
        <Feedback error={error} notice="Chargement…" />
      </Section>
    );
  }

  const patch = (changes: Partial<EventConfigPayload>) => {
    setDraft({ ...draft, ...changes });
    setNotice(null);
  };

  const patchFormat = (changes: Partial<PrintFormatPayload>) =>
    patch({ print_format: { ...draft.print_format, ...changes } });

  const toggleFilter = (name: FilterName) =>
    patch({
      available_filters: draft.available_filters.includes(name)
        ? draft.available_filters.filter((each) => each !== name)
        : // Ordre stable : sinon les boutons de l'écran de review se réordonnent au gré
        // des clics de l'opérateur.
        ALL_FILTERS.filter((each) => each === name || draft.available_filters.includes(each)),
    });

  /** Le téléversement ne rapatrie que `overlay_file` : le reste de la réponse est la
   *  configuration enregistrée, qui écraserait des modifications encore en cours. */
  const runOverlayAction = async (
    action: () => Promise<EventConfigPayload>,
    successMessage: string,
  ) => {
    setError(null);
    setNotice(null);
    try {
      const { overlay_file } = await action();
      setDraft({ ...draft, overlay_file });
      setOverlayRevision((revision) => revision + 1);
      setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      setDraft(await api.saveEventConfig(draft));
      setNotice("Enregistré — le kiosque applique le changement sans redémarrage.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Événement">
      <div className="grid max-w-4xl gap-4">
        <Field label="Nom de l'événement">
          <input
            className={inputClass}
            value={draft.event_name}
            onChange={(e) => patch({ event_name: e.target.value })}
          />
        </Field>

        <Field label="Message de l’écran d’accueil">
          <input
            className={inputClass}
            value={draft.launch_message}
            maxLength={80}
            onChange={(e) => patch({ launch_message: e.target.value })}
          />
          <span className="mt-1 block text-xs text-muted">
            Indépendant du nom de l’événement et de l’overlay photo.
          </span>
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm text-muted">Style du message d’accueil</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {LAUNCH_FONTS.map((font) => (
              <button
                key={font.value}
                type="button"
                aria-pressed={draft.launch_font === font.value}
                onClick={() => patch({ launch_font: font.value })}
                className={`rounded-panel border-2 p-4 text-left transition-colors ${
                  draft.launch_font === font.value
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-edge bg-surface text-body"
                }`}
              >
                <span className="block text-sm font-bold">{font.label}</span>
                <span
                  className={`launch-font-${font.value} mt-3 block text-2xl leading-tight`}
                >
                  {font.sample}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Couleur dominante de la borne">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={draft.accent_color}
              onChange={(e) => patch({ accent_color: e.target.value })}
              className="h-12 w-16 cursor-pointer rounded border-2 border-edge bg-surface p-1"
              aria-label="Choisir la couleur dominante"
            />
            <input
              className={`${inputClass} max-w-36 font-mono uppercase`}
              value={draft.accent_color}
              pattern="#[0-9a-fA-F]{6}"
              maxLength={7}
              onChange={(e) => patch({ accent_color: e.target.value })}
              aria-label="Couleur dominante en hexadécimal"
            />
            <span className="text-sm text-muted">Boutons, sélections et décompte</span>
          </div>
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm text-muted">Filtres proposés</legend>
          <div className="flex gap-4">
            {ALL_FILTERS.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.available_filters.includes(name)}
                  onChange={() => toggleFilter(name)}
                />
                {FILTER_LABELS[name]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm text-muted">
            Format de sortie — fixe le recadrage et le cadre de visée, même sans imprimante
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Nom" className="sm:col-span-2">
              <input
                className={inputClass}
                value={draft.print_format.name}
                onChange={(e) => patchFormat({ name: e.target.value })}
              />
            </Field>
            <Field label="Largeur (mm)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={draft.print_format.width_mm}
                onChange={(e) => patchFormat({ width_mm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Hauteur (mm)">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={draft.print_format.height_mm}
                onChange={(e) => patchFormat({ height_mm: Number(e.target.value) })}
              />
            </Field>
            <Field label="DPI">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={draft.print_format.dpi}
                onChange={(e) => patchFormat({ dpi: Number(e.target.value) })}
              />
            </Field>
          </div>
          <p className="mt-1 text-sm text-muted">
            Ratio : {(draft.print_format.width_mm / draft.print_format.height_mm).toFixed(3)}
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm text-muted">
            Overlay — cadre ou logo composé par-dessus la photo. PNG transparent, au ratio
            du format de sortie
          </legend>
          {draft.overlay_file ? (
            <div className="flex flex-wrap items-start gap-4">
              <img
                src={overlayUrl(overlayRevision)}
                alt="Overlay de l'événement"
                /* Le damier rend la transparence visible : sur fond uni, un overlay opaque
                   et un overlay ajouré se ressemblent. */
                className="h-36 rounded border border-edge bg-[repeating-conic-gradient(#333846_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
              />
              <Button
                onClick={() => void runOverlayAction(api.deleteOverlay, "Overlay retiré.")}
              >
                Retirer
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">Aucun overlay — les photos sortiront sans cadre.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-12 cursor-pointer items-center rounded-panel bg-accent px-5 font-bold text-accent-ink transition-transform active:scale-[0.98]">
              {draft.overlay_file ? "Remplacer l’overlay" : "Choisir un overlay PNG"}
              <input
                type="file"
                accept="image/png"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Réinitialiser permet de retenter le même fichier après un refus.
                  e.target.value = "";
                  if (file) {
                    void runOverlayAction(
                      () => api.uploadOverlay(file),
                      "Overlay chargé et appliqué au kiosque.",
                    );
                  }
                }}
              />
            </label>
            <span className="max-w-md text-sm text-muted">
              PNG transparent, de même orientation et de proportions proches. Définition recommandée : {Math.round((draft.print_format.width_mm / 25.4) * draft.print_format.dpi)}×{Math.round((draft.print_format.height_mm / 25.4) * draft.print_format.dpi)} px. Les fichiers plus grands sont réduits ; les plus petits ne sont pas agrandis.
            </span>
          </div>
        </fieldset>

        <Field label="Copies par tirage">
          <input
            type="number"
            min={1}
            max={10}
            className={inputClass}
            value={draft.copies_per_print}
            onChange={(e) => patch({ copies_per_print: Number(e.target.value) })}
          />
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm text-muted">Minuteur photo par défaut</legend>
          <div className="inline-flex rounded-panel border-2 border-edge bg-surface p-1">
            {SHOT_TIMER_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                aria-pressed={draft.default_shot_timer_seconds === seconds}
                onClick={() => patch({ default_shot_timer_seconds: seconds })}
                className={`min-h-11 min-w-16 rounded-lg px-4 font-bold transition-colors ${
                  draft.default_shot_timer_seconds === seconds
                    ? "bg-accent text-accent-ink"
                    : "text-body"
                }`}
              >
                {seconds} s
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-muted">
            Présélectionné sur la borne ; chaque visiteur peut encore choisir 3, 5 ou 10 secondes.
          </span>
        </fieldset>

        <Field label="Flash écran">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--color-accent)]"
              checked={draft.screen_flash_enabled}
              onChange={(e) => patch({ screen_flash_enabled: e.target.checked })}
            />
            <span>
              <span className="block">Éclairer avec l'écran pendant la capture</span>
              <span className="block text-xs text-muted">
                Désactivez cette option si la borne utilise un flash physique.
              </span>
            </span>
          </label>
        </Field>

        <div className="flex items-center gap-4">
          <Button onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Feedback error={error} notice={notice} />
        </div>
      </div>
    </Section>
  );
}
