import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3210";
const v3Port = process.env.E2E_V3_PORT ?? "3212";
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/serve.mjs",
      url: `http://127.0.0.1:${port}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Second stack with the v3 creative engine on, for the Brand Center journey.
      command: "node e2e/serve.mjs",
      url: `http://127.0.0.1:${v3Port}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...(process.env as Record<string, string>),
        E2E_PORT: v3Port,
        E2E_HOST_PORT: String(Number(v3Port) + 1),
        KORA_CREATIVE_ENGINE: "v3",
        KORA_MEDIA_PUBLIC_URL: "https://media.test.example",
      },
    },
  ],
});
