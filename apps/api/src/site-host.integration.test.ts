import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SiteHostStore, buildSiteHost } from "@kora/site-host";
import { SiteHostPublisher } from "./platform/publisher.js";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
const cli = fileURLToPath(
  new URL("../../../packages/passport/dist/cli.js", import.meta.url),
);
const brief = {
  name: "Victor Laundry",
  description:
    "Modern laundry in Lagos. We provide pickup and delivery, dry cleaning and ironing.",
  whatsapp: "+2348012345678",
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

let hostApp: ReturnType<typeof buildSiteHost> | null = null;
let hostSql: postgres.Sql | null = null;
let hostBase = "";
async function startHost() {
  const port = await freePort();
  hostBase = `http://127.0.0.1:${port}`;
  hostSql = postgres(process.env.DATABASE_URL!, { max: 3, onnotice: () => {} });
  hostApp = buildSiteHost({
    store: new SiteHostStore(hostSql),
    publicUrl: hostBase,
    faultDelayMs: 300,
  });
  await hostApp.listen({ host: "127.0.0.1", port });
}
async function stopHost() {
  await hostApp?.close();
  await hostSql?.end();
  hostApp = null;
}
const publisher = () =>
  new SiteHostPublisher({
    publicBaseUrl: hostBase,
    provider: "kora",
    providerAccount: "test",
    region: "test",
    resourceId: "site-host-test",
  });

let h: Harness;
beforeAll(async () => {
  if (!enabled) return;
  await startHost();
  h = await startHarness({ publisher });
});
afterAll(async () => {
  if (!enabled) return;
  await h.close();
  await stopHost();
});

async function publishedSite(email: string, name: string) {
  const o = await h.signup(email, `${name} Org`);
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: { orgId: o.orgId, name },
    })
  ).json.data;
  const v1 = (
    await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    })
  ).json.data.version;
  const pub1 = await h.call(
    "POST",
    `/api/sites/${site.id}/versions/${v1.id}/publish`,
    { cookie: o.cookie },
  );
  return { o, site, v1, pub1 };
}

d("independent Site Host", () => {
  it("serves the published site from its own server and verifies the live bytes", async () => {
    const { site, pub1 } = await publishedSite("sh-1@example.com", "Host One");
    expect(pub1.json.data.publicUrl).toBe(`${hostBase}/s/${site.slug}/`);
    expect(pub1.json.data.verification.status).toBe("MATCH");
    expect(new URL(pub1.json.data.publicUrl).port).not.toBe(
      new URL(h.base).port,
    );
    const res = await fetch(pub1.json.data.publicUrl);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Victor Laundry");
    // The control plane does not serve customer sites in this mode.
    expect((await fetch(`${h.base}/s/${site.slug}/`)).status).toBe(404);
    // Conditional requests are cheap.
    const etag = res.headers.get("etag")!;
    expect(
      (
        await fetch(pub1.json.data.publicUrl, {
          headers: { "if-none-match": etag },
        })
      ).status,
    ).toBe(304);
    expect(
      (await fetch(`${hostBase}/s/${site.slug}/../../etc/passwd`)).status,
    ).toBe(404);
    expect((await fetch(`${hostBase}/s/does-not-exist/`)).status).toBe(404);
  });

  it("exposes only health, claim and site content: no accounts, sessions, billing or API", async () => {
    for (const p of [
      "/api/auth/me",
      "/api/billing/plans",
      "/incidents",
      "/services",
      "/ui",
      "/app",
      "/",
    ])
      expect((await fetch(`${hostBase}${p}`)).status, p).toBe(404);
    expect(await (await fetch(`${hostBase}/health`)).json()).toMatchObject({
      status: "ok",
      database: "ok",
    });
    expect(await (await fetch(`${hostBase}/__kora`)).json()).toMatchObject({
      service: "kora-site-host",
    });
    const post = await fetch(`${hostBase}/s/x/`, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(post.status).toBe(404);
  });

  it("recovers a bad release across the service boundary, from new observations only", async () => {
    const { o, site, v1 } = await publishedSite("sh-2@example.com", "Host Two");
    const v2 = (
      await h.call("POST", `/api/sites/${site.id}/edit`, {
        cookie: o.cookie,
        body: { instruction: "Make the primary colour red" },
      })
    ).json.data.version;
    expect(
      (
        await h.call(
          "POST",
          `/api/sites/${site.id}/versions/${v2.id}/publish`,
          { cookie: o.cookie },
        )
      ).json.data.verification.status,
    ).toBe("MATCH");
    const live = `${hostBase}/s/${site.slug}/`;
    await h.runtime.monitors.checkNow(site.id);

    // Controlled test is requested through the control plane and applied by the host.
    const started = await h.call("POST", `/api/sites/${site.id}/chaos`, {
      cookie: o.cookie,
      body: { mode: "http_500", ttlSeconds: 60 },
    });
    expect(started.status).toBe(200);
    expect(started.json.data.label).toBe("Controlled test");
    expect((await fetch(live)).status).toBe(500); // the public site really fails
    // ...while the control plane stays up.
    expect((await h.call("GET", "/health")).status).toBe(200);
    expect(
      (await h.call("GET", "/api/auth/me", { cookie: o.cookie })).status,
    ).toBe(200);

    await h.runtime.monitors.checkNow(site.id);
    await h.runtime.monitors.checkNow(site.id);
    await h.runtime.monitors.settle();
    const incidents = (
      await h.call("GET", `/api/sites/${site.id}/incidents`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(incidents).toHaveLength(1);
    const view = (
      await h.call("GET", `/api/incidents/${incidents[0].id}`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(view.whatHappened).toMatch(/internal error/);
    expect(view.whatChanged.length).toBeGreaterThan(0);
    expect(view.recommendedAction).toMatchObject({
      type: "republish_site_version",
      state: "AWAITING_APPROVAL",
    });
    expect(view.recommendedAction.policy.decision).toBe("REQUIRE_APPROVAL");
    const actionId = view.recommendedAction.actionId as string;
    expect(v1.id).toBe(
      (await h.call("GET", `/api/actions/${actionId}`, { cookie: o.cookie }))
        .json.data.parameters.versionId,
    );

    await h.call("POST", `/api/actions/${actionId}/approve`, {
      cookie: o.cookie,
      body: {},
    });
    const executed = await h.call("POST", `/api/actions/${actionId}/execute`, {
      cookie: o.cookie,
    });
    expect(executed.json.data.state).toBe("VERIFYING");
    expect(executed.json.data.executions[0].executor).toBe("kora-site-host");
    // The host now serves the previous version; nothing has declared recovery yet.
    expect(
      (await h.sql`SELECT state FROM incidents WHERE id=${incidents[0].id}`)[0]!
        .state,
    ).not.toBe("RESOLVED");
    expect(
      (await h.call("GET", `/api/actions/${actionId}`, { cookie: o.cookie }))
        .json.data.state,
    ).toBe("VERIFYING");
    // The fault was bound to v2; v1 is a different version, so the host now serves it.
    expect((await fetch(live)).status).toBe(200);

    await h.runtime.monitors.checkNow(site.id);
    await h.runtime.monitors.checkNow(site.id);
    await h.runtime.monitors.settle();
    const done = (
      await h.call("GET", `/api/actions/${actionId}`, { cookie: o.cookie })
    ).json.data;
    expect(done.state).toBe("RECOVERY_VERIFIED");
    expect(done.recoveryVerification.observationIds).toHaveLength(2);

    const passport = await h.call(
      "GET",
      `/incidents/${incidents[0].id}/passport`,
      { cookie: o.cookie },
    );
    expect(passport.json.schema).toBe("kora.incident-passport/v2");
    const file = join(
      mkdtempSync(join(tmpdir(), "kora-passport-")),
      "passport.json",
    );
    writeFileSync(file, JSON.stringify(passport.json));
    expect(spawnSync("node", [cli, file], { encoding: "utf8" }).status).toBe(0);
    const audit = (
      await h.call("GET", `/api/orgs/${o.orgId}/audit`, { cookie: o.cookie })
    ).json.data.map((a: { action: string }) => a.action);
    expect(audit).toEqual(
      expect.arrayContaining([
        "chaos.started",
        "action.approved",
        "action.recovery_verified",
      ]),
    );
  }, 60_000);

  it("controlled-test faults expire on their own", async () => {
    const { o, site } = await publishedSite("sh-3@example.com", "Host Three");
    await h.call("POST", `/api/sites/${site.id}/chaos`, {
      cookie: o.cookie,
      body: { mode: "http_500", ttlSeconds: 30 },
    });
    const live = `${hostBase}/s/${site.slug}/`;
    expect((await fetch(live)).status).toBe(500);
    await h.sql`UPDATE site_faults SET expires_at = now() - interval '1 second' WHERE site_id=${site.id}`;
    expect((await fetch(live)).status).toBe(200);
    const status = (
      await h.call("GET", `/api/sites/${site.id}/status`, { cookie: o.cookie })
    ).json.data;
    expect(status.controlledTest).toBeNull();
    // TTL bounds are enforced.
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/chaos`, {
          cookie: o.cookie,
          body: { mode: "http_500", ttlSeconds: 99999 },
        })
      ).status,
    ).toBe(400);
    // A viewer-or-below cannot start one, and the feature is off unless enabled (covered by the harness flag).
    const stranger = await h.signup("sh-3b@example.com");
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/chaos`, {
          cookie: stranger.cookie,
          body: { mode: "http_500" },
        })
      ).status,
    ).toBe(404);
  });

  it("timeout faults really stall the response", async () => {
    const { o, site } = await publishedSite("sh-4@example.com", "Host Four");
    await h.call("POST", `/api/sites/${site.id}/chaos`, {
      cookie: o.cookie,
      body: { mode: "timeout", ttlSeconds: 30 },
    });
    const t0 = Date.now();
    const res = await fetch(`${hostBase}/s/${site.slug}/`);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
    expect(res.status).toBe(500);
  });

  it("a Site Host outage is observed as an incident and does not take the control plane down", async () => {
    const { o, site } = await publishedSite("sh-5@example.com", "Host Five");
    await h.runtime.monitors.checkNow(site.id);
    await stopHost();
    try {
      expect((await h.call("GET", "/health")).status).toBe(200);
      await h.runtime.monitors.checkNow(site.id);
      await h.runtime.monitors.checkNow(site.id);
      await h.runtime.monitors.settle();
      const incidents = (
        await h.call("GET", `/api/sites/${site.id}/incidents`, {
          cookie: o.cookie,
        })
      ).json.data;
      expect(incidents).toHaveLength(1);
      expect(
        (
          await h.call("GET", `/api/incidents/${incidents[0].id}`, {
            cookie: o.cookie,
          })
        ).json.data.whatHappened,
      ).toBe("Your website is not accepting connections.");
      expect(
        (await h.call("GET", "/api/auth/me", { cookie: o.cookie })).status,
      ).toBe(200);
    } finally {
      // Bring the host back on the same port for later tests.
      const port = Number(new URL(hostBase).port);
      hostSql = postgres(process.env.DATABASE_URL!, {
        max: 3,
        onnotice: () => {},
      });
      hostApp = buildSiteHost({
        store: new SiteHostStore(hostSql),
        publicUrl: hostBase,
        faultDelayMs: 300,
      });
      await hostApp.listen({ host: "127.0.0.1", port });
    }
  }, 30_000);
});

d("restart reconstruction", () => {
  it("restores monitors and keeps one open incident after the Kora API restarts", async () => {
    const { o, site } = await publishedSite(
      "sh-restart@example.com",
      "Restart Shop",
    );
    await h.runtime.monitors.checkNow(site.id);
    await h.call("POST", `/api/sites/${site.id}/chaos`, {
      cookie: o.cookie,
      body: { mode: "http_500", ttlSeconds: 600 },
    });
    await h.runtime.monitors.checkNow(site.id);
    await h.runtime.monitors.checkNow(site.id);
    await h.runtime.monitors.settle();
    const before = (
      await h.call("GET", `/api/sites/${site.id}/incidents`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(before).toHaveLength(1);

    // "Restart": a brand-new process-equivalent runtime over the same database.
    const second = await startHarness({ publisher });
    try {
      expect(second.runtime.monitors.has(site.id)).toBe(false);
      await second.runtime.startBackground();
      expect(second.runtime.monitors.has(site.id)).toBe(true);
      // Site Host URL is reconstructed from stored state.
      const [svc] =
        await second.sql`SELECT health_url FROM services WHERE site_id=${site.id}`;
      expect(String(svc!.health_url)).toBe(`${hostBase}/s/${site.slug}/`);
      // Still failing after restart: no duplicate incident.
      await second.runtime.monitors.checkNow(site.id);
      await second.runtime.monitors.checkNow(site.id);
      await second.runtime.monitors.settle();
      const open =
        await second.sql`SELECT id FROM incidents WHERE service_id=(SELECT id FROM services WHERE site_id=${site.id}) AND resolved_at IS NULL`;
      expect(open).toHaveLength(1);
      expect(String(open[0]!.id)).toBe(before[0].id);
      // Recovery after restart resolves the SAME incident from new observations.
      await second.sql`DELETE FROM site_faults WHERE site_id=${site.id}`;
      await second.runtime.monitors.checkNow(site.id);
      await second.runtime.monitors.checkNow(site.id);
      await second.runtime.monitors.settle();
      const [resolved] =
        await second.sql`SELECT state,resolved_at FROM incidents WHERE id=${before[0].id}`;
      expect(resolved!.resolved_at).not.toBeNull();
      expect(
        await second.sql`SELECT id FROM incidents WHERE service_id=(SELECT id FROM services WHERE site_id=${site.id})`,
      ).toHaveLength(1);
    } finally {
      await second.close();
    }
  }, 60_000);
});
