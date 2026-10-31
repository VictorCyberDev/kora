import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

process.env.KORA_STUDIO_WORKER = "true";
process.env.KORA_PUBLISH_TICK_MS = "400";
const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

let h: Harness;
beforeAll(async () => {
  if (enabled)
    h = await startHarness({ env: { KORA_SANDBOX_CHANNELS: "true" } });
});
afterAll(async () => {
  if (enabled) await h.close();
});

const brief = {
  name: "Cal Kitchen",
  description: "Home-style Nigerian meals and party jollof in Lekki, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-8pm" }],
};
async function ready(email: string, connect: string[] = ["facebook"]) {
  const a = await h.signup(email, "Org");
  const s = (
    await h.call("POST", "/api/sites", {
      cookie: a.cookie,
      body: { orgId: a.orgId, name: brief.name },
    })
  ).json.data;
  await h.call("POST", `/api/sites/${s.id}/generate`, {
    cookie: a.cookie,
    body: brief,
  });
  await h.call("POST", `/api/sites/${s.id}/presence/import`, {
    cookie: a.cookie,
  });
  await h.call("POST", `/api/sites/${s.id}/brand-kit`, {
    cookie: a.cookie,
    body: { from: "site" },
  });
  for (const p of connect) {
    const st = new URL(
      (
        await h.call("POST", `/api/sites/${s.id}/channels/${p}/connect`, {
          cookie: a.cookie,
          body: {},
        })
      ).json.data.authorizeUrl,
    ).searchParams.get("state")!;
    await h.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(st)}&code=sandbox`,
      { cookie: a.cookie },
    );
  }
  return { a, s };
}
const caption = (body: string) => ({
  headline: "Hello",
  body,
  cta: "",
  hashtags: [] as string[],
});
async function item(
  h2: Harness,
  a: { cookie: string },
  sid: string,
  body: string,
  channels: string[],
  extra: object = {},
) {
  const r = await h2.call("POST", `/api/sites/${sid}/calendar/items`, {
    cookie: a.cookie,
    body: { title: "Post", caption: caption(body), channels, ...extra },
  });
  expect(r.status).toBe(201);
  return r.json.data.id as string;
}
const base = (sid: string, id: string) =>
  `/api/sites/${sid}/calendar/items/${id}`;
async function until(
  sid: string,
  id: string,
  cookie: string,
  states: string[],
  ms = 15000,
) {
  const end = Date.now() + ms;
  let last: {
    item: { state: string };
    jobs: Array<Record<string, unknown>>;
  } | null = null;
  while (Date.now() < end) {
    last = (await h.call("GET", base(sid, id), { cookie })).json.data;
    if (states.includes(last!.item.state)) return last!;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `timed out; state ${last?.item.state} ${JSON.stringify(last?.jobs)}`,
  );
}

d("calendar approval and publishing", () => {
  it("cannot skip approval, voids approval on edit, and publishes exactly once", async () => {
    const { a, s } = await ready("cal1@example.com");
    const id = await item(h, a, s.id, "Open Mon-Sat 9am-8pm in Lagos", [
      "facebook",
    ]);
    expect(
      (
        await h.call("POST", `${base(s.id, id)}/schedule`, {
          cookie: a.cookie,
          body: {},
        })
      ).status,
    ).toBe(409);
    expect(
      (await h.call("POST", `${base(s.id, id)}/approve`, { cookie: a.cookie }))
        .status,
    ).toBe(409);
    expect(
      (await h.call("POST", `${base(s.id, id)}/submit`, { cookie: a.cookie }))
        .json.data.state,
    ).toBe("APPROVAL_NEEDED");
    expect(
      (await h.call("POST", `${base(s.id, id)}/approve`, { cookie: a.cookie }))
        .json.data.state,
    ).toBe("APPROVED");
    const edit = await h.call("PATCH", base(s.id, id), {
      cookie: a.cookie,
      body: { caption: caption("Open Mon-Sat 9am-8pm, come by") },
    });
    expect(edit.json.data.state).toBe("APPROVAL_NEEDED");
    expect(edit.json.data.approvedHash).toBeNull();
    expect(
      (
        await h.call("POST", `${base(s.id, id)}/schedule`, {
          cookie: a.cookie,
          body: {},
        })
      ).status,
    ).toBe(409);
    await h.call("POST", `${base(s.id, id)}/approve`, { cookie: a.cookie });
    const sched = await h.call("POST", `${base(s.id, id)}/schedule`, {
      cookie: a.cookie,
      body: {},
    });
    expect(sched.status).toBe(200);
    expect(sched.json.data.state).toBe("SCHEDULED");
    const done = await until(s.id, id, a.cookie, ["PUBLISHED", "FAILED"]);
    expect(done.item.state).toBe("PUBLISHED");
    expect(done.jobs).toHaveLength(1);
    expect(done.jobs[0]!.method).toBe("SANDBOX");
    expect(String(done.jobs[0]!.externalId)).toMatch(/^sandbox-facebook-/);
    expect(done.jobs[0]!.attemptCount).toBe(1);
    // a published post cannot be edited or re-approved
    expect(
      (
        await h.call("PATCH", base(s.id, id), {
          cookie: a.cookie,
          body: { title: "x" },
        })
      ).status,
    ).toBe(409);
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM publish_jobs WHERE item_id=${id}`
        )[0]!.n,
      ),
    ).toBe(1);
    const detail = (await h.call("GET", base(s.id, id), { cookie: a.cookie }))
      .json.data;
    expect(
      detail.approvals.map((x: { decision: string }) => x.decision),
    ).toEqual(["APPROVED", "REVOKED", "APPROVED"]);
    await expect(
      h.sql`UPDATE approvals SET decision='REJECTED' WHERE item_id=${id}`,
    ).rejects.toThrow(/append-only/);
    const audit = (
      await h.call("GET", `/api/orgs/${a.orgId}/audit`, { cookie: a.cookie })
    ).json.data as Array<{ action: string }>;
    expect(audit.map((x) => x.action)).toEqual(
      expect.arrayContaining([
        "post.approved",
        "post.published",
        "calendar.item_created",
      ]),
    );
  });

  it("refuses posts a provider cannot take, invents nothing, and reports what is wrong", async () => {
    const { a, s } = await ready("cal2@example.com");
    const wa = await item(h, a, s.id, "Hello from Cal Kitchen", ["whatsapp"]);
    await h.call("POST", `${base(s.id, wa)}/submit`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, wa)}/approve`, { cookie: a.cookie });
    const r1 = await h.call("POST", `${base(s.id, wa)}/schedule`, {
      cookie: a.cookie,
      body: {},
    });
    expect(r1.status).toBe(422);
    expect(r1.json.message).toMatch(/does not support posting/);

    const ig = await item(h, a, s.id, "Hello from Cal Kitchen", ["instagram"]);
    await h.call("POST", `${base(s.id, ig)}/submit`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, ig)}/approve`, { cookie: a.cookie });
    const r2 = await h.call("POST", `${base(s.id, ig)}/schedule`, {
      cookie: a.cookie,
      body: {},
    });
    expect(r2.status).toBe(422);
    expect(r2.json.message).toMatch(/not connected|need an image/);

    const bad = await item(h, a, s.id, "Everything is ₦100 today", [
      "facebook",
    ]);
    await h.call("POST", `${base(s.id, bad)}/submit`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, bad)}/approve`, { cookie: a.cookie });
    const r3 = await h.call("POST", `${base(s.id, bad)}/schedule`, {
      cookie: a.cookie,
      body: {},
    });
    expect(r3.status).toBe(422);
    expect(r3.json.message).toMatch(/price/);
    expect(
      (
        await h.call("POST", `${base(s.id, bad)}/schedule`, {
          cookie: a.cookie,
          body: { scheduledFor: "2020-01-01T00:00:00.000Z" },
        })
      ).status,
    ).toBe(422);
  });

  it("classifies failures: permanent fails the post, uncertain is never retried silently", async () => {
    const { a, s } = await ready("cal3@example.com");
    const perm = await item(
      h,
      a,
      s.id,
      "Open Mon-Sat 9am-8pm [sandbox-fail:400]",
      ["facebook"],
    );
    await h.call("POST", `${base(s.id, perm)}/submit`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, perm)}/approve`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, perm)}/schedule`, {
      cookie: a.cookie,
      body: {},
    });
    const p = await until(s.id, perm, a.cookie, ["FAILED", "PUBLISHED"]);
    expect(p.item.state).toBe("FAILED");
    expect(p.jobs[0]!.errorClass).toBe("PERMANENT");
    expect(p.jobs[0]!.attemptCount).toBe(1);

    const unc = await item(
      h,
      a,
      s.id,
      "Open Mon-Sat 9am-8pm [sandbox-fail:net]",
      ["facebook"],
    );
    await h.call("POST", `${base(s.id, unc)}/submit`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, unc)}/approve`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, unc)}/schedule`, {
      cookie: a.cookie,
      body: {},
    });
    const u = await until(s.id, unc, a.cookie, ["FAILED"]);
    expect(u.jobs[0]!.errorClass).toBe("UNCERTAIN");
    expect(u.jobs[0]!.attemptCount).toBe(1);
    const retry = await h.call("POST", `${base(s.id, unc)}/retry`, {
      cookie: a.cookie,
      body: {},
    });
    expect(retry.status).toBe(409);
    expect(retry.json.error).toBe("uncertain");

    const rate = await item(
      h,
      a,
      s.id,
      "Open Mon-Sat 9am-8pm [sandbox-fail:429]",
      ["facebook"],
    );
    await h.call("POST", `${base(s.id, rate)}/submit`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, rate)}/approve`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, rate)}/schedule`, {
      cookie: a.cookie,
      body: {},
    });
    const end = Date.now() + 8000;
    let job: { state: string; attempts: number } | undefined;
    while (Date.now() < end) {
      job = (
        await h.sql`SELECT state,attempts FROM publish_jobs WHERE item_id=${rate}`
      )[0] as unknown as typeof job;
      if (job && job.attempts >= 1 && job.state === "QUEUED") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    // rate limit: back to the queue with a delay, not failed and not hammered
    expect(job).toMatchObject({ state: "QUEUED", attempts: 1 });
    const nxt = (
      await h.sql`SELECT next_attempt_at > now() + interval '30 seconds' AS later FROM publish_jobs WHERE item_id=${rate}`
    )[0]!;
    expect(nxt.later).toBe(true);
  }, 40_000);

  it("supports hand-off for channels Kora cannot post to, and keeps tenants apart", async () => {
    const { a, s } = await ready("cal4@example.com", []);
    const id = await item(h, a, s.id, "Open Mon-Sat 9am-8pm", ["tiktok"]);
    await h.call("POST", `${base(s.id, id)}/submit`, { cookie: a.cookie });
    await h.call("POST", `${base(s.id, id)}/approve`, { cookie: a.cookie });
    const pkg = await h.call("GET", `${base(s.id, id)}/package`, {
      cookie: a.cookie,
    });
    expect(pkg.json.data.text).toContain("Open Mon-Sat 9am-8pm");
    const mp = await h.call("POST", `${base(s.id, id)}/mark-posted`, {
      cookie: a.cookie,
      body: { provider: "tiktok", url: "https://www.tiktok.com/@cal/video/1" },
    });
    expect(mp.status).toBe(200);
    expect(mp.json.data.state).toBe("PUBLISHED");
    const jobs = (await h.call("GET", base(s.id, id), { cookie: a.cookie }))
      .json.data.jobs;
    expect(jobs[0].method).toBe("MANUAL");

    const b = await h.signup("cal4b@example.com", "B");
    for (const [m, p, body] of [
      ["GET", `/api/sites/${s.id}/calendar`],
      ["POST", `/api/sites/${s.id}/calendar/items`, { title: "x" }],
      ["GET", base(s.id, id)],
      ["POST", `${base(s.id, id)}/approve`],
      ["POST", `${base(s.id, id)}/schedule`, {}],
      ["POST", `${base(s.id, id)}/mark-posted`, { provider: "tiktok" }],
      ["GET", `${base(s.id, id)}/package`],
    ] as Array<[string, string, unknown?]>) {
      expect(
        (await h.call(m, p, { cookie: b.cookie, ...(body ? { body } : {}) }))
          .status,
        `${m} ${p}`,
      ).toBe(404);
    }
    const list = await h.call("GET", `/api/sites/${s.id}/calendar`, {
      cookie: a.cookie,
    });
    expect(list.json.data.items.length).toBeGreaterThan(0);
    expect(
      list.json.data.channels.find(
        (c: { provider: string }) => c.provider === "whatsapp",
      ).canPost,
    ).toBe(false);
  });
});
