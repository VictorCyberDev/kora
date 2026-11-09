import { defineConfig } from "@playwright/test";

// Runs the repository's browser specs against services that are ALREADY running (started by scripts/commission/local.mjs):
// no webServer here. E2E_PORT = an API on the default engine (v2), E2E_V3_PORT = an API with KORA_CREATIVE_ENGINE=v3.
const port = process.env.E2E_PORT ?? "3320";
export default defineConfig({
  testDir: "../../e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off",
    screenshot: "only-on-failure",
  },
});
