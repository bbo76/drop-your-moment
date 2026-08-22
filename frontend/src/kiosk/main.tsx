import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { App } from "./App";

/* Le menu contextuel n'est bloqué que sur un écran tactile : un appui long sur une borne
 * ne doit pas ouvrir un menu système par-dessus l'interface. Sur une machine de
 * développement à la souris, le bloquer priverait du clic droit — et donc de
 * l'inspecteur — pour aucun bénéfice.
 *
 * Le pendant CSS de ce durcissement (curseur masqué, sélection interdite) vit dans
 * index.css derrière la même requête de capacité. */
if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
  document.addEventListener("contextmenu", (event) => event.preventDefault());
}

const container = document.getElementById("root");
if (!container) throw new Error("élément #root introuvable");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
