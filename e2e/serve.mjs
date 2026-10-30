// Starts the built Kora API against a throwaway, freshly migrated database.
import { spawn } from "node:child_process";
import { createIsolatedDatabase } from "../apps/api/dist/test-support/isolated-database.js";

const base = process.env.DATABASE_URL;
if (!base)
  throw new Error("DATABASE_URL (a *_test database) is required for e2e");
const port = process.env.E2E_PORT ?? "3210";
const db = await createIsolatedDatabase(base);
const child = spawn("node", ["apps/api/dist/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: db.url,
    NODE_ENV: "development",
    API_PORT: port,
    API_HOST: "127.0.0.1",
    LOG_LEVEL: "warn",
    KORA_PUBLIC_URL: `http://127.0.0.1:${port}`,
    KORA_CHAOS_ENABLED: "true",
    KORA_LEGACY_PUBLIC_API: "false",
    MONITOR_ENABLED: "true",
    MONITOR_INTERVAL_MS: "800",
    MONITOR_TIMEOUT_MS: "1500",
    MONITOR_FAILURE_THRESHOLD: "2",
    MONITOR_RECOVERY_THRESHOLD: "2",
    MONITOR_HEALTH_URL: `http://127.0.0.1:${port}/health`,
    ACTION_VERIFICATION_TICK_MS: "500",
    ACTION_VERIFICATION_TIMEOUT_MS: "60000",
  },
});
let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  await db.drop().catch(() => undefined);
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", stop);
