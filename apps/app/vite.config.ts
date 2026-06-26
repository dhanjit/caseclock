import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Injects the content-hashed asset list + a per-build id into the static
 * service worker (public/sw.js → dist/sw.js) so the SW can PRECACHE the whole
 * app at install (cold-offline boot works) and name its asset cache per build
 * (so redeploys don't accumulate dead bundles competing with the OPFS vault for
 * the origin quota). The SW stays a hand-written file with no Workbox runtime;
 * this plugin just fills in the two values it can't know until the bundle exists.
 */
function caseclockSwPrecache(): Plugin {
  let config: ResolvedConfig;
  let assets: string[] = [];
  return {
    name: "caseclock-sw-precache",
    apply: "build",
    configResolved(c) {
      config = c;
    },
    generateBundle(_options, bundle) {
      // Every emitted chunk/asset except the HTML entry and sourcemaps. These are
      // same-origin, content-hashed paths (JS/CSS/WASM) safe to cache forever.
      assets = Object.keys(bundle)
        .filter((name) => name !== "index.html" && !name.endsWith(".map"))
        .map((name) => "/" + name.split(path.sep).join("/"));
    },
    async closeBundle() {
      const swPath = path.resolve(config.root, config.build.outDir, "sw.js");
      let src: string;
      try {
        src = await readFile(swPath, "utf8");
      } catch {
        this.warn("sw.js not found in build output; precache injection skipped");
        return;
      }
      const sorted = [...assets].sort();
      const build = createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 12);
      const out = src
        .replace('const BUILD = "dev";', `const BUILD = ${JSON.stringify(build)};`)
        .replace("const PRECACHE = [];", `const PRECACHE = ${JSON.stringify(sorted)};`);
      await writeFile(swPath, out);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), caseclockSwPrecache()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // pnpm + Vite dep-optimization can otherwise bundle a second React copy
    // (→ "Invalid hook call"). Force a single instance.
    dedupe: ["react", "react-dom"],
  },
  // Storage is in-memory SQLite; the encrypted vault is one AES-GCM ciphertext
  // blob written via the ASYNC OPFS file API (getFileHandle/createWritable) on
  // the main thread — there is NO SQLite OPFS VFS and NO SharedArrayBuffer, so
  // NO COOP/COEP cross-origin-isolation headers are required. If a future change
  // adopts a SAB-based OPFS VFS, add those headers to the Cloudflare host (which
  // would also break the no-COOP/COEP assumption) + re-test Safari.
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

