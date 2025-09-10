import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,          // dev server port (optional)
    open: true           // auto-open browser on dev
  },
  build: {
    outDir: "dist",      // default build folder
    sourcemap: false,    // disable source maps for production
    chunkSizeWarningLimit: 600
  },
  resolve: {
    alias: {
      "@": "/src"        // allows imports like "@/components/..."
    }
  }
});
