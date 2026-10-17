import { describe, expect, it } from "vitest";
import { createRuntimeClaim } from "@kora/runtime-claim";
import { buildApi } from "./app.js";
import type { KoraStore } from "./store.js";
const known = crypto.randomUUID();
const store = {
  listServices: () => Promise.resolve([]),
  getService: (id: string) => Promise.resolve(id === known ? { id } : null),
  listIncidents: () => Promise.resolve([]),
  getIncident: (id: string) => Promise.resolve(id === known ? { id } : null),
  getIncidentEvents: () => Promise.resolve([]),
  getIncidentEvidence: () => Promise.resolve([]),
} as unknown as KoraStore;
describe("API contracts", () => {
  it("GET /health answers 200 without credentials and without touching the store", async () => {
    const untouchable = new Proxy(
      {},
      {
        get: (_target, prop) => {
          throw new Error(`store.${String(prop)} must not be used by /health`);
        },
      },
    ) as unknown as KoraStore;
    const app = buildApi(untouchable, "test");
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "ok" });
    await app.close();
  });
  it("returns an incident through API", async () => {
    const app = buildApi(store, "test");
    const r = await app.inject(`/incidents/${known}`);
    expect(r.statusCode).toBe(200);
    expect(r.json<{ data: { id: string } }>().data.id).toBe(known);
    await app.close();
  });
  it("returns 404 for unknown incident", async () => {
    const app = buildApi(store, "test");
    const r = await app.inject(`/incidents/${crypto.randomUUID()}`);
    expect(r.statusCode).toBe(404);
    await app.close();
  });
  it("rejects invalid IDs with 400", async () => {
    const app = buildApi(store, "test");
    const r = await app.inject("/incidents/not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect(r.json<{ error: string }>().error).toBe("invalid_request");
    await app.close();
  });
});

describe("GET /__kora runtime claim", () => {
  const A = "a".repeat(40);
  const untouchable = new Proxy(
    {},
    {
      get: (_target, prop) => {
        throw new Error(`store.${String(prop)} must not be used by /__kora`);
      },
    },
  ) as unknown as KoraStore;
  const runtimeClaim = createRuntimeClaim({
    service: "kora-api",
    env: { KORA_ENVIRONMENT: "demo", KORA_COMMIT_SHA: A },
    buildInfoPath: "/nonexistent/build-info.json",
    startedAt: new Date("2026-03-04T10:00:00.000Z"),
    now: () => new Date("2026-03-04T10:01:40.000Z"),
  });
  it("returns the claim without credentials or touching the store", async () => {
    const app = buildApi(untouchable, "test", "info", { runtimeClaim });
    const r = await app.inject({ method: "GET", url: "/__kora" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.json()).toEqual({
      schema: "kora.runtime-claim/v1",
      service: "kora-api",
      environment: "demo",
      commit: A,
      commitSource: "env",
      builtAt: null,
      startedAt: "2026-03-04T10:00:00.000Z",
      uptimeSeconds: 100,
    });
    await app.close();
  });
  it("builds its own claim by default and is read-only", async () => {
    const app = buildApi(untouchable, "test");
    const body = (await app.inject("/__kora")).json<{ service: string }>();
    expect(body.service).toBe("kora-api");
    expect(
      (await app.inject({ method: "POST", url: "/__kora" })).statusCode,
    ).toBe(404);
    await app.close();
  });
});
