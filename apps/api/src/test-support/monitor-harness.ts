import type { FastifyBaseLogger } from "fastify";
import type { KoraConfig } from "../config.js";
import { HealthMonitor } from "../monitor.js";
import type { KoraStore } from "../store.js";

export const quietLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

export function testConfig(overrides: Partial<KoraConfig> = {}): KoraConfig {
  return {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: "postgresql://u:p@localhost/kora_test",
    API_HOST: "127.0.0.1",
    API_PORT: 3000,
    MONITOR_ENABLED: false,
    MONITOR_SERVICE_NAME: "demo",
    MONITOR_HEALTH_URL: "http://demo.test/health",
    MONITOR_INTERVAL_MS: 1000,
    MONITOR_TIMEOUT_MS: 500,
    MONITOR_FAILURE_THRESHOLD: 3,
    MONITOR_RECOVERY_THRESHOLD: 3,
    KORA_ENVIRONMENT: "test",
    ...overrides,
  };
}

const noopStore = {
  recordObservation: () => Promise.resolve(undefined),
  recordEvent: () => Promise.resolve(undefined),
  createIncident: () => Promise.resolve(undefined),
  appendEvidence: () => Promise.resolve(undefined),
  resolveIncident: () => Promise.resolve(undefined),
} as unknown as KoraStore;

/** Runs one real health check against `url` with a no-op store. */
export async function observeOnce(url: string, timeoutMs = 2000) {
  const monitor = new HealthMonitor(
    testConfig({
      MONITOR_HEALTH_URL: url,
      MONITOR_TIMEOUT_MS: timeoutMs,
      MONITOR_FAILURE_THRESHOLD: 1000,
    }),
    noopStore,
    quietLogger,
    crypto.randomUUID(),
  );
  return monitor.checkOnce();
}
