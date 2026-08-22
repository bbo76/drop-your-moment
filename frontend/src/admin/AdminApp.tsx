import { EventSection } from "./EventSection";
import { HealthSection } from "./HealthSection";

/* Portail d'administration.
 *
 * Contrairement au kiosque, cet écran s'adresse à un opérateur sur un PC : il peut
 * défiler, afficher des informations techniques et n'a aucune contrainte tactile. Une
 * `<section>` par sujet, dans l'ordre où l'opérateur en a besoin — surveiller pendant
 * l'événement, régler avant. */

export function AdminApp() {
  return (
    <div className="min-h-full overflow-auto p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Drop Your Moment</h1>
        <p className="text-muted">Administration</p>
      </header>

      <div className="max-w-5xl">
        <HealthSection />
        <EventSection />
      </div>

      <p className="mt-8 text-sm text-muted">Galerie : à venir.</p>
    </div>
  );
}
