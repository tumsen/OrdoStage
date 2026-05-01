import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8000,
    allowedHosts: true, // Allow all hosts
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Main app chunk is large; code-splitting the whole app is a separate pass
    chunkSizeWarningLimit: 3500,
  },
});
