import { EventSection } from "./EventSection";
import { GallerySection } from "./GallerySection";
import { HealthSection } from "./HealthSection";
import { SecuritySection } from "./SecuritySection";

/* Portail d'administration.
 *
 * Contrairement au kiosque, cet écran s'adresse à un opérateur sur un PC : il peut
 * défiler, afficher des informations techniques et n'a aucune contrainte tactile.
 *
 * Une `<section>` par sujet, dans l'ordre où l'opérateur en a besoin : surveiller pendant
 * l'événement, régler avant, récupérer après. Pas d'onglets ni de routeur — trois sections
 * sur une page qui défile ne justifient pas un mécanisme de navigation. À reconsidérer le
 * jour où la page devient illisible. */

export function AdminApp() {
  return (
    <div className="min-h-full p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Drop Your Moment</h1>
        <p className="text-muted">Administration</p>
      </header>

      <div className="max-w-5xl">
        <HealthSection />
        <EventSection />
        <SecuritySection />
        <GallerySection />
      </div>
    </div>
  );
}
