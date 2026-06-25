import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./index.css";
import { useSession } from "@/state/session";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";

// Dev-only handles to the real store instances (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as { __cc?: unknown }).__cc = { useSession, useCases, useNav };
}

// NOTE: we intentionally do NOT register a service worker. An earlier hand-rolled
// SW cached the app shell and could trap users on a stale build across redeploys.
// /sw.js is now a self-retiring worker that cleans up any existing install. A
// robust build-time SW (vite-plugin-pwa, auto-update, per-build cache) can return
// later once the app is stable. Always-fresh > offline during active iteration.

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
