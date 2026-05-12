import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Vendored copy of backend/src/types.ts for Railway Docker (webapp-only context).
 * Run `bun run sync-contracts` after changing backend contracts.
 */
const backendTypesEntry = path.resolve(__dirname, "./src/contracts/backendTypes.ts");

const debugAgentIngestProxy = {
  "/__debug-agent-ingest": {
    target: "http://127.0.0.1:7311",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/__debug-agent-ingest/, ""),
  },
} as const;

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8000,
    allowedHosts: true, // Allow all hosts
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    // Dev: browser cannot always POST to http://127.0.0.1:7311 (mixed content / CORS). Proxy same-origin path.
    proxy: { ...debugAgentIngestProxy },
  },
  preview: {
    proxy: { ...debugAgentIngestProxy },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "../../../backend/src/types": backendTypesEntry,
      "../../../../backend/src/types": backendTypesEntry,
    },
  },
  build: {
    // Main app chunk is large; code-splitting the whole app is a separate pass
    chunkSizeWarningLimit: 3500,
  },
});
