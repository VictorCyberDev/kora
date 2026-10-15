import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import type { DomainEvent } from "@kora/event-schema";
import { KoraStore } from "./store.js";
import { HealthMonitor } from "./monitor.js";
import { quietLogger, testConfig } from "./test-support/monitor-harness.js";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  if (sql) await sql.end();
});

const config = testConfig({
  MONITOR_FAILURE_THRESHOLD: 2,
  MONITOR_RECOVERY_THRESHOLD: 2,
});

type Method =
  | "recordObservation"
  | "recordEvent"
  | "createIncident"
  | "appendEvidence"
  | "resolveIncident";
/** Makes the first matching store call reject, whichever store instance runs it. */
function failOnce(
  method: Method,
  when: (args: unknown[]) => boolean = () => true,
) {
  const proto = KoraStore.prototype as unknown as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  const original = proto[method]!;
  let fired = false;
  vi.spyOn(proto, method).mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    if (!fired && when(args)) {
      fired = true;
      return Promise.reject(new Error(`injected fault in ${method}`));
    }
    return original.apply(this, args);
  });
  return () => fired;
}
const eventIs =
  (...types: string[]) =>
  (args: unknown[]) =>
    types.includes((args[0] as DomainEvent).eventType);

async function snapshot(serviceId: string) {
  const count = async (q: Promise<postgres.RowList<postgres.Row[]>>) =>
    Object.fromEntries((await q).map((r) => [String(r.k), Number(r.n)]));
  return {
    observations: Number(
      (
        await sql!`SELECT count(*)::int n FROM telemetry_observations WHERE service_id=${serviceId}`
      )[0]!.n,
    ),
    events: await count(
      sql!`SELECT event_type k,count(*)::int n FROM domain_events WHERE service_id=${serviceId} GROUP BY 1`,
    ),
    incidents: (
      await sql!`SELECT state,resolved_at IS NOT NULL resolved FROM incidents WHERE service_id=${serviceId} ORDER BY created_at`
    ).map((r) => `${String(r.state)}/${String(r.resolved)}`),
    evidence: await count(
      sql!`SELECT e.evidence_kind k,count(*)::int n FROM incident_evidence e JOIN incidents i ON i.id=e.incident_id WHERE i.service_id=${serviceId} GROUP BY 1`,
    ),
  };
}
async function assertIntegrity(serviceId: string) {
  const noEvent = await sql!`
    SELECT i.id FROM incidents i WHERE i.service_id=${serviceId} AND NOT EXISTS
      (SELECT 1 FROM domain_events d WHERE d.correlation_id=i.id AND d.event_type='IncidentCreated')`;
  expect(noEvent, "incident without IncidentCreated").toHaveLength(0);
  const noRecovery = await sql!`
    SELECT i.id FROM incidents i WHERE i.service_id=${serviceId} AND i.state='RESOLVED' AND NOT EXISTS
      (SELECT 1 FROM domain_events d WHERE d.correlation_id=i.id AND d.event_type='RecoveryVerified')`;
  expect(noRecovery, "RESOLVED without RecoveryVerified").toHaveLength(0);
  const orphans = await sql!`
    SELECT o.id FROM telemetry_observations o WHERE o.service_id=${serviceId} AND NOT EXISTS
      (SELECT 1 FROM domain_events d WHERE d.payload->>'observationId'=o.id::text AND d.event_type LIKE 'HealthCheck%')`;
  expect(orphans, "observation without its HealthCheck event").toHaveLength(0);
}
const memoryOf = (m: HealthMonitor) =>
  (m as unknown as { state: unknown }).state;

interface Scenario {
  name: string;
  prelude: number[];
  failing: number;
  method: Method;
  when?: (args: unknown[]) => boolean;
  resume: number[];
  expectAfterResume: {
    incidents: string[];
    events: Record<string, number>;
    evidence: Record<string, number>;
  };
}
const scenarios: Scenario[] = [
  {
    name: "observation insert fails",
    prelude: [],
    failing: 503,
    method: "recordObservation",
    resume: [503, 503],
    expectAfterResume: {
      incidents: ["DETECTED/false"],
      events: { HealthCheckFailed: 2, IncidentCreated: 1 },
      evidence: { trigger: 2 },
    },
  },
  {
    name: "health event fails after the observation was written",
    prelude: [],
    failing: 503,
    method: "recordEvent",
    when: eventIs("HealthCheckFailed", "HealthCheckSucceeded"),
    resume: [503, 503],
    expectAfterResume: {
      incidents: ["DETECTED/false"],
      events: { HealthCheckFailed: 2, IncidentCreated: 1 },
      evidence: { trigger: 2 },
    },
  },
  {
    name: "incident insert fails",
    prelude: [503],
    failing: 503,
    method: "createIncident",
    resume: [503],
    expectAfterResume: {
      incidents: ["DETECTED/false"],
      events: { HealthCheckFailed: 2, IncidentCreated: 1 },
      evidence: { trigger: 2 },
    },
  },
  {
    name: "IncidentCreated event fails after the incident was written",
    prelude: [503],
    failing: 503,
    method: "recordEvent",
    when: eventIs("IncidentCreated"),
    resume: [503],
    expectAfterResume: {
      incidents: ["DETECTED/false"],
      events: { HealthCheckFailed: 2, IncidentCreated: 1 },
      evidence: { trigger: 2 },
    },
  },
  {
    name: "evidence append fails",
    prelude: [503, 503],
    failing: 503,
    method: "appendEvidence",
    resume: [503],
    expectAfterResume: {
      incidents: ["DETECTED/false"],
      events: { HealthCheckFailed: 3, IncidentCreated: 1, IncidentUpdated: 1 },
      evidence: { trigger: 2, ongoing: 1 },
    },
  },
  {
    name: "IncidentUpdated event fails after the evidence was written",
    prelude: [503, 503],
    failing: 503,
    method: "recordEvent",
    when: eventIs("IncidentUpdated"),
    resume: [503],
    expectAfterResume: {
      incidents: ["DETECTED/false"],
      events: { HealthCheckFailed: 3, IncidentCreated: 1, IncidentUpdated: 1 },
      evidence: { trigger: 2, ongoing: 1 },
    },
  },
  {
    name: "resolve fails",
    prelude: [503, 503, 200],
    failing: 200,
    method: "resolveIncident",
    resume: [200],
    expectAfterResume: {
      incidents: ["RESOLVED/true"],
      events: {
        HealthCheckFailed: 2,
        HealthCheckSucceeded: 2,
        IncidentCreated: 1,
        RecoveryVerified: 1,
      },
      evidence: { trigger: 2, recovery: 2 },
    },
  },
  {
    name: "RecoveryVerified event fails after the incident was resolved",
    prelude: [503, 503, 200],
    failing: 200,
    method: "recordEvent",
    when: eventIs("RecoveryVerified"),
    resume: [200],
    expectAfterResume: {
      incidents: ["RESOLVED/true"],
      events: {
        HealthCheckFailed: 2,
        HealthCheckSucceeded: 2,
        IncidentCreated: 1,
        RecoveryVerified: 1,
      },
      evidence: { trigger: 2, recovery: 2 },
    },
  },
];

describe.skipIf(!databaseUrl)("per-check atomic persistence", () => {
  it.each(scenarios)(
    "$name: nothing from the check survives and the next tick is correct",
    async (s) => {
      const store = new KoraStore(sql!);
      const service = await store.ensureService(
        `atomic-${crypto.randomUUID()}`,
        "http://x.test/health",
      );
      const serviceId = String(service.id);
      const status = { current: 200 };
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(new Response("", { status: status.current })),
        ),
      );
      const monitor = new HealthMonitor(config, store, quietLogger, serviceId);
      for (const code of s.prelude) {
        status.current = code;
        await monitor.checkOnce();
      }
      const before = await snapshot(serviceId);
      const memoryBefore = structuredClone(memoryOf(monitor));

      const fired = failOnce(s.method, s.when);
      status.current = s.failing;
      await expect(monitor.checkOnce()).rejects.toThrow(/injected fault/);
      expect(fired()).toBe(true);

      expect(await snapshot(serviceId)).toEqual(before);
      expect(memoryOf(monitor)).toEqual(memoryBefore);
      await assertIntegrity(serviceId);

      for (const code of s.resume) {
        status.current = code;
        await monitor.checkOnce();
      }
      const after = await snapshot(serviceId);
      expect(after.incidents).toEqual(s.expectAfterResume.incidents);
      expect(after.events).toMatchObject(s.expectAfterResume.events);
      expect(after.evidence).toEqual(s.expectAfterResume.evidence);
      await assertIntegrity(serviceId);
    },
  );

  it("logs the persistence failure from the scheduler and the next tick proceeds", async () => {
    const store = new KoraStore(sql!);
    const service = await store.ensureService(
      `atomic-${crypto.randomUUID()}`,
      "http://x.test/health",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 200 }))),
    );
    const error = vi.fn();
    const logger = { ...quietLogger, error } as unknown as typeof quietLogger;
    const monitor = new HealthMonitor(
      config,
      store,
      logger,
      String(service.id),
    );
    failOnce("recordEvent");
    monitor.start();
    await monitor.stop();
    expect(error).toHaveBeenCalledTimes(1);
    const observation = await monitor.checkOnce();
    expect(observation.healthy).toBe(true);
    expect((await snapshot(String(service.id))).observations).toBe(1);
  });
});
