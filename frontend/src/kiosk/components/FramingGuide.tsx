/** Assombrit ce que le recadrage va retirer et matérialise la zone conservée.
 *
 * Sans ce repère, les visiteurs se cadrent sur toute la largeur de l'aperçu et se
 * retrouvent coupés une fois la photo recadrée au ratio du format de sortie.
 */
export function FramingGuide({
  cropsWidth,
  maskPercent,
}: {
  cropsWidth: boolean;
  maskPercent: number;
}) {
  if (maskPercent <= 0) return null;

  const mask = <div className="bg-black/55" style={{ flex: `0 0 ${maskPercent}%` }} />;
  const border = cropsWidth
    ? "border-x-2 border-dashed border-white/65"
    : "border-y-2 border-dashed border-white/65";

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex ${cropsWidth ? "flex-row" : "flex-col"}`}
    >
      {mask}
      <div className={`flex-auto ${border}`} />
      {mask}
    </div>
  );
}
