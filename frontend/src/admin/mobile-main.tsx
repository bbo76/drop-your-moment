import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { MobileAdminApp } from "./MobileAdminApp";

const container = document.getElementById("root");
if (!container) throw new Error("élément #root introuvable");
document.body.className = "admin-theme !bg-background !font-sans !text-foreground antialiased selection:bg-primary selection:text-primary-foreground";

createRoot(container).render(
  <StrictMode>
    <MobileAdminApp />
  </StrictMode>,
);
