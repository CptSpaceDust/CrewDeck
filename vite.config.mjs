import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../../dist-renderer",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react/jsx-runtime"],
          supabase: ["@supabase/supabase-js"],
          voice: ["livekit-client"],
          icons: ["lucide-react"],
          qrcode: ["qrcode"]
        }
      }
    }
  }
});
