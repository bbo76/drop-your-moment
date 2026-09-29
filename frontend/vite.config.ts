import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  plugins: [react(), tailwindcss()],

  build: {
    // Deux points d'entrée dans un seul projet : kiosque et portail responsive.
    // Ils partagent les jetons, le client d'API et les composants.
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
      // Le slash final évite d'intercepter l'entrée Vite `/admin.html`.
      "/admin/": "http://127.0.0.1:8001",
    },
  },
});
