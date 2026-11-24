import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Puck's distributed CSS imports Inter from a third-party origin. Krevstudio
 * deliberately disallows remote CSS through its strict production CSP.
 * Bundle the editor styling without that optional font import so lazy-route
 * stylesheet preloads do not fail and the editor remains usable offline.
 */
const puckOfflineCss = {
  name: "puck-offline-css",
  enforce: "pre" as const,
  transform(source: string, id: string) {
    if (!id.includes("@puckeditor/core") || !id.endsWith(".css")) return;
    return source.replace(
      /@import\s*["']https:\/\/rsms\.me\/inter\/inter\.css["'];?/g,
      "",
    );
  },
};

export default defineConfig({
  plugins: [puckOfflineCss, react()],
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
