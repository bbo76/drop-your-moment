import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  plugins: [react(), tailwindcss()],

  build: {
    // Trois points d'entrée dans un seul projet : kiosque, administration complète et
    // pilotage mobile. Ils partagent le client d'API et les composants.
    // partagent les jetons de design, le client d'API et les composants, sans
    // dupliquer l'outillage ni l'arbre de dépendances.
    rollupOptions: {
      input: {
        kiosk: "index.html",
        admin: "admin.html",
        mobile: "mobile.html",
      },
    },
  },

  server: {
    // En développement, Vite sert le frontend et relaie les appels vers le backend
    // Python, qui écoute sur ses deux ports habituels.
    proxy: {
      "/api": "http://127.0.0.1:8000",
      // Le slash final évite d'intercepter l'entrée Vite `/admin.html`.
      "/admin/": "http://127.0.0.1:8001",
    },
  },
});
