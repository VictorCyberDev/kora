import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import type {
  IncidentSnapshot,
  TelemetryObservation,
} from "@kora/incident-engine";
import { buildApi } from "../app.js";
import { KoraStore } from "../store.js";
import { DeploymentVerifier } from "../verification/verifier.js";
import {
  claimBody,
  sha,
  startFakeServer,
} from "../test-support/fake-servers.js";
import { quietLogger } from "../test-support/monitor-harness.js";
import { openUi, type Page } from "../test-support/ui-harness.js";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const store = sql ? new KoraStore(sql) : null;
const closers: Array<() => Promise<void>> = [];
const pages: Page[] = [];
afterEach(async () => {
  for (const p of pages.splice(0)) p.close();
  for (const close of closers.splice(0)) await close();
});
afterAll(async () => {
  if (sql) await sql.end();
});

/** A real service, resource, verification check, incident and recovery. */
async function fixture() {
  const github = await startFakeServer((r) =>
    r.url.includes("/compare/")
      ? { body: { status: "ahead", ahead_by: 3, behind_by: 0 } }
      : { body: { object: { sha: sha(2), type: "commit" } } },
  );
  const workload = await startFakeServer(() => ({ body: claimBody() }));
  closers.push(github.close, workload.close);
  const name = `ui-<b>${crypto.randomUUID()}</b>`;
  const service = await store!.ensureService(name, `${workload.url}/health`);
  const serviceId = String(service.id);
  const resource = await store!.ensureProviderResource({
    provider: "rumptycloud",
    providerAccount: `workspace-${crypto.randomUUID()}`,
    region: "verified-test-region",
    resourceType: "virtual_machine",
    providerResourceId: `rc-${crypto.randomUUID()}`,
    displayName: "ui-test",
    environment: "test",
    status: "RUNNING",
    metadata: {},
  });
  await store!.bindServiceToResource(serviceId, String(resource.id));
  await new DeploymentVerifier({
    store: store!,
    serviceId,
    logger: quietLogger,
    repo: "acme/widgets",
    branch: "main",
    apiUrl: github.url,
    claimUrl: `${workload.url}/__kora`,
    timeoutMs: 1000,
  }).checkOnce();

  const base = Date.now() - 60_000;
  const obs = (n: number, healthy: boolean): TelemetryObservation => ({
    id: crypto.randomUUID(),
    serviceId,
    observedAt: new Date(base + n * 1000).toISOString(),
    healthy,
    httpStatus: healthy ? 200 : 503,
    latencyMs: 10 + n,
    timedOut: false,
    failureReason: healthy ? null : "<img src=x onerror=alert(1)> returned 503",
    failureCategory: healthy ? null : "HTTP_5XX",
    resourceId: String(resource.id),
    providerStatus: "RUNNING",
  });
  const failing = [obs(0, false), obs(1, false), obs(2, false)];
  const recovery = [obs(5, true), obs(6, true)];
  for (const o of [...failing, ...recovery]) await store!.recordObservation(o);
  const incident: IncidentSnapshot = {
    id: crypto.randomUUID(),
    serviceId,
    deduplicationKey: `${serviceId}:health-check-unhealthy`,
    state: "DETECTED",
    severity: "HIGH",
    startedAt: failing[0]!.observedAt,
    resolvedAt: null,
    evidence: failing,
    recoveryEvidence: [],
  };
  await store!.createIncident(incident);
  await store!.recordEvent({
    eventId: crypto.randomUUID(),
    eventType: "IncidentCreated",
    schemaVersion: 1,
    occurredAt: new Date(base + 3000).toISOString(),
    source: "incident-engine",
    serviceId,
    correlationId: incident.id,
    payload: { severity: "HIGH", ratio: 0.1 },
  });
  return { name, serviceId, incidentId: incident.id };
}

/** Answers the page's fetches from the real API, in process. */
function realApi() {
  const app = buildApi(store!, "test");
  closers.push(() => app.close());
  return async (url: string) => {
    const r = await app.inject({ method: "GET", url });
    let body: unknown;
    try {
      body = r.json();
    } catch {
      body = undefined;
    }
    return { status: r.statusCode, body };
  };
}

describe.skipIf(!databaseUrl)("evidence page against the real API", () => {
  it("follows one incident from fact to diagnosis to export", async () => {
    const { name, serviceId, incidentId } = await fixture();
    const api = realApi();
    const page = await openUi({ routes: api });
    pages.push(page);
    const card = [
      ...page.document.querySelectorAll('[data-item="service"]'),
    ].find((c) => c.querySelector("h3")!.textContent === name)!;
    expect(
      card,
      "the service card renders its hostile-looking name as text",
    ).toBeDefined();
    expect(
      card.querySelector('[data-field="providerStatus"]')!.textContent,
    ).toBe("RUNNING");
    expect(
      card.querySelector('[data-field="openIncidents"]')!.textContent,
    ).toBe("1 open");
    const v = card.querySelector('[data-section="verification"]')!;
    expect(v.querySelector("summary")!.textContent).toBe(
      "Deployment Verification (not cryptographic)",
    );
    expect(v.querySelector('[data-field="status"]')!.textContent).toBe(
      "BEHIND",
    );
    expect(v.querySelector('[data-field="behindBy"]')!.textContent).toBe("3");
    expect(v.querySelector('[data-field="scmHead"]')!.textContent).toBe(sha(2));
    expect(v.querySelector('[data-field="claimedCommit"]')!.textContent).toBe(
      sha(1),
    );
    expect(
      v.querySelectorAll('[data-item="verification-evidence"]').length,
    ).toBe(3);
    expect(
      v.querySelector('[data-section="provider-leg"] .label')!.textContent,
    ).toBe("NOT COLLECTED");

    const link = [
      ...page.document.querySelectorAll('[data-item="incident"] a'),
    ].find((a) => a.getAttribute("href") === `#/incident/${incidentId}`) as
      HTMLAnchorElement | undefined;
    expect(link).toBeDefined();
    link!.click();
    await page.settle();

    const passport = (await api(`/incidents/${incidentId}/passport`)).body as {
      evidence: Array<{ contentHash: string }>;
      timeline: unknown[];
      integrity: { contentHash: string };
      diagnosis: { contentHash: string };
    };
    const doc = page.document;
    expect(doc.querySelectorAll('[data-item="timeline"]')).toHaveLength(
      passport.timeline.length,
    );
    expect(
      [
        ...doc.querySelectorAll('[data-item="evidence"] [data-field="hash"]'),
      ].map((e) => e.textContent),
    ).toEqual(passport.evidence.map((e) => e.contentHash));
    expect(
      doc.querySelector('[data-field="rootCause"] .label')!.textContent,
    ).toBe("UNKNOWN");
    expect(doc.querySelector('[data-field="snapshotHash"]')!.textContent).toBe(
      passport.diagnosis.contentHash,
    );
    const statuses = [...doc.querySelectorAll('[data-item="gap"] .label')].map(
      (e) => e.textContent,
    );
    expect(statuses).toContain("UNKNOWN");
    expect(statuses).toContain("NOT COLLECTED");
    expect(doc.querySelector('[data-field="contentHash"]')!.textContent).toBe(
      passport.integrity.contentHash,
    );
    expect(
      doc
        .querySelector('a[data-action="download-passport"]')!
        .getAttribute("href"),
    ).toBe(`/incidents/${incidentId}/passport`);
    // Hostile text from the database is on the page as text only.
    expect(doc.body.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(doc.querySelectorAll("img")).toHaveLength(0);
    expect(page.errors).toEqual([]);
    for (const r of page.requests) expect(r.method).toBe("GET");
    expect(page.requests.map((r) => r.url)).toContain(
      `/services/${serviceId}/verification`,
    );
  });
});
