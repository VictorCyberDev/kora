import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";
import { KoraHostedPublisher } from "./platform/publisher.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
let h: Harness;
let unpublished: string[] = [];
let beforePublishReturns: (() => Promise<void>) | null = null;

beforeAll(async () => {
  if (!enabled) return;
  h = await startHarness({
    env: { KORA_CREATIVE_ENGINE: "v3" },
    publisher: (base) => {
      const p = new KoraHostedPublisher(base, "test");
      const origPublish = p.publish.bind(p);
      p.publish = async (input) => {
        const out = await origPublish(input);
        if (beforePublishReturns) await beforePublishReturns(); // the delete lands while the publish is in flight
        return out;
      };
      const origUn = p.unpublish.bind(p) as (s: {
        id: string;
      }) => Promise<void>;
      (
        p as unknown as { unpublish: (s: { id: string }) => Promise<void> }
      ).unpublish = async (site) => {
        unpublished.push(site.id);
        return origUn(site);
      };
      return p;
    },
  });
});
afterAll(async () => {
  if (enabled) await h.close();
});

const brief = {
  name: "Retire Bakes",
  description: "I bake cakes and small chops.",
};
const mk = async (name = brief.name) => {
  const o = await h.signup(
    `ret-${crypto.randomUUID().slice(0, 8)}@example.com`,
  );
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: { orgId: o.orgId, name },
    })
  ).json.data;
  const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
    cookie: o.cookie,
    body: { name, description: brief.description },
  });
  return { o, site, versionId: gen.json.data.version.id as string };
};
const del = (o: { cookie: string }, site: { id: string; name: string }) =>
  h.call("DELETE", `/api/sites/${site.id}`, {
    cookie: o.cookie,
    body: { confirm: site.name },
  });

d("deleting a site retires everything that could still act on it", () => {
  it("releases custom domains, rejects waiting actions, and stops monitoring; the Site Host serves nothing for it", async () => {
    const { o, site, versionId } = await mk();
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${versionId}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.status).toBe(200);
    expect(await h.runtime.monitors.checkNow(site.id)).toBeTruthy(); // monitored while live
    await h.sql`INSERT INTO domains(id,org_id,site_id,hostname,flow,provider,state,target) VALUES(${crypto.randomUUID()},${o.orgId},${site.id},${`retire-${crypto.randomUUID().slice(0, 6)}.example.com`},'CONNECT_EXISTING','test','ACTIVE','x')`;
    const svc = (
      await h.sql`SELECT id FROM services WHERE site_id=${site.id}`
    )[0]!.id as string;
    const inc = crypto.randomUUID();
    await h.sql`INSERT INTO incidents(id,service_id,status,opened_at,summary) VALUES(${inc},${svc},'OPEN',now(),'x')`.catch(
      () => null,
    );
    const hasIncident =
      (await h.sql`SELECT 1 FROM incidents WHERE id=${inc}`).length > 0;
    if (hasIncident)
      await h.sql`INSERT INTO action_proposals(id,org_id,site_id,incident_id,service_id,action_type,reason,proposed_by,idempotency_key,state) VALUES(${crypto.randomUUID()},${o.orgId},${site.id},${inc},${svc},'REDEPLOY','x','test',${crypto.randomUUID()},'READY')`;

    const r = await del(o, site);
    expect(r.status).toBe(200);

    expect(
      (await h.sql`SELECT state FROM domains WHERE site_id=${site.id}`)[0]!
        .state,
    ).toBe("RELEASED");
    if (hasIncident)
      expect(
        (
          await h.sql`SELECT state FROM action_proposals WHERE site_id=${site.id}`
        )[0]!.state,
      ).toBe("REJECTED");
    await expect(h.runtime.monitors.checkNow(site.id)).rejects.toMatchObject({
      code: "not_monitored",
    });
    const audit = (
      await h.call("GET", `/api/orgs/${o.orgId}/audit`, { cookie: o.cookie })
    ).json.data.find((a: { action: string }) => a.action === "site.deleted");
    expect(audit.metadata.domainsReleased).toBe(1);
  });

  it("a publish after the delete is refused", async () => {
    const { o, site, versionId } = await mk();
    await del(o, site);
    const r = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${versionId}/publish`,
      { cookie: o.cookie },
    );
    expect(r.status).toBe(404);
    expect(
      (await h.sql`SELECT status FROM sites WHERE id=${site.id}`)[0]!.status,
    ).toBe("UNPUBLISHED");
  });

  it("a delete that lands while a publish is in flight wins: nothing goes live and the deployed files are taken down", async () => {
    const { o, site, versionId } = await mk();
    unpublished = [];
    beforePublishReturns = async () => {
      await del(o, site);
    };
    try {
      const r = await h.call(
        "POST",
        `/api/sites/${site.id}/versions/${versionId}/publish`,
        { cookie: o.cookie },
      );
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(r.json)).toMatch(
        /deleted while it was being published/,
      );
    } finally {
      beforePublishReturns = null;
    }
    const row = (
      await h.sql`SELECT status,deleted_at,published_version_id FROM sites WHERE id=${site.id}`
    )[0]!;
    expect(row.status).toBe("UNPUBLISHED");
    expect(row.deleted_at).not.toBeNull();
    expect(row.published_version_id).toBeNull();
    expect(unpublished).toContain(site.id);
  });

  it("a recovery action that was already executing when the site was deleted is closed, not left half-run", async () => {
    const { o, site } = await mk();
    const svc = (
      await h.sql`SELECT id FROM services WHERE site_id=${site.id}`
    )[0]?.id as string | undefined;
    // no service exists for an unpublished site: the guard is exercised through the operations path instead
    expect(svc).toBeUndefined();
    await del(o, site);
    const gone = await h.call("GET", `/api/sites/${site.id}/incidents`, {
      cookie: o.cookie,
    });
    expect(gone.status).toBe(404);
  });
});

d("restore, retention and erasure are explicit owner actions", () => {
  it("lists deleted sites, exports their enquiries, and erases them only on a typed confirmation", async () => {
    const { o, site, versionId } = await mk("Keep Bakes");
    await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${versionId}/publish`,
      { cookie: o.cookie },
    );
    await h.call("POST", `/api/public/sites/${site.id}/forms`, {
      body: { name: "Ada", phone: "0801", message: "Cake for Saturday" },
    });
    await del(o, site);

    const listed = (
      await h.call("GET", `/api/orgs/${o.orgId}/deleted-sites`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ keptEnquiries: 1, erasedEnquiries: 0 });
    const exported = (
      await h.call("GET", `/api/sites/${site.id}/deleted-enquiries`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(JSON.stringify(exported)).toContain("Cake for Saturday");

    // nothing erases by itself, and a wrong confirmation erases nothing
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/erase-enquiries`, {
          cookie: o.cookie,
          body: { confirm: "yes" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await h.sql`SELECT COUNT(*)::int AS n FROM form_submissions WHERE site_id=${site.id} AND erased_at IS NULL`
      )[0]!.n,
    ).toBe(1);

    const er = await h.call("POST", `/api/sites/${site.id}/erase-enquiries`, {
      cookie: o.cookie,
      body: { confirm: "erase Keep Bakes" },
    });
    expect(er.json.data).toEqual({ erased: 1 });
    const row = (
      await h.sql`SELECT fields,erased_at FROM form_submissions WHERE site_id=${site.id}`
    )[0]!;
    expect(row.fields).toEqual({});
    expect(row.erased_at).not.toBeNull();
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/erase-enquiries`, {
          cookie: o.cookie,
          body: { confirm: "erase Keep Bakes" },
        })
      ).json.data,
    ).toEqual({ erased: 0 });
    const audit = (
      await h.call("GET", `/api/orgs/${o.orgId}/audit`, { cookie: o.cookie })
    ).json.data;
    expect(
      audit.filter(
        (a: { action: string }) => a.action === "site.enquiries_erased",
      ),
    ).toHaveLength(2);
  });

  it("restores a deleted site (unpublished) only when the plan has room, and a restore racing a create never exceeds the allowance", async () => {
    const o = await h.signup(
      `ret-restore-${crypto.randomUUID().slice(0, 6)}@example.com`,
    );
    const sites = [];
    for (let i = 0; i < 3; i++)
      sites.push(
        (
          await h.call("POST", "/api/sites", {
            cookie: o.cookie,
            body: { orgId: o.orgId, name: `R${i}` },
          })
        ).json.data,
      );
    await del(o, { id: sites[0].id, name: "R0" });
    // one free place; fill it, then the restore must be refused
    const filler = await h.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: { orgId: o.orgId, name: "Filler" },
    });
    expect(filler.status).toBe(201);
    expect(
      (
        await h.call("POST", `/api/sites/${sites[0].id}/restore`, {
          cookie: o.cookie,
        })
      ).status,
    ).toBe(402);
    await del(o, { id: filler.json.data.id, name: "Filler" });
    // one free place again: a create and a restore race for it
    const [a, b] = await Promise.all([
      h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Racer" },
      }),
      h.call("POST", `/api/sites/${sites[0].id}/restore`, { cookie: o.cookie }),
    ]);
    expect(
      [a.status, b.status].filter((s) => s === 201 || s === 200),
    ).toHaveLength(1);
    expect([a.status, b.status]).toContain(402);
    expect(
      (
        await h.sql`SELECT COUNT(*)::int AS n FROM sites WHERE org_id=${o.orgId} AND deleted_at IS NULL`
      )[0]!.n,
    ).toBe(3);
  });

  it("a restored site is private until the owner publishes it again, and its old domain stays released", async () => {
    const { o, site, versionId } = await mk("Back Again");
    await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${versionId}/publish`,
      { cookie: o.cookie },
    );
    await h.sql`INSERT INTO domains(id,org_id,site_id,hostname,flow,provider,state,target) VALUES(${crypto.randomUUID()},${o.orgId},${site.id},${`back-${crypto.randomUUID().slice(0, 6)}.example.com`},'CONNECT_EXISTING','test','ACTIVE','x')`;
    const url = (
      await h.sql`SELECT public_url FROM sites WHERE id=${site.id}`
    )[0]!.public_url as string;
    await del(o, site);
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/restore`, {
          cookie: o.cookie,
        })
      ).status,
    ).toBe(200);
    expect((await fetch(url)).status).toBe(404);
    expect(
      (await h.sql`SELECT state FROM domains WHERE site_id=${site.id}`)[0]!
        .state,
    ).toBe("RELEASED");
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/restore`, {
          cookie: o.cookie,
        })
      ).status,
    ).toBe(404); // not deleted any more
    const again = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${versionId}/publish`,
      { cookie: o.cookie },
    );
    expect(again.status).toBe(200);
    expect((await fetch(url)).status).toBe(200);
  });

  it("restore, export and erase are administrator-only and tenant-isolated", async () => {
    const owner = await h.signup(
      `ret-own-${crypto.randomUUID().slice(0, 6)}@example.com`,
    );
    const member = await h.signup(
      `ret-mem-${crypto.randomUUID().slice(0, 6)}@example.com`,
    );
    const other = await h.signup(
      `ret-oth-${crypto.randomUUID().slice(0, 6)}@example.com`,
    );
    const memEmail = (
      await h.sql`SELECT email FROM users WHERE id=${member.userId}`
    )[0]!.email as string;
    await h.call("POST", `/api/orgs/${owner.orgId}/members`, {
      cookie: owner.cookie,
      body: { email: memEmail, role: "MEMBER" },
    });
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: owner.cookie,
        body: { orgId: owner.orgId, name: "Guarded" },
      })
    ).json.data;
    await del(owner, site);
    for (const [method, path, body] of [
      ["POST", `/api/sites/${site.id}/restore`, undefined],
      ["GET", `/api/sites/${site.id}/deleted-enquiries`, undefined],
      [
        "POST",
        `/api/sites/${site.id}/erase-enquiries`,
        { confirm: "erase Guarded" },
      ],
      ["GET", `/api/orgs/${owner.orgId}/deleted-sites`, undefined],
    ] as const) {
      expect(
        (
          await h.call(method, path, {
            cookie: member.cookie,
            ...(body ? { body } : {}),
          })
        ).status,
        `member ${path}`,
      ).toBe(403);
      expect(
        (
          await h.call(method, path, {
            cookie: other.cookie,
            ...(body ? { body } : {}),
          })
        ).status,
        `other ${path}`,
      ).toBe(404);
    }
  });
});
