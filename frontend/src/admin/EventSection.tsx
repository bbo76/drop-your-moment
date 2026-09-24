import { useEffect, useState, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import {
  api,
  FILTER_LABELS,
  overlayUrl,
  type EventConfigPayload,
  type FilterName,
  type PrinterConfiguration,
  type PrintFormatPayload,
} from "../shared/api";
import { Button, Feedback, Field, Section } from "./ui";

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
const PRINT_PRESETS = [
  { id: "postcard", label: "Carte postale", width: 148, height: 100, detail: "Format standard" },
  { id: "l", label: "Format L", width: 119, height: 89, detail: "Format compact" },
  { id: "card", label: "Format carte", width: 86, height: 54, detail: "Cassette PCC-CP400" },
] as const;

type PrintPreset = (typeof PRINT_PRESETS)[number];
type Orientation = "landscape" | "portrait";

export function EventSection() {
  const [draft, setDraft] = useState<EventConfigPayload | null>(null);
  const [printerConfig, setPrinterConfig] = useState<PrinterConfiguration | null>(null);
  const [paperStock, setPaperStock] = useState("");
  const [stockSaving, setStockSaving] = useState(false);
  const [stockFeedback, setStockFeedback] = useState<{ error?: string; notice?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Anti-cache de l'aperçu : l'URL de l'overlay est fixe, donc rien ne rechargerait
  // l'image après un remplacement.
  const [overlayRevision, setOverlayRevision] = useState(0);
  const [overlayPreviewOpen, setOverlayPreviewOpen] = useState(false);

  useEffect(() => {
    api.eventConfig().then(setDraft, (cause) => setError(String(cause)));
    api.printerConfig().then(setPrinterConfig, () => setPrinterConfig(null));
    api.health().then(
      ({ counters }) => setPaperStock(String(counters.paper_stock_capacity - counters.prints_since_stock_set)),
      (cause) => setStockFeedback({ error: String(cause) }),
    );
  }, []);

  if (!draft) {
    return (
      <Section title="Événement">
        {error ? <Feedback error={error} /> : <div className="grid gap-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-24" /></div>}
      </Section>
    );
  }

  const patch = (changes: Partial<EventConfigPayload>) => {
    setDraft({ ...draft, ...changes });
    setNotice(null);
  };

  const patchFormat = (changes: Partial<PrintFormatPayload>) =>
    patch({ print_format: { ...draft.print_format, ...changes } });

  const preset = matchingPreset(draft.print_format);
  const orientation: Orientation = draft.print_format.width_mm >= draft.print_format.height_mm
    ? "landscape"
    : "portrait";
  const customFormatAllowed = printerConfig?.driver === "null"
    || /pdf/i.test(printerConfig?.printer_name ?? "");

  const choosePreset = (choice: PrintPreset, nextOrientation = orientation) => {
    const landscape = nextOrientation === "landscape";
    patch({
      print_format: {
        name: `${choice.label} ${landscape ? "paysage" : "portrait"}`,
        width_mm: landscape ? choice.width : choice.height,
        height_mm: landscape ? choice.height : choice.width,
        dpi: 300,
      },
    });
  };

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
      setOverlayPreviewOpen(false);
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
      setNotice("Événement mis à jour.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const savePaperStock = async () => {
    const total = Number(paperStock);
    if (!Number.isInteger(total) || total < 1 || total > 9_999) return;
    setStockSaving(true);
    setStockFeedback({});
    try {
      const counters = await api.setPaperStock(total);
      setPaperStock(String(counters.paper_stock_capacity));
      setStockFeedback({ notice: "Réserve mise à jour." });
    } catch (cause) {
      setStockFeedback({ error: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setStockSaving(false);
    }
  };

  return (
    <Section title="Événement">
      <div className="max-w-5xl">
        <SettingsGroup title="Identité">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nom de l’événement">
              <Input
                value={draft.event_name}
                onChange={(e) => patch({ event_name: e.target.value })}
              />
            </Field>
            <Field label="Message d’accueil">
              <Input
                value={draft.launch_message}
                maxLength={80}
                onChange={(e) => patch({ launch_message: e.target.value })}
              />
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Accueil et pause">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.72fr)]">
            <div className="grid content-start gap-5">
              <div className="flex min-h-16 items-center justify-between gap-5 rounded-xl border bg-card px-4 py-3">
                <div>
                  <p className="font-semibold">Prise de photo</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Une session en cours se termine avant la pause.
                  </p>
                </div>
                <Switch
                  aria-label="Autoriser les prises de photo"
                  checked={!draft.capture_paused}
                  onCheckedChange={(checked) => patch({ capture_paused: !checked })}
                />
              </div>
              <Field label="Message secondaire affiché pendant la pause">
                <Input
                  value={draft.pause_message}
                  maxLength={120}
                  onChange={(event) => patch({ pause_message: event.target.value })}
                />
              </Field>
            </div>
            <div className="grid min-h-44 place-content-center justify-items-center rounded-xl bg-[#101418] px-6 py-7 text-center text-[#f6f4ed]">
              <PausePreview />
              <p className="mt-4 max-w-[18ch] text-balance text-3xl font-bold leading-none tracking-[-0.025em]">
                Je fais une petite pause
              </p>
              <p className="mt-2 max-w-[24ch] text-balance text-lg font-medium text-[#aab2b9]">
                {draft.pause_message || "Votre message secondaire"}
              </p>
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Rendu photo">
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Filtres disponibles</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {ALL_FILTERS.map((name) => (
                <label key={name} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={draft.available_filters.includes(name)}
                    onCheckedChange={() => toggleFilter(name)}
                  />
                  {FILTER_LABELS[name]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-8">
            <h3 className="text-sm font-medium">Overlay</h3>
            {draft.overlay_file ? (
              <div className="mt-3 flex flex-wrap items-start gap-4">
                <button
                  type="button"
                  onClick={() => setOverlayPreviewOpen(true)}
                  className="group rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label="Agrandir l’overlay"
                >
                  <img
                    src={overlayUrl(overlayRevision)}
                    alt="Overlay de l'événement"
                    /* Le damier rend la transparence visible : sur fond uni, un overlay opaque
                       et un overlay ajouré se ressemblent. */
                    className="h-32 rounded-lg border border-border bg-[repeating-conic-gradient(#333846_0_25%,transparent_0_50%)] bg-[length:16px_16px] transition-opacity group-hover:opacity-80"
                  />
                  <span className="mt-1.5 block text-xs text-muted-foreground">Agrandir</span>
                </button>
                <div className="flex flex-wrap gap-2">
                  <OverlayPicker
                    label="Remplacer"
                    onFile={(file) => void runOverlayAction(
                      () => api.uploadOverlay(file),
                      "Overlay mis à jour.",
                    )}
                  />
                  <Button
                    tone="secondary"
                    onClick={() => void runOverlayAction(api.deleteOverlay, "Overlay retiré.")}
                  >
                    Retirer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <OverlayPicker
                  label="Choisir un fichier PNG"
                  onFile={(file) => void runOverlayAction(
                    () => api.uploadOverlay(file),
                    "Overlay ajouté.",
                  )}
                />
                <span className="text-sm text-muted-foreground">Aucun overlay</span>
              </div>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              PNG transparent recommandé : {Math.round((draft.print_format.width_mm / 25.4) * draft.print_format.dpi)} × {Math.round((draft.print_format.height_mm / 25.4) * draft.print_format.dpi)} px
            </p>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Impression" last>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Format d’impression</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRINT_PRESETS.map((choice) => {
                const selected = preset?.id === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choosePreset(choice)}
                    className={`min-h-20 rounded-lg border px-4 py-3 text-left outline-none transition-[border-color,background-color] focus-visible:ring-3 focus-visible:ring-ring/50 ${selected ? "border-foreground bg-muted" : "border-border hover:border-foreground/40"}`}
                  >
                    <strong className="block text-sm font-semibold">{choice.label}</strong>
                    <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                      {choice.width} × {choice.height} mm
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{choice.detail}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium">Orientation</legend>
            <div className="inline-grid grid-cols-2 rounded-lg border border-border p-1">
              {(["landscape", "portrait"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={orientation === value}
                  disabled={!preset}
                  onClick={() => preset && choosePreset(preset, value)}
                  className={`min-h-9 rounded-md px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${orientation === value && preset ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {value === "landscape" ? "Paysage" : "Portrait"}
                </button>
              ))}
            </div>
          </fieldset>

          {customFormatAllowed && (
            <details className="mt-5 rounded-lg border border-border">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span>Format personnalisé</span>
                {!preset && (
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {draft.print_format.width_mm} × {draft.print_format.height_mm} mm
                  </span>
                )}
              </summary>
              <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
                <Field label="Nom" className="sm:col-span-2">
                  <Input
                    value={draft.print_format.name}
                    onChange={(e) => patchFormat({ name: e.target.value })}
                  />
                </Field>
                <Field label="Largeur (mm)">
                  <Input
                    type="number"
                    min={1}
                    value={draft.print_format.width_mm}
                    onChange={(e) => patchFormat({ width_mm: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Hauteur (mm)">
                  <Input
                    type="number"
                    min={1}
                    value={draft.print_format.height_mm}
                    onChange={(e) => patchFormat({ height_mm: Number(e.target.value) })}
                  />
                </Field>
                <Field label="DPI">
                  <Input
                    type="number"
                    min={1}
                    value={draft.print_format.dpi}
                    onChange={(e) => patchFormat({ dpi: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </details>
          )}

          {!preset && !customFormatAllowed && (
            <p className="mt-4 text-sm text-destructive">
              Le format actuel n’est pas pris en charge par la CP1500. Choisissez un format proposé.
            </p>
          )}

          <div className="mt-7 border-t border-border pt-5">
            <Field label="Réserve papier disponible">
              <div className="flex max-w-md flex-col gap-2 sm:flex-row">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={9_999}
                  step={1}
                  value={paperStock}
                  disabled={stockSaving}
                  onChange={(event) => { setPaperStock(event.target.value); setStockFeedback({}); }}
                  aria-describedby="paper-stock-help"
                />
                <Button
                  tone="secondary"
                  disabled={stockSaving || !Number.isInteger(Number(paperStock)) || Number(paperStock) < 1 || Number(paperStock) > 9_999}
                  onClick={() => void savePaperStock()}
                >
                  {stockSaving ? "Mise à jour…" : "Mettre à jour"}
                </Button>
              </div>
            </Field>
            <p id="paper-stock-help" className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Nombre de feuilles encore disponibles pour l’événement, y compris celles déjà chargées dans le bac.
            </p>
            <Feedback error={stockFeedback.error} notice={stockFeedback.notice} />
          </div>
        </SettingsGroup>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
          <Button onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </Button>
          <Feedback error={error} notice={notice} />
        </div>
      </div>

      <Dialog open={overlayPreviewOpen} onOpenChange={setOverlayPreviewOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col bg-background sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Overlay de l’événement</DialogTitle>
            <DialogDescription>Aperçu du fichier PNG actuel.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 place-items-center overflow-auto rounded-lg border border-border bg-[repeating-conic-gradient(#333846_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-4">
            <img
              src={overlayUrl(overlayRevision)}
              alt="Overlay de l’événement agrandi"
              className="max-h-[75dvh] max-w-full object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function PausePreview() {
  return (
    <span className="grid size-12 place-items-center rounded-full border-2 border-[#46515c] text-[#ffd400]" aria-hidden="true">
      <span className="flex gap-1"><i className="h-5 w-1.5 rounded-sm bg-current" /><i className="h-5 w-1.5 rounded-sm bg-current" /></span>
    </span>
  );
}

function matchingPreset(format: PrintFormatPayload): PrintPreset | undefined {
  const shortSide = Math.min(format.width_mm, format.height_mm);
  const longSide = Math.max(format.width_mm, format.height_mm);
  return PRINT_PRESETS.find((preset) => preset.width === longSide && preset.height === shortSide);
}

function SettingsGroup({
  title,
  children,
  last = false,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`grid gap-4 py-7 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-10 ${last ? "" : "border-b border-border"}`}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function OverlayPicker({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-primary px-4 font-bold text-primary-foreground transition-transform active:scale-[0.98]">
      {label}
      <Input
        type="file"
        accept="image/png"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
