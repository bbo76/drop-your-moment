import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { AdminApp } from "./AdminApp";

const container = document.getElementById("root");
if (!container) throw new Error("élément #root introuvable");

createRoot(container).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
