import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
const cli = fileURLToPath(
  new URL("../../../packages/passport/dist/cli.js", import.meta.url),
);

let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness();
});
afterAll(async () => {
  if (enabled) await h.close();
});

const brief = {
  name: "Victor Laundry",
  description:
    "Modern laundry in Lagos. We provide pickup and delivery, dry cleaning and ironing.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "8am-6pm" }],
};

d("auth and sessions", () => {
  it("signs up, sets a hardened cookie, serves /me, logs out and revokes the session", async () => {
    const r = await h.call("POST", "/api/auth/signup", {
      body: {
        email: "A@Example.com",
        password: "correct horse battery",
        displayName: "A",
        orgName: "Org A",
      },
    });
    expect(r.status).toBe(201);
    const raw = r.headers.get("set-cookie")!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Lax/);
    expect(raw).toMatch(/Max-Age=\d+/);
    const me = await h.call("GET", "/api/auth/me", { cookie: r.cookie });
    expect(me.json.data.user.email).toBe("A@Example.com");
    expect(me.json.data.orgs[0].role).toBe("OWNER");
    await h.call("POST", "/api/auth/logout", { cookie: r.cookie });
    expect(
      (await h.call("GET", "/api/auth/me", { cookie: r.cookie })).status,
    ).toBe(401);
  });
  it("rejects weak passwords, duplicate emails and wrong credentials without leaking which", async () => {
    expect(
      (
        await h.call("POST", "/api/auth/signup", {
          body: {
            email: "x@y.com",
            password: "short",
            displayName: "x",
            orgName: "o",
          },
        })
      ).status,
    ).toBe(400);
    await h.signup("dup@example.com");
    expect(
      (
        await h.call("POST", "/api/auth/signup", {
          body: {
            email: "dup@example.com",
            password: "correct horse battery",
            displayName: "x",
            orgName: "o",
          },
        })
      ).status,
    ).toBe(409);
    const bad = await h.call("POST", "/api/auth/login", {
      body: { email: "dup@example.com", password: "wrong password!!" },
    });
    const none = await h.call("POST", "/api/auth/login", {
      body: { email: "nobody@example.com", password: "wrong password!!" },
    });
    expect(bad.status).toBe(401);
    expect(none.status).toBe(401);
    expect(bad.json.error).toBe(none.json.error);
  });
  it("stores a password hash, never the password, and only a hash of the session token", async () => {
    const { cookie } = await h.signup("hash@example.com");
    const [user] =
      await h.sql`SELECT password_hash FROM users WHERE email='hash@example.com'`;
    expect(String(user!.password_hash)).toMatch(/^scrypt\$/);
    expect(String(user!.password_hash)).not.toContain("correct horse");
    const token = cookie.split("=")[1]!;
    const rows =
      await h.sql`SELECT token_hash FROM sessions WHERE token_hash=${token}`;
    expect(rows).toHaveLength(0);
  });
  it("requires the request marker on state-changing API calls", async () => {
    const res = await fetch(`${h.base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.co", password: "x" }),
    });
    expect(res.status).toBe(403);
  });
});

d("tenant isolation", () => {
  it("never lets one organization read or change another's data", async () => {
    const a = await h.signup("tenant-a@example.com", "Org A");
    const b = await h.signup("tenant-b@example.com", "Org B");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: a.cookie,
        body: { orgId: a.orgId, name: "A Shop", description: "x" },
      })
    ).json.data;
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: a.cookie,
      body: { ...brief, name: "A Shop" },
    });
    expect(gen.status).toBe(201);
    const versionId = gen.json.data.version.id;
    // B probes every route that names A's objects.
    const probes: Array<[string, string, unknown?]> = [
      ["GET", `/api/sites/${site.id}`],
      ["PATCH", `/api/sites/${site.id}`, { name: "hijack" }],
      ["GET", `/api/sites/${site.id}/status`],
      ["GET", `/api/sites/${site.id}/versions`],
      ["GET", `/api/sites/${site.id}/versions/${versionId}`],
      ["GET", `/api/sites/${site.id}/versions/${versionId}/preview/`],
      ["POST", `/api/sites/${site.id}/versions/${versionId}/publish`],
      ["POST", `/api/sites/${site.id}/versions/${versionId}/rollback`],
      ["POST", `/api/sites/${site.id}/generate`, brief],
      [
        "POST",
        `/api/sites/${site.id}/edit`,
        { instruction: "make the primary colour red" },
      ],
      ["GET", `/api/sites/${site.id}/forms`],
      ["GET", `/api/sites/${site.id}/incidents`],
      ["GET", `/api/sites/${site.id}/deployments`],
      ["POST", `/api/sites/${site.id}/chaos`, { mode: "http_500" }],
      ["GET", `/api/orgs/${a.orgId}`],
      ["GET", `/api/orgs/${a.orgId}/audit`],
      ["GET", `/api/orgs/${a.orgId}/usage`],
      [
        "POST",
        `/api/orgs/${a.orgId}/members`,
        { email: "tenant-b@example.com", role: "ADMIN" },
      ],
    ];
    for (const [method, path, body] of probes) {
      const r = await h.call(method, path, {
        cookie: b.cookie,
        ...(body ? { body } : {}),
      });
      expect(r.status, `${method} ${path}`).toBe(404);
    }
    expect(
      (
        await h.call("POST", "/api/sites", {
          cookie: b.cookie,
          body: { orgId: a.orgId, name: "intruder" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await h.call("GET", "/api/sites", { cookie: b.cookie })).json.data,
    ).toEqual([]);
    expect(
      (await h.call("GET", "/api/sites", { cookie: a.cookie })).json.data,
    ).toHaveLength(1);
    // Anonymous callers get 401, not data.
    expect((await h.call("GET", `/api/sites/${site.id}`)).status).toBe(401);
    // A's data is untouched.
    expect(
      (await h.call("GET", `/api/sites/${site.id}`, { cookie: a.cookie })).json
        .data.name,
    ).toBe("A Shop");
  });
  it("enforces roles inside one organization", async () => {
    const owner = await h.signup("roles-owner@example.com", "Roles Org");
    const viewer = await h.signup("roles-viewer@example.com", "Viewer Own Org");
    expect(
      (
        await h.call("POST", `/api/orgs/${owner.orgId}/members`, {
          cookie: owner.cookie,
          body: { email: "roles-viewer@example.com", role: "VIEWER" },
        })
      ).status,
    ).toBe(201);
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: owner.cookie,
        body: { orgId: owner.orgId, name: "Roles Shop" },
      })
    ).json.data;
    expect(
      (await h.call("GET", `/api/sites/${site.id}`, { cookie: viewer.cookie }))
        .status,
    ).toBe(200);
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/generate`, {
          cookie: viewer.cookie,
          body: brief,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call("PATCH", `/api/sites/${site.id}`, {
          cookie: viewer.cookie,
          body: { name: "x" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call("GET", `/api/orgs/${owner.orgId}/audit`, {
          cookie: viewer.cookie,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call("GET", `/api/orgs/${owner.orgId}/audit`, {
          cookie: owner.cookie,
        })
      ).status,
    ).toBe(200);
  });
  it("hides legacy evidence routes from anonymous callers when demo mode is off", async () => {
    const closed = await (
      await import("./test-support/platform-harness.js")
    ).startHarness({ env: { KORA_LEGACY_PUBLIC_API: "false" } });
    try {
      for (const p of ["/incidents", "/services", "/ui"])
        expect((await closed.call("GET", p)).status).toBe(401);
      const u = await closed.signup("legacy@example.com");
      expect(
        (await closed.call("GET", "/incidents", { cookie: u.cookie })).status,
      ).toBe(404);
      expect(
        (
          await closed.call("GET", `/incidents/${crypto.randomUUID()}`, {
            cookie: u.cookie,
          })
        ).status,
      ).toBe(404);
      expect((await closed.call("GET", "/health")).status).toBe(200);
      expect((await closed.call("GET", "/__kora")).status).toBe(200);
    } finally {
      await closed.close();
    }
  });
});

d("builder: generate, edit, preview, versions, publish", () => {
  it("asks only for genuinely missing details", async () => {
    const o = await h.signup("builder-q@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Q Shop" },
      })
    ).json.data;
    const r = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: { description: "shoes" },
    });
    expect(r.status).toBe(422);
    expect(r.json.missing).toEqual(["description"]);
  });
  it("builds, edits (rule-based, honest about limits), previews the stored artifact, and keeps versions immutable", async () => {
    const o = await h.signup("builder@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Victor Laundry" },
      })
    ).json.data;
    const v1 = (
      await h.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: brief,
      })
    ).json.data;
    expect(v1.source).toBe("DETERMINISTIC");
    expect(v1.version.number).toBe(1);
    const edit = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: { instruction: "Make the primary colour blue" },
    });
    expect(edit.status).toBe(201);
    expect(edit.json.data.version.number).toBe(2);
    expect(edit.json.data.version.parentVersionId).toBe(v1.version.id);
    const unsupported = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        instruction: "Make the homepage feel more premium and add an FAQ",
      },
    });
    expect(unsupported.status).toBe(422);
    expect(unsupported.json.error).toBe("edit_not_applied");
    expect(
      (
        await h.call("GET", `/api/sites/${site.id}/versions`, {
          cookie: o.cookie,
        })
      ).json.data,
    ).toHaveLength(2);
    // Preview = stored artifact bytes.
    const prev = await fetch(
      `${h.base}/api/sites/${site.id}/versions/${v1.version.id}/preview/`,
      { headers: { cookie: o.cookie } },
    );
    const html = await prev.text();
    expect(prev.status).toBe(200);
    expect(html).toContain("Victor Laundry");
    const [row] =
      await h.sql`SELECT artifact FROM site_versions WHERE id=${v1.version.id}`;
    expect(html.replace(/<form[\s\S]*?<\/form>/g, "")).toContain(
      String((row!.artifact as Record<string, string>)["index.html"]).slice(
        0,
        300,
      ),
    );
    expect(
      (
        await fetch(
          `${h.base}/api/sites/${site.id}/versions/${v1.version.id}/preview/styles.css`,
          { headers: { cookie: o.cookie } },
        )
      ).status,
    ).toBe(200);
    // Immutability is enforced by the database, not just the API.
    await expect(
      h.sql`UPDATE site_versions SET spec='{}'::jsonb WHERE id=${v1.version.id}`,
    ).rejects.toThrow(/immutable/);
    await expect(
      h.sql`DELETE FROM site_versions WHERE id=${v1.version.id}`,
    ).rejects.toThrow();
  });
  it("publishes to a real URL, serves it, records change intelligence and verifies the live bytes", async () => {
    const o = await h.signup("publish@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Publish Shop" },
      })
    ).json.data;
    const v1 = (
      await h.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: brief,
      })
    ).json.data.version;
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${v1.id}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.status).toBe(200);
    expect(pub.json.data.publicUrl).toBe(`${h.base}/s/${site.slug}/`);
    expect(pub.json.data.verification.status).toBe("MATCH");
    const live = await fetch(pub.json.data.publicUrl);
    expect(live.status).toBe(200);
    expect(await live.text()).toContain("Victor Laundry");
    expect((await fetch(`${pub.json.data.publicUrl}sitemap.xml`)).status).toBe(
      200,
    );
    expect((await fetch(`${pub.json.data.publicUrl}robots.txt`)).status).toBe(
      200,
    );
    expect((await fetch(`${pub.json.data.publicUrl}services/`)).status).toBe(
      200,
    );
    expect(
      (await fetch(`${pub.json.data.publicUrl}../../etc/passwd`)).status,
    ).toBe(404);
    const changes = (
      await h.call("GET", `/api/sites/${site.id}/deployments`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(changes.changes.map((c: { kind: string }) => c.kind)).toEqual(
      expect.arrayContaining([
        "VERSION_PUBLISHED",
        "DEPLOYMENT_STARTED",
        "DEPLOYMENT_COMPLETED",
      ]),
    );
    expect(changes.revisions.map((r: { status: string }) => r.status)).toEqual(
      expect.arrayContaining(["STARTED", "COMPLETED"]),
    );
    await h.runtime.monitors.checkNow(site.id);
    const status = (
      await h.call("GET", `/api/sites/${site.id}/status`, { cookie: o.cookie })
    ).json.data;
    expect(status.headline).toMatchObject({
      status: "ONLINE",
      title: "Online",
    });
    expect(status.version.number).toBe(1);
    // The contact form accepts real submissions with validation and a honeypot.
    const ep = `/api/public/sites/${site.id}/forms`;
    expect(
      (
        await h.call("POST", ep, {
          body: { name: "Ada", email: "ada@example.com", message: "Hello" },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await h.call("POST", ep, {
          body: { name: "Bot", website: "http://spam" },
        })
      ).status,
    ).toBe(200);
    expect((await h.call("POST", ep, { body: {} })).status).toBe(422);
    expect(
      (await h.call("POST", ep, { body: { email: "not-an-email" } })).status,
    ).toBe(422);
    const subs = (
      await h.call("GET", `/api/sites/${site.id}/forms`, { cookie: o.cookie })
    ).json.data;
    expect(subs).toHaveLength(1);
    expect(subs[0].fields.name).toBe("Ada");
    const audit = (
      await h.call("GET", `/api/orgs/${o.orgId}/audit`, { cookie: o.cookie })
    ).json.data.map((a: { action: string }) => a.action);
    expect(audit).toEqual(
      expect.arrayContaining([
        "auth.signup",
        "site.created",
        "site.generated",
        "site.publish",
      ]),
    );
  });
});

d(
  "closed loop: failure, reasoning, policy, approval, action, verification, proof",
  () => {
    it("recovers a bad release through an approved rollback and proves it from new observations", async () => {
      const owner = await h.signup("loop-owner@example.com", "Loop Org");
      const viewer = await h.signup("loop-viewer@example.com", "Other");
      await h.call("POST", `/api/orgs/${owner.orgId}/members`, {
        cookie: owner.cookie,
        body: { email: "loop-viewer@example.com", role: "VIEWER" },
      });
      const site = (
        await h.call("POST", "/api/sites", {
          cookie: owner.cookie,
          body: { orgId: owner.orgId, name: "Loop Laundry" },
        })
      ).json.data;
      const v1 = (
        await h.call("POST", `/api/sites/${site.id}/generate`, {
          cookie: owner.cookie,
          body: brief,
        })
      ).json.data.version;
      await h.call("POST", `/api/sites/${site.id}/versions/${v1.id}/publish`, {
        cookie: owner.cookie,
      });
      const v2 = (
        await h.call("POST", `/api/sites/${site.id}/edit`, {
          cookie: owner.cookie,
          body: { instruction: "Make the primary colour red" },
        })
      ).json.data.version;
      await h.call("POST", `/api/sites/${site.id}/versions/${v2.id}/publish`, {
        cookie: owner.cookie,
      });
      await h.runtime.monitors.checkNow(site.id);
      // Controlled test: the PUBLISHED version v2 now genuinely fails to serve.
      expect(
        (
          await h.call("POST", `/api/sites/${site.id}/chaos`, {
            cookie: owner.cookie,
            body: { mode: "http_500" },
          })
        ).status,
      ).toBe(200);
      const live = `${h.base}/s/${site.slug}/`;
      expect((await fetch(live)).status).toBe(500);
      await h.runtime.monitors.checkNow(site.id);
      await h.runtime.monitors.checkNow(site.id); // threshold 2 -> exactly one incident
      await h.runtime.monitors.settle();
      const incidents = (
        await h.call("GET", `/api/sites/${site.id}/incidents`, {
          cookie: owner.cookie,
        })
      ).json.data;
      expect(incidents).toHaveLength(1);
      const incidentId = incidents[0].id;
      await h.runtime.monitors.checkNow(site.id); // more failures must not create a second incident
      expect(
        (
          await h.call("GET", `/api/sites/${site.id}/incidents`, {
            cookie: owner.cookie,
          })
        ).json.data,
      ).toHaveLength(1);

      // Owner view: deterministic headline and honest correlation.
      const view = (
        await h.call("GET", `/api/incidents/${incidentId}`, {
          cookie: owner.cookie,
        })
      ).json.data;
      expect(view.whatHappened).toBe(
        "Your website is reachable, but the application is returning an internal error.",
      );
      expect(view.whatChanged[0].text).toMatch(/does not prove/);
      expect(view.recommendedAction).toMatchObject({
        type: "republish_site_version",
        state: "AWAITING_APPROVAL",
        requiresApproval: true,
      });
      expect(view.recommendedAction.policy).toMatchObject({
        decision: "REQUIRE_APPROVAL",
        policyCode: "POLICY_VERSION_CHANGE_NEEDS_APPROVAL",
      });
      expect(view.reasoningSource).toBe("DETERMINISTIC_FALLBACK");
      const status1 = (
        await h.call("GET", `/api/sites/${site.id}/status`, {
          cookie: owner.cookie,
        })
      ).json.data;
      expect(status1.headline.status).toBe("NEEDS_ATTENTION");
      expect(status1.controlledTest.label).toBe("Controlled test");

      const actionId = view.recommendedAction.actionId;
      // A viewer in the org is forbidden (403); nothing runs without approval.
      expect(
        (
          await h.call("POST", `/api/actions/${actionId}/approve`, {
            cookie: viewer.cookie,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await h.call("POST", `/api/actions/${actionId}/execute`, {
            cookie: owner.cookie,
          })
        ).status,
      ).toBe(409);
      expect((await fetch(live)).status).toBe(500);

      // Approve, execute: the typed action republishes v1.
      const approved = await h.call(
        "POST",
        `/api/actions/${actionId}/approve`,
        { cookie: owner.cookie, body: { note: "ok" } },
      );
      expect(approved.json.data.state).toBe("READY");
      const executed = await h.call(
        "POST",
        `/api/actions/${actionId}/execute`,
        { cookie: owner.cookie },
      );
      expect(executed.json.data.state).toBe("VERIFYING"); // EXECUTED is not success
      expect(executed.json.data.executions[0]).toMatchObject({
        outcome: "SUCCEEDED",
        executor: "kora-hosted",
      });
      expect(
        (
          await h.call("POST", `/api/actions/${actionId}/execute`, {
            cookie: owner.cookie,
          })
        ).status,
      ).toBe(409); // not repeatable
      const verifying = (
        await h.call("GET", `/api/incidents/${incidentId}`, {
          cookie: owner.cookie,
        })
      ).json.data;
      expect(verifying.verification.state).toBe("VERIFYING");
      expect(
        (
          await h.call("GET", `/api/sites/${site.id}/status`, {
            cookie: owner.cookie,
          })
        ).json.data.headline.title,
      ).toBe("Fix applied — verifying");
      expect((await fetch(live)).status).toBe(200); // the served bytes really changed

      // Only new observations can verify recovery.
      await h.runtime.monitors.checkNow(site.id);
      expect(
        (
          await h.call("GET", `/api/actions/${actionId}`, {
            cookie: owner.cookie,
          })
        ).json.data.state,
      ).toBe("VERIFYING");
      await h.runtime.monitors.checkNow(site.id);
      await h.runtime.monitors.settle();
      const done = (
        await h.call("GET", `/api/actions/${actionId}`, {
          cookie: owner.cookie,
        })
      ).json.data;
      expect(done.state).toBe("RECOVERY_VERIFIED");
      expect(done.recoveryVerification.outcome).toBe("RECOVERY_VERIFIED");
      expect(done.recoveryVerification.recoverySeconds).toBeGreaterThanOrEqual(
        0,
      );
      expect(done.recoveryVerification.observationIds.length).toBe(2);
      expect(
        (
          await h.call("GET", `/api/sites/${site.id}/status`, {
            cookie: owner.cookie,
          })
        ).json.data.headline.title,
      ).toBe("Website restored");

      // Proof: audit trail, notifications, and a Passport v2 that verifies offline.
      const audit = (
        await h.call("GET", `/api/orgs/${owner.orgId}/audit`, {
          cookie: owner.cookie,
        })
      ).json.data.map((a: { action: string }) => a.action);
      expect(audit).toEqual(
        expect.arrayContaining([
          "action.proposed",
          "action.approved",
          "action.executed",
          "action.recovery_verified",
          "chaos.started",
        ]),
      );
      const kinds = (
        await h.call("GET", "/api/notifications", { cookie: owner.cookie })
      ).json.data.map((n: { kind: string }) => n.kind);
      expect(kinds).toEqual(
        expect.arrayContaining([
          "SITE_DOWN",
          "APPROVAL_REQUIRED",
          "RECOVERY_VERIFIED",
        ]),
      );
      const passport = await h.call(
        "GET",
        `/incidents/${incidentId}/passport`,
        { cookie: owner.cookie },
      );
      expect(passport.status).toBe(200);
      expect(passport.json.schema).toBe("kora.incident-passport/v2");
      expect(passport.json.remediation.actions[0].policyDecision.decision).toBe(
        "REQUIRE_APPROVAL",
      );
      expect(
        passport.json.remediation.actions[0].recoveryVerification.outcome,
      ).toBe("RECOVERY_VERIFIED");
      const file = join(
        mkdtempSync(join(tmpdir(), "kora-passport-")),
        "passport.json",
      );
      writeFileSync(file, JSON.stringify(passport.json));
      const verify = spawnSync("node", [cli, file], { encoding: "utf8" });
      expect(verify.status, verify.stdout + verify.stderr).toBe(0);
      // Tampering with the action trail is detected.
      passport.json.remediation.actions[0].state = "RECOVERY_FAILED";
      writeFileSync(file, JSON.stringify(passport.json));
      expect(
        spawnSync("node", [cli, file], { encoding: "utf8" }).status,
      ).not.toBe(0);
      // The append-only trail cannot be rewritten.
      await expect(h.sql`DELETE FROM policy_decisions`).rejects.toThrow(
        /append-only/,
      );
      await expect(h.sql`UPDATE audit_log SET action='x'`).rejects.toThrow(
        /append-only/,
      );
    }, 60_000);

    it("denies actions the provider cannot perform and never runs forbidden operations", async () => {
      const owner = await h.signup("deny-owner@example.com", "Deny Org");
      const site = (
        await h.call("POST", "/api/sites", {
          cookie: owner.cookie,
          body: { orgId: owner.orgId, name: "Deny Shop" },
        })
      ).json.data;
      const v1 = (
        await h.call("POST", `/api/sites/${site.id}/generate`, {
          cookie: owner.cookie,
          body: brief,
        })
      ).json.data.version;
      await h.call("POST", `/api/sites/${site.id}/versions/${v1.id}/publish`, {
        cookie: owner.cookie,
      });
      await h.call("POST", `/api/sites/${site.id}/chaos`, {
        cookie: owner.cookie,
        body: { mode: "http_500" },
      });
      await h.runtime.monitors.checkNow(site.id);
      await h.runtime.monitors.checkNow(site.id);
      await h.runtime.monitors.settle();
      const incidentId = (
        await h.call("GET", `/api/sites/${site.id}/incidents`, {
          cookie: owner.cookie,
        })
      ).json.data[0].id;
      for (const type of ["restart_service", "delete_vm", "exec", "rm -rf /"]) {
        const r = await h.call("POST", `/api/incidents/${incidentId}/actions`, {
          cookie: owner.cookie,
          body: { type, reason: "test" },
        });
        expect(r.status).toBe(201);
        expect(r.json.data.state, type).toBe("DENIED");
      }
      const [counted] =
        await h.sql`SELECT COUNT(*)::int AS n FROM action_executions e JOIN action_proposals p ON p.id=e.action_id WHERE p.action_type IN ('restart_service','delete_vm','exec','rm -rf /')`;
      expect(counted!.n).toBe(0);
    }, 30_000);
  },
);
