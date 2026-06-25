import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // pnpm + Vite dep-optimization can otherwise bundle a second React copy
    // (→ "Invalid hook call"). Force a single instance.
    dedupe: ["react", "react-dom"],
  },
  // The encrypted SQLite layer runs in a Web Worker over OPFS (OPFSCoopSyncVFS).
  // OPFSCoopSyncVFS deliberately avoids SharedArrayBuffer, so NO COOP/COEP
  // cross-origin-isolation headers are required. Do not switch to a SAB-based
  // OPFS VFS without adding those headers to the Cloudflare host + re-testing Safari.
  worker: {
    format: "es",
  },
  // @sqlite.org/sqlite-wasm ships its own .wasm; excluding it from dep
  // pre-bundling lets Vite serve that asset from node_modules with the correct
  // application/wasm MIME (otherwise the wasm URL 404s to index.html in dev).
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  server: {
    port: 5173,
  },
});

