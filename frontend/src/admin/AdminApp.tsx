import { useEffect, useState, type ReactNode } from "react";

import { DashboardOverview } from "./DashboardOverview";
import { EventSection } from "./EventSection";
import { GallerySection } from "./GallerySection";
import { HealthSection } from "./HealthSection";
import { SecuritySection } from "./SecuritySection";

/* Backoffice complet, destiné à la préparation sur laptop. Le pilotage mobile du jour J
 * possède son propre point d'entrée et réutilise directement les mêmes API. */

export function AdminApp() {
  const [view, setView] = useState<AdminView>(() => viewFromHash());

  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: AdminView) => {
    window.location.hash = next;
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="admin-app-shell">
      <nav className="admin-nav" aria-label="Navigation de l’administration">
        <button type="button" className="admin-brand" onClick={() => navigate("overview")}>
          <strong>Drop Your Moment</strong>
          <span>Administration</span>
        </button>
        <div className="admin-nav-items">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <AdminIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="admin-main">
        {view === "overview" && <DashboardOverview />}
        {view === "event" && <EventSection />}
        {view === "gallery" && <GallerySection />}
        {view === "diagnostic" && <HealthSection />}
        {view === "security" && <SecuritySection />}
      </main>
    </div>
  );
}

export type AdminView = "overview" | "event" | "gallery" | "diagnostic" | "security";
type IconName = "overview" | "event" | "gallery" | "diagnostic" | "security";

const NAV_ITEMS: Array<{ id: AdminView; label: string; icon: IconName }> = [
  { id: "overview", label: "Vue d’ensemble", icon: "overview" },
  { id: "event", label: "Événement", icon: "event" },
  { id: "gallery", label: "Galerie", icon: "gallery" },
  { id: "diagnostic", label: "Diagnostic", icon: "diagnostic" },
  { id: "security", label: "Sécurité", icon: "security" },
];

const viewFromHash = (): AdminView => {
  const candidate = window.location.hash.slice(1) as AdminView;
  return NAV_ITEMS.some(({ id }) => id === candidate) ? candidate : "overview";
};

function AdminIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    event: <><path d="M7 3v3M17 3v3M4 9h16" /><rect x="4" y="5" width="16" height="16" rx="2" /></>,
    gallery: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 17 5-4 4 3 3-2 4 3" /></>,
    diagnostic: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    security: <path d="M12 3 5 6v5c0 4.7 2.7 8 7 10 4.3-2 7-5.3 7-10V6l-7-3Zm0 5v5m0 3h.01" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
