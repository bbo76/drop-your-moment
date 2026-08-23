import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { MobileAdminApp } from "./MobileAdminApp";

const container = document.getElementById("root");
if (!container) throw new Error("élément #root introuvable");

createRoot(container).render(
  <StrictMode>
    <MobileAdminApp />
  </StrictMode>,
);
