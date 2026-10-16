import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntimeClaim } from "./claim.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const started = new Date("2026-03-04T10:00:00.000Z");

function buildInfo(content: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "kora-claim-"));
  const path = join(dir, "build-info.json");
  if (content !== null) writeFileSync(path, content);
  return path;
}
const make = (
  env: Record<string, string | undefined>,
  path: string,
  now = new Date("2026-03-04T10:00:42.900Z"),
) =>
  createRuntimeClaim({
    service: "kora-api",
    env,
    buildInfoPath: path,
    startedAt: started,
    now: () => now,
  }).snapshot();

describe("runtime claim", () => {
  it("has exactly the documented fields", () => {
    const claim = make(
      {},
      buildInfo(
        JSON.stringify({ commit: A, builtAt: "2026-03-04T09:00:00.000Z" }),
      ),
    );
    expect(Object.keys(claim).sort()).toEqual(
      [
        "builtAt",
        "commit",
        "commitSource",
        "environment",
        "schema",
        "service",
        "startedAt",
        "uptimeSeconds",
      ].sort(),
    );
    expect(claim.schema).toBe("kora.runtime-claim/v1");
    expect(claim.service).toBe("kora-api");
  });
  it("prefers the build-info commit and reports builtAt", () => {
    const claim = make(
      { KORA_COMMIT_SHA: B },
      buildInfo(
        JSON.stringify({ commit: A, builtAt: "2026-03-04T09:00:00.000Z" }),
      ),
    );
    expect(claim).toMatchObject({
      commit: A,
      commitSource: "build-info",
      builtAt: "2026-03-04T09:00:00.000Z",
    });
  });
  it("falls back to KORA_COMMIT_SHA when build-info has no commit", () => {
    const claim = make(
      { KORA_COMMIT_SHA: B.toUpperCase() },
      buildInfo(
        JSON.stringify({ commit: null, builtAt: "2026-03-04T09:00:00.000Z" }),
      ),
    );
    expect(claim).toMatchObject({
      commit: B,
      commitSource: "env",
      builtAt: "2026-03-04T09:00:00.000Z",
    });
  });
  it("uses KORA_COMMIT_SHA when there is no build-info file", () => {
    const claim = make({ KORA_COMMIT_SHA: B }, buildInfo(null));
    expect(claim).toMatchObject({
      commit: B,
      commitSource: "env",
      builtAt: null,
    });
  });
  it("is unavailable when nothing is known: null, never invented", () => {
    const claim = make({}, buildInfo(null));
    expect(claim).toMatchObject({
      commit: null,
      commitSource: "unavailable",
      builtAt: null,
    });
  });
  it("ignores an invalid KORA_COMMIT_SHA and corrupt build-info", () => {
    for (const bad of [
      "",
      "main",
      "abc123",
      A.slice(1),
      `${A}0`,
      "g".repeat(40),
    ]) {
      const claim = make({ KORA_COMMIT_SHA: bad }, buildInfo("{not json"));
      expect(claim.commit).toBeNull();
      expect(claim.commitSource).toBe("unavailable");
      expect(JSON.stringify(claim)).not.toContain(bad || "\u0000");
    }
  });
  it("rejects a non-ISO builtAt", () => {
    const claim = make(
      {},
      buildInfo(JSON.stringify({ commit: A, builtAt: "last tuesday" })),
    );
    expect(claim).toMatchObject({ commit: A, builtAt: null });
  });
  it("reports startedAt and a whole-second uptime from the clock", () => {
    const claim = make({}, buildInfo(null));
    expect(claim.startedAt).toBe("2026-03-04T10:00:00.000Z");
    expect(claim.uptimeSeconds).toBe(42);
  });
  it("uptime grows between snapshots while startedAt is fixed", () => {
    let now = new Date("2026-03-04T10:00:01.000Z");
    const source = createRuntimeClaim({
      service: "demo-service",
      env: {},
      buildInfoPath: buildInfo(null),
      startedAt: started,
      now: () => now,
    });
    const first = source.snapshot();
    now = new Date("2026-03-04T10:05:00.000Z");
    const second = source.snapshot();
    expect(first.uptimeSeconds).toBe(1);
    expect(second.uptimeSeconds).toBe(300);
    expect(second.startedAt).toBe(first.startedAt);
  });
  it("defaults the environment and honours KORA_ENVIRONMENT", () => {
    expect(make({}, buildInfo(null)).environment).toBe("development");
    expect(
      make({ KORA_ENVIRONMENT: "demo" }, buildInfo(null)).environment,
    ).toBe("demo");
  });
  it("never leaks other environment values", () => {
    const claim = make(
      {
        DATABASE_URL: "postgresql://u:topsecret@h/db",
        RUMPTY_API_KEY: "rmp_supersecret",
        KORA_COMMIT_SHA: A,
      },
      buildInfo(null),
    );
    const json = JSON.stringify(claim);
    expect(json).not.toContain("topsecret");
    expect(json).not.toContain("rmp_supersecret");
  });
});
