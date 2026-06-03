import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/terminal": { target: "http://127.0.0.1:5180", ws: true } } },
  build: { outDir: "dist" },
});
