/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// P2-37: the backend port must be sourced from the same env var the server
// reads (PORT, default 3000) — a hardcoded 3000 silently broke the dev proxy
// whenever PORT was overridden, as documented in .env.example.
const backendPort = Number(process.env.PORT || 3000);
const backendHttp = `http://127.0.0.1:${backendPort}`;
const backendWs = `ws://127.0.0.1:${backendPort}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ["**/graphify-out/**", "**/web/data/**", "**/downloads/**"],
    },
    proxy: {
      "/api": backendHttp,
      "/downloads": backendHttp,
      "/ws": { target: backendWs, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
