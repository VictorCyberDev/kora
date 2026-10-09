import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { DomainEvent } from "@kora/event-schema";
import { HealthMonitor } from "./monitor.js";
import type { KoraConfig } from "./config.js";
import type { KoraStore } from "./store.js";

const serviceId = crypto.randomUUID();
const config: KoraConfig = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://u:p@localhost/kora",
  API_HOST: "127.0.0.1",
  API_PORT: 3000,
  MONITOR_ENABLED: false,
  MONITOR_SERVICE_NAME: "demo",
  MONITOR_HEALTH_URL: "http://demo.test/health",
  MONITOR_INTERVAL_MS: 1000,
  MONITOR_TIMEOUT_MS: 500,
  MONITOR_FAILURE_THRESHOLD: 3,
  MONITOR_RECOVERY_THRESHOLD: 3,
};
const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;
afterEach(() => vi.unstubAllGlobals());

describe("monitor event loop", () => {
  it("records RecoveryVerified only after the configured recovery threshold", async () => {
    const events: DomainEvent[] = [];
    const store = {
      recordObservation: async () => undefined,
      recordEvent: async (e: DomainEvent) => {
        events.push(e);
      },
      createIncident: async () => undefined,
      appendEvidence: async () => undefined,
      resolveIncident: async () => undefined,
    } as unknown as KoraStore;
    const responses = [503, 503, 503, 200, 200, 200];
    let index = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("", { status: responses[index++] ?? 200 }),
      ),
    );
    const monitor = new HealthMonitor(config, store, logger, serviceId);
    for (let n = 0; n < 5; n++) await monitor.checkOnce();
    expect(events.some((e) => e.eventType === "RecoveryVerified")).toBe(false);
    await monitor.checkOnce();
    expect(
      events.filter((e) => e.eventType === "IncidentCreated"),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.eventType === "RecoveryVerified"),
    ).toHaveLength(1);
  });
});
