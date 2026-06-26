import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./index.css";
import { useSession } from "@/state/session";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { registerServiceWorker } from "@/lib/platform";

// Dev-only handles to the real store instances (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as { __cc?: unknown }).__cc = { useSession, useCases, useNav };
}

// Offline shell + fast updates for the installed iPad PWA. The SW is network-first
// for navigation, so a redeploy is live on the next open (no stale-build trap);
// content-hashed assets are cached for instant offline loads. Production only —
// dev stays SW-free (always-fresh while iterating). See src/lib/platform.ts.
registerServiceWorker();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
