import { describe, expect, it } from "vitest";
import { createRuntimeClaim } from "@kora/runtime-claim";
import { buildDemoService } from "./app.js";

describe("demo failure controls", () => {
  it("are disabled by default", async () => {
    const app = buildDemoService({ NODE_ENV: "test" });
    const r = await app.inject({ method: "POST", url: "/dev/failure" });
    expect(r.statusCode).toBe(404);
    expect((await app.inject("/health")).statusCode).toBe(200);
    await app.close();
  });
  it("work only when explicitly enabled", async () => {
    const app = buildDemoService({
      NODE_ENV: "test",
      DEMO_FAILURE_INJECTION_ENABLED: "true",
    });
    expect(
      (await app.inject({ method: "POST", url: "/dev/failure" })).statusCode,
    ).toBe(200);
    expect((await app.inject("/health")).statusCode).toBe(503);
    await app.inject({ method: "POST", url: "/dev/recover" });
    expect((await app.inject("/health")).statusCode).toBe(200);
    await app.close();
  });
  it("GET /health is unauthenticated and independent of any database", async () => {
    const app = buildDemoService({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://nobody:nothing@db.unreachable.invalid:5432/x",
    });
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "healthy" });
    await app.close();
  });
});

describe("GET /__kora runtime claim", () => {
  const A = "a".repeat(40);
  const claimSource = (env: Record<string, string | undefined> = {}) =>
    createRuntimeClaim({
      service: "demo-service",
      env,
      buildInfoPath: "/nonexistent/build-info.json",
      startedAt: new Date("2026-03-04T10:00:00.000Z"),
      now: () => new Date("2026-03-04T10:00:07.000Z"),
    });
  it("returns the claim, unauthenticated and uncacheable", async () => {
    const app = buildDemoService(
      { NODE_ENV: "test", KORA_ENVIRONMENT: "demo", KORA_COMMIT_SHA: A },
      {
        runtimeClaim: claimSource({
          KORA_ENVIRONMENT: "demo",
          KORA_COMMIT_SHA: A,
        }),
      },
    );
    const r = await app.inject({ method: "GET", url: "/__kora" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("application/json");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.json()).toEqual({
      schema: "kora.runtime-claim/v1",
      service: "demo-service",
      environment: "demo",
      commit: A,
      commitSource: "env",
      builtAt: null,
      startedAt: "2026-03-04T10:00:00.000Z",
      uptimeSeconds: 7,
    });
    await app.close();
  });
  it("reports an unavailable commit as null, never a guess", async () => {
    const app = buildDemoService(
      { NODE_ENV: "test" },
      { runtimeClaim: claimSource() },
    );
    const r = await app.inject("/__kora");
    expect(r.json()).toMatchObject({
      commit: null,
      commitSource: "unavailable",
    });
    await app.close();
  });
  it("builds its own claim from the environment by default", async () => {
    const app = buildDemoService({ NODE_ENV: "test", KORA_COMMIT_SHA: A });
    const body = (await app.inject("/__kora")).json<{
      service: string;
      schema: string;
    }>();
    expect(body.service).toBe("demo-service");
    expect(body.schema).toBe("kora.runtime-claim/v1");
    await app.close();
  });
  it("is read-only", async () => {
    const app = buildDemoService({ NODE_ENV: "test" });
    for (const method of ["POST", "PUT", "DELETE"] as const)
      expect((await app.inject({ method, url: "/__kora" })).statusCode).toBe(
        404,
      );
    await app.close();
  });
  it("does not disturb /health", async () => {
    const app = buildDemoService({ NODE_ENV: "test" });
    expect((await app.inject("/health")).statusCode).toBe(200);
    await app.close();
  });
});
