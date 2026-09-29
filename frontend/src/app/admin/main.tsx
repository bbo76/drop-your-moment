import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../index.css";
import "../../event-fonts.css";
import { AdminApp } from "./AdminApp";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DayOfView } from "@/features/admin/DayOfView";
import { useIsMobile } from "@/hooks/use-mobile";

const container = document.getElementById("root");
if (!container) throw new Error("élément #root introuvable");
document.body.className = "admin-theme !bg-background !font-sans !text-foreground antialiased selection:bg-primary selection:text-primary-foreground";

function ResponsiveAdminApp() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <main><DayOfView /></main>
      </div>
    );
  }

  return <AdminApp />;
}

createRoot(container).render(
  <StrictMode>
    <TooltipProvider><ResponsiveAdminApp /></TooltipProvider>
  </StrictMode>,
);
