import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/** Shared Zod/API contracts (sibling `backend/` package). Alias so Vite resolves `zod` from webapp/node_modules when bundling. */
const backendTypesEntry = path.resolve(__dirname, "../backend/src/types.ts");

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8000,
    allowedHosts: true, // Allow all hosts
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
  plugins: [react()],
  resolve: {
    dedupe: ["zod"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "../../../backend/src/types": backendTypesEntry,
      "../../../../backend/src/types": backendTypesEntry,
      // Backend types.ts imports "zod"; force resolution through webapp deps (Docker layout).
      zod: path.resolve(__dirname, "node_modules/zod"),
    },
  },
  build: {
    // Main app chunk is large; code-splitting the whole app is a separate pass
    chunkSizeWarningLimit: 3500,
  },
});
