import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Vendored copy of backend/src/types.ts for Railway Docker (webapp-only context).
 * Run `bun run sync-contracts` after changing backend contracts.
 */
const backendTypesEntry = path.resolve(__dirname, "./src/contracts/backendTypes.ts");

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
