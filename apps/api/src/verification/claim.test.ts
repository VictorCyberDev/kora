import { afterEach, describe, expect, it } from "vitest";
import {
  claimBody,
  sha,
  startFakeServer,
  type FakeResponse,
} from "../test-support/fake-servers.js";
import { observeWorkloadClaim } from "./claim.js";

const omit = (o: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
async function serve(reply: FakeResponse) {
  const server = await startFakeServer(() => reply);
  close = server.close;
  return `${server.url}/__kora`;
}
const observe = (url: string, timeoutMs = 1000) =>
  observeWorkloadClaim({ url, timeoutMs });

describe("observeWorkloadClaim", () => {
  it("records a valid claim exactly as reported", async () => {
    const url = await serve({ body: claimBody() });
    const o = await observe(url);
    expect(o).toMatchObject({
      kind: "workload_claim",
      outcome: "OBSERVED",
      sourceUrl: url,
      httpStatus: 200,
      reason: null,
      claim: {
        service: "demo-service",
        environment: "test",
        commit: sha(1),
        commitSource: "build-info",
        builtAt: "2026-03-04T09:00:00.000Z",
        startedAt: "2026-03-04T10:00:00.000Z",
      },
    });
    expect(new Date(o.observedAt).toISOString()).toBe(o.observedAt);
  });
  it("records a claim with no commit as a claim, not an error", async () => {
    const url = await serve({
      body: claimBody({
        commit: null,
        commitSource: "unavailable",
        builtAt: null,
      }),
    });
    const o = await observe(url);
    expect(o.outcome).toBe("OBSERVED");
    expect(o.reason).toBeNull();
    expect(o.claim).toMatchObject({
      commit: null,
      commitSource: "unavailable",
      builtAt: null,
    });
  });
  it.each([
    ["an unknown schema", claimBody({ schema: "kora.runtime-claim/v2" })],
    ["a missing schema", omit(claimBody(), "schema")],
    ["an unexpected extra field", claimBody({ extra: "x" })],
    ["a short commit", claimBody({ commit: "abc123" })],
    [
      "an upper-case commit",
      claimBody({ commit: sha(1).toUpperCase().replace(/^0/, "A") }),
    ],
    ["a non-string commit", claimBody({ commit: 123 })],
    ["an unknown commitSource", claimBody({ commitSource: "magic" })],
    ["a non-ISO builtAt", claimBody({ builtAt: "last tuesday" })],
    ["a non-ISO startedAt", claimBody({ startedAt: "soon" })],
    ["a negative uptime", claimBody({ uptimeSeconds: -1 })],
    ["a missing field", omit(claimBody(), "environment")],
    ["a non-object body", ["not", "an", "object"]],
  ])("treats %s as UNKNOWN", async (_name, body) => {
    const o = await observe(await serve({ body }));
    expect(o.outcome).toBe("UNKNOWN");
    expect(o.claim).toBeNull();
    expect(o.reason).toMatch(/^invalid_claim/);
  });
  it("never echoes field values in the reason", async () => {
    const o = await observe(
      await serve({
        body: claimBody({ extra: "TOP-SECRET-VALUE", commit: "SECRET-COMMIT" }),
      }),
    );
    expect(JSON.stringify(o)).not.toContain("TOP-SECRET-VALUE");
    expect(JSON.stringify(o)).not.toContain("SECRET-COMMIT");
  });
  it("treats non-JSON as UNKNOWN", async () => {
    const o = await observe(await serve({ body: "<html>nope</html>" }));
    expect(o).toMatchObject({ outcome: "UNKNOWN", reason: "invalid_json" });
  });
  it.each([404, 500, 503])("treats HTTP %i as UNKNOWN", async (status) => {
    const o = await observe(await serve({ status, body: claimBody() }));
    expect(o).toMatchObject({
      outcome: "UNKNOWN",
      httpStatus: status,
      reason: `http_status_${status}`,
      claim: null,
    });
  });
  it("does not follow redirects", async () => {
    const o = await observe(
      await serve({
        status: 302,
        headers: { location: "http://127.0.0.1:1/" },
      }),
    );
    expect(o).toMatchObject({ outcome: "UNKNOWN", claim: null });
    expect(o.reason).toMatch(
      /^(redirect_not_followed|http_status_302|unreachable)/,
    );
  });
  it("treats an unreachable workload as UNKNOWN without throwing", async () => {
    const server = await startFakeServer(() => ({}));
    const url = `${server.url}/__kora`;
    await server.close();
    const o = await observe(url);
    expect(o).toMatchObject({ outcome: "UNKNOWN", claim: null });
    expect(o.reason).toMatch(/^unreachable: ECONNREFUSED/);
  });
  it("times out a workload that never answers", async () => {
    const o = await observe(await serve({ hang: true }), 150);
    expect(o).toMatchObject({ outcome: "UNKNOWN", reason: "timeout" });
  });
  it("treats a dropped connection as UNKNOWN", async () => {
    const o = await observe(await serve({ drop: true }));
    expect(o.outcome).toBe("UNKNOWN");
    expect(o.reason).toMatch(/^unreachable/);
  });
  it("rejects an oversized body", async () => {
    const o = await observe(await serve({ body: "x".repeat(200_000) }));
    expect(o).toMatchObject({
      outcome: "UNKNOWN",
      reason: "response_too_large",
    });
  });
  it("rejects a malformed URL as UNKNOWN", async () => {
    const o = await observe("not a url");
    expect(o).toMatchObject({ outcome: "UNKNOWN", reason: "invalid_url" });
  });
});
