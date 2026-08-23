import { EventSection } from "./EventSection";
import { GallerySection } from "./GallerySection";
import { HealthSection } from "./HealthSection";
import { SecuritySection } from "./SecuritySection";

/* Backoffice complet, destiné à la préparation sur laptop. Le pilotage mobile du jour J
 * possède son propre point d'entrée et réutilise directement les mêmes API. */

export function AdminApp() {
  return (
    <div className="admin-shell mx-auto min-h-full max-w-6xl px-4 py-5 sm:p-8">
      <header className="mb-8 border-b border-edge pb-5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Drop Your Moment</h1>
        <p className="text-muted">Administration et préparation de l’événement</p>
      </header>

      <main>
        <HealthSection />
        <EventSection />
        <SecuritySection />
        <GallerySection />
      </main>
    </div>
  );
}
