import { useEffect, useState } from "react";

import {
  api,
  FILTER_LABELS,
  overlayUrl,
  type EventConfigPayload,
  type FilterName,
  type PrintFormatPayload,
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
  const runOverlayAction = async (action: () => Promise<EventConfigPayload>) => {
    setError(null);
    setNotice(null);
    try {
      const { overlay_file } = await action();
      setDraft({ ...draft, overlay_file });
      setOverlayRevision((revision) => revision + 1);
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
      <div className="grid max-w-xl gap-4">
        <Field label="Nom de l'événement">
          <input
            className={inputClass}
            value={draft.event_name}
            onChange={(e) => patch({ event_name: e.target.value })}
          />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Nom">
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
            <div className="flex items-start gap-4">
              <img
                src={overlayUrl(overlayRevision)}
                alt="Overlay de l'événement"
                /* Le damier rend la transparence visible : sur fond uni, un overlay opaque
                   et un overlay ajouré se ressemblent. */
                className="h-24 rounded border border-edge bg-[repeating-conic-gradient(#333846_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
              />
              <Button onClick={() => void runOverlayAction(api.deleteOverlay)}>Retirer</Button>
            </div>
          ) : (
            <p className="text-sm text-muted">Aucun overlay — les photos sortiront sans cadre.</p>
          )}
          <input
            type="file"
            accept="image/png"
            className="mt-3 block text-sm text-muted"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Réinitialiser permet de retenter le même fichier après un refus.
              e.target.value = "";
              if (file) void runOverlayAction(() => api.uploadOverlay(file));
            }}
          />
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
