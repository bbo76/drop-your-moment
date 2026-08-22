import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    // Deux points d'entrée dans un seul projet : le kiosque et l'administration
    // partagent les jetons de design, le client d'API et les composants, sans
    // dupliquer l'outillage ni l'arbre de dépendances.
    rollupOptions: {
      input: {
        kiosk: "index.html",
        admin: "admin.html",
      },
    },
  },

  server: {
    // En développement, Vite sert le frontend et relaie les appels vers le backend
    // Python, qui écoute sur ses deux ports habituels.
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/admin": "http://127.0.0.1:8001",
    },
  },
});
