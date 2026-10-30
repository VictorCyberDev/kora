import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/s": "http://localhost:3000",
      "/incidents": "http://localhost:3000",
      "/services": "http://localhost:3000",
    },
  },
});
