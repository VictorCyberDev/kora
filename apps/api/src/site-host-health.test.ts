import { describe, expect, it } from "vitest";
import { buildSiteHost, type SiteHostStore } from "@kora/site-host";

/**
 * Commissioning finding: a Site Host of this release started against a database that has not been migrated to 028 answered
 * /health with 200 and database "ok" while every site request failed with `column "deleted_at" does not exist`. Readiness must
 * not pass in that state, so a platform keeps the previous host serving until the migrations have run.
 */
const host = (store: Partial<SiteHostStore>) =>
  buildSiteHost({ store: store as SiteHostStore });

describe("Site Host readiness", () => {
  it("is 503 with schema 'outdated' when the database answers but the schema is missing columns the host reads", async () => {
    const app = host({
      ping: () => Promise.resolve(true),
      schemaReady: () => Promise.resolve(false),
    });
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({
      status: "degraded",
      database: "ok",
      schema: "outdated",
    });
    await app.close();
  });
  it("is 200 when the database and schema are ready", async () => {
    const app = host({
      ping: () => Promise.resolve(true),
      schemaReady: () => Promise.resolve(true),
    });
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      status: "ok",
      database: "ok",
      schema: "ok",
    });
    await app.close();
  });
  it("keeps the earlier behaviour when the database is simply unreachable (200, database 'unavailable')", async () => {
    const app = host({
      ping: () => Promise.resolve(false),
      schemaReady: () => Promise.resolve(false),
    });
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ database: "unavailable" });
    await app.close();
  });
});
