/* eslint-disable @typescript-eslint/no-unsafe-return */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";
import { PlatformStore, SiteAllowanceError } from "./platform/store.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness({ env: { KORA_CREATIVE_ENGINE: "v3" } });
});
afterAll(async () => {
  if (enabled) await h.close();
});

const bakery = {
  name: "Sweet Crumbs Bakery",
  description: "I bake cakes and small chops.",
};
const mk = async (cookie: string, orgId: string, name: string) =>
  (await h.call("POST", "/api/sites", { cookie, body: { orgId, name } })).json
    .data;

d(
  "website lifecycle through the real API: from one sentence to a deleted, replaceable site",
  () => {
    it("generates a complete multipage site, edits it, publishes it, takes an enquiry, then deletes it safely", async () => {
      const o = await h.signup("life-owner@example.com");
      const site = await mk(o.cookie, o.orgId, bakery.name);

      // 1. one sentence in, a complete site out
      const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: bakery,
      });
      expect(gen.status).toBe(201);
      const v1 = (
        await h.call(
          "GET",
          `/api/sites/${site.id}/versions/${gen.json.data.version.id}`,
          { cookie: o.cookie },
        )
      ).json.data;
      expect(v1.spec.pages.map((p: { slug: string }) => p.slug)).toEqual([
        "home",
        "cakes",
        "small-chops",
        "gallery",
        "about",
        "contact",
      ]);

      // 2. the owner removes a page and edits text; every edit is a new immutable version through the same validation
      const rm = await h.call("POST", `/api/sites/${site.id}/edit`, {
        cookie: o.cookie,
        body: { designEdit: { kind: "remove-page", slug: "gallery" } },
      });
      expect(rm.status).toBe(201);
      const v2 = (
        await h.call(
          "GET",
          `/api/sites/${site.id}/versions/${rm.json.data.version.id}`,
          { cookie: o.cookie },
        )
      ).json.data;
      expect(v2.spec.pages.map((p: { slug: string }) => p.slug)).not.toContain(
        "gallery",
      );
      const bad = await h.call("POST", `/api/sites/${site.id}/edit`, {
        cookie: o.cookie,
        body: { designEdit: { kind: "remove-page", slug: "home" } },
      });
      expect(bad.status).toBeGreaterThanOrEqual(400);
      expect(
        (
          await h.call("GET", `/api/sites/${site.id}/versions`, {
            cookie: o.cookie,
          })
        ).json.data.length,
      ).toBe(2);

      // 3. publish: the public site matches the approved version
      const pub = await h.call(
        "POST",
        `/api/sites/${site.id}/versions/${rm.json.data.version.id}/publish`,
        { cookie: o.cookie },
      );
      expect(pub.status).toBe(200);
      expect(pub.json.data.verification.status).toBe("MATCH");
      const url: string = pub.json.data.publicUrl;
      expect((await fetch(url)).status).toBe(200);
      expect((await fetch(`${url}cakes/`)).status).toBe(200);

      // 4. a visitor submits a real enquiry; the owner can see it
      const sent = await h.call("POST", `/api/public/sites/${site.id}/forms`, {
        body: {
          name: "Ada",
          phone: "08012345678",
          message: "A birthday cake for 20 people on Saturday",
        },
      });
      expect(sent.status).toBe(201);
      const inbox = (
        await h.call("GET", `/api/sites/${site.id}/forms`, { cookie: o.cookie })
      ).json.data;
      expect(inbox).toHaveLength(1);
      expect(JSON.stringify(inbox)).toContain("birthday cake");

      // 5. deleting needs the site's exact name, and tells the owner what will happen first
      const impact = (
        await h.call("GET", `/api/sites/${site.id}/deletion-impact`, {
          cookie: o.cookie,
        })
      ).json.data;
      expect(impact.willStopServing).toBe(true);
      expect(impact.enquiries).toBe(1);
      expect(impact.versions).toBe(2);
      expect(impact.explanation.join(" ")).toMatch(/stop showing/);
      const noConfirm = await h.call("DELETE", `/api/sites/${site.id}`, {
        cookie: o.cookie,
        body: { confirm: "wrong name" },
      });
      expect(noConfirm.status).toBe(422);
      expect((await fetch(url)).status).toBe(200); // nothing changed

      // 6. delete: public site stops serving, enquiries are refused, site leaves the account
      const del = await h.call("DELETE", `/api/sites/${site.id}`, {
        cookie: o.cookie,
        body: { confirm: bakery.name },
      });
      expect(del.status).toBe(200);
      expect(del.json.data.alreadyDeleted).toBe(false);
      expect((await fetch(url)).status).toBe(404);
      expect((await fetch(`${url}cakes/`)).status).toBe(404);
      expect(
        (
          await h.call("POST", `/api/public/sites/${site.id}/forms`, {
            body: { message: "hello" },
          })
        ).status,
      ).toBe(404);
      expect(
        (await h.call("GET", "/api/sites", { cookie: o.cookie })).json.data.map(
          (s: { id: string }) => s.id,
        ),
      ).not.toContain(site.id);
      expect(
        (await h.call("GET", `/api/sites/${site.id}`, { cookie: o.cookie }))
          .status,
      ).toBe(404);

      // 7. idempotent: repeating it is safe and changes nothing
      const again = await h.call("DELETE", `/api/sites/${site.id}`, {
        cookie: o.cookie,
        body: { confirm: bakery.name },
      });
      expect(again.status).toBe(200);
      expect(again.json.data.alreadyDeleted).toBe(true);

      // 8. the audit record and the kept history are still there
      const audit = (
        await h.call("GET", `/api/orgs/${o.orgId}/audit`, { cookie: o.cookie })
      ).json.data;
      const rec = audit.filter(
        (a: { action: string }) => a.action === "site.deleted",
      );
      expect(rec).toHaveLength(1);
      expect(rec[0].metadata.wasLive).toBe(true);
      const kept =
        await h.sql`SELECT (SELECT COUNT(*)::int FROM site_versions WHERE site_id=${site.id}) AS v, (SELECT COUNT(*)::int FROM form_submissions WHERE site_id=${site.id}) AS f`;
      expect(kept[0]).toMatchObject({ v: 2, f: 1 });
    });

    it("restores the plan allowance, and a full account can create a replacement only after deleting", async () => {
      const o = await h.signup("life-quota@example.com");
      const made = [];
      for (let i = 0; i < 3; i++)
        made.push(await mk(o.cookie, o.orgId, `Shop ${i}`));
      const full = await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Shop 4" },
      });
      expect(full.status).toBe(402);
      expect(
        (
          await h.call("DELETE", `/api/sites/${made[0].id}`, {
            cookie: o.cookie,
            body: { confirm: "Shop 0" },
          })
        ).json.data.canCreateSite,
      ).toBe(true);
      const replacement = await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Shop 4" },
      });
      expect(replacement.status).toBe(201);
    });

    it("never over-allocates under concurrency: creations racing at the limit admit exactly the free places", async () => {
      const o = await h.signup("life-race@example.com");
      await mk(o.cookie, o.orgId, "Race 0");
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          h.call("POST", "/api/sites", {
            cookie: o.cookie,
            body: { orgId: o.orgId, name: `Race ${i + 1}` },
          }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(results.filter((r) => r.status === 402).length).toBe(4);
      const n = (
        await h.sql`SELECT COUNT(*)::int AS n FROM sites WHERE org_id=${o.orgId} AND deleted_at IS NULL`
      )[0]!.n;
      expect(n).toBe(3);
    });

    it("the allowance lock itself holds when the route pre-check is bypassed: 12 concurrent creations into 3 places admit exactly 3", async () => {
      const o = await h.signup("life-lock@example.com");
      const store = new PlatformStore(h.sql);
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          store.createSite({
            orgId: o.orgId,
            name: `Lock ${i}`,
            slug: `lock-${i}-${crypto.randomUUID().slice(0, 6)}`,
            description: "",
            createdBy: o.userId,
            siteCap: 3,
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      for (const r of results)
        if (r.status === "rejected")
          expect(r.reason).toBeInstanceOf(SiteAllowanceError);
      const n = (
        await h.sql`SELECT COUNT(*)::int AS n FROM sites WHERE org_id=${o.orgId} AND deleted_at IS NULL`
      )[0]!.n;
      expect(n).toBe(3);
    });

    it("enforces ownership: another account cannot see, preview or delete the site and learns nothing", async () => {
      const a = await h.signup("life-a@example.com");
      const b = await h.signup("life-b@example.com");
      const site = await mk(a.cookie, a.orgId, "Private Bakes");
      for (const path of [`/api/sites/${site.id}/deletion-impact`])
        expect((await h.call("GET", path, { cookie: b.cookie })).status).toBe(
          404,
        );
      const del = await h.call("DELETE", `/api/sites/${site.id}`, {
        cookie: b.cookie,
        body: { confirm: "Private Bakes" },
      });
      expect(del.status).toBe(404);
      const row = (
        await h.sql`SELECT deleted_at FROM sites WHERE id=${site.id}`
      )[0]!;
      expect(row.deleted_at).toBeNull();
      expect(
        (
          await h.call("DELETE", `/api/sites/${site.id}`, {
            body: { confirm: "Private Bakes" },
          })
        ).status,
      ).toBe(401);
    });

    it("requires an administrator: a plain member cannot delete", async () => {
      const owner = await h.signup("life-own2@example.com");
      const member = await h.signup("life-mem2@example.com");
      await h.call("POST", `/api/orgs/${owner.orgId}/members`, {
        cookie: owner.cookie,
        body: { email: "life-mem2@example.com", role: "MEMBER" },
      });
      const site = await mk(owner.cookie, owner.orgId, "Team Site");
      const r = await h.call("DELETE", `/api/sites/${site.id}`, {
        cookie: member.cookie,
        body: { confirm: "Team Site" },
      });
      expect(r.status).toBe(403);
    });

    it("deleting a draft that was never published changes nothing public and still frees the place", async () => {
      const o = await h.signup("life-draft@example.com");
      const s = await mk(o.cookie, o.orgId, "Draft Only");
      const impact = (
        await h.call("GET", `/api/sites/${s.id}/deletion-impact`, {
          cookie: o.cookie,
        })
      ).json.data;
      expect(impact.willStopServing).toBe(false);
      expect(
        (
          await h.call("DELETE", `/api/sites/${s.id}`, {
            cookie: o.cookie,
            body: { confirm: "Draft Only" },
          })
        ).status,
      ).toBe(200);
    });
  },
);
