import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

let h: Harness;
let target: http.Server;
let targetUrl = "";
beforeAll(async () => {
  if (!enabled) return;
  h = await startHarness();
  target = http.createServer((_q, r) =>
    r
      .writeHead(200, { "content-type": "text/html" })
      .end(
        `<html lang="en"><head><title>Ada Cakes: birthday cakes in Yaba</title><meta name="viewport" content="width=device-width"></head><body><h1>Ada</h1><img src="a.jpg"></body></html>`,
      ),
  );
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  targetUrl = `http://127.0.0.1:${(target.address() as { port: number }).port}/`;
});
afterAll(async () => {
  if (!enabled) return;
  await h.close();
  await new Promise<void>((r) => target.close(() => r()));
});

const brief = {
  name: "Ada Cakes",
  description:
    "Birthday cakes, cupcakes and sourdough bread baked to order in Yaba, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-6pm" }],
  services: ["Birthday cakes", "Cupcakes"],
};
async function ready(email: string) {
  const a = await h.signup(email, "Org");
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: a.cookie,
      body: { orgId: a.orgId, name: brief.name, description: "x" },
    })
  ).json.data;
  await h.call("POST", `/api/sites/${site.id}/generate`, {
    cookie: a.cookie,
    body: brief,
  });
  await h.call("POST", `/api/sites/${site.id}/presence/import`, {
    cookie: a.cookie,
  });
  await h.call("POST", `/api/sites/${site.id}/brand-kit`, {
    cookie: a.cookie,
    body: { from: "site" },
  });
  return { a, site };
}

d("creative loop over the API", () => {
  it("campaign briefs offer feasible directions, block the rest, and refuse a blocked choice", async () => {
    const { a, site } = await ready("cb1@example.com");
    const body = {
      hasProductPhoto: true,
      brief: {
        name: "October box",
        objective: "announce",
        audience: "Parents planning birthdays",
        subjectKey: "offer:oct",
        subject: "the October cake box",
        startOn: "2026-10-20",
        endOn: "2026-10-31",
        channels: ["instagram", "whatsapp"],
      },
    };
    const r = await h.call("POST", `/api/sites/${site.id}/campaign-briefs`, {
      cookie: a.cookie,
      body,
    });
    expect(r.status).toBe(201);
    expect(
      r.json.data.directions.map((x: { angle: string }) => x.angle),
    ).toEqual(["product", "moment"]);
    expect(r.json.data.blocked.map((x: { angle: string }) => x.angle)).toEqual([
      "people",
      "place",
    ]);
    const bad = await h.call(
      "POST",
      `/api/sites/${site.id}/campaign-briefs/${r.json.data.id}/choose`,
      { cookie: a.cookie, body: { angle: "people" } },
    );
    expect(bad.status).toBe(422);
    const ok = await h.call(
      "POST",
      `/api/sites/${site.id}/campaign-briefs/${r.json.data.id}/choose`,
      { cookie: a.cookie, body: { angle: "moment" } },
    );
    expect(ok.json.data.chosenAngle).toBe("moment");
    const other = await h.signup("cb1-other@example.com", "Other");
    const denied = await h.call(
      "GET",
      `/api/sites/${site.id}/campaign-briefs`,
      { cookie: other.cookie },
    );
    expect(denied.status).toBeGreaterThanOrEqual(403);
  });

  it("serves discovery data, today actions, and learns taste only after enough judgements", async () => {
    const { a, site } = await ready("cb2@example.com");
    const disc = await h.call("GET", `/api/sites/${site.id}/discovery`, {
      cookie: a.cookie,
    });
    expect(disc.json.data.jsonld["@type"]).toBe("LocalBusiness");
    expect(disc.json.data.jsonld.name).toBe("Ada Cakes");
    expect(Array.isArray(disc.json.data.checklist)).toBe(true);
    const today = await h.call("GET", `/api/sites/${site.id}/today-actions`, {
      cookie: a.cookie,
    });
    expect(today.status).toBe(200);
    expect(
      today.json.data.actions.every(
        (x: { why: string; title: string }) => x.why && x.title,
      ),
    ).toBe(true);
    for (let i = 0; i < 3; i++)
      await h.call("POST", `/api/sites/${site.id}/feedback`, {
        cookie: a.cookie,
        body: { subject: `post-${i}`, label: "LOVE", traits: ["close-crop"] },
      });
    const taste = await h.call("GET", `/api/sites/${site.id}/taste`, {
      cookie: a.cookie,
    });
    expect(taste.json.data.prefers).toEqual(["close-crop"]);
    const bad = await h.call("POST", `/api/sites/${site.id}/feedback`, {
      cookie: a.cookie,
      body: { subject: "x", label: "ADORE" },
    });
    expect(bad.status).toBe(400);
  });

  it("audits a public page without a login and shares it by signed link only", async () => {
    const r = await h.call("POST", "/api/public/audit", {
      body: { url: targetUrl },
    });
    expect(r.status).toBe(201);
    expect(r.json.data.total).toBeGreaterThan(5);
    const alt = r.json.data.findings.find(
      (f: { id: string }) => f.id === "alt",
    );
    expect(alt.ok).toBe(false);
    const shared = await h.call(
      "GET",
      `/api/public/audit/shared?t=${r.json.data.shareToken}`,
    );
    expect(shared.status).toBe(200);
    expect(shared.json.data.passed).toBe(r.json.data.passed);
    const tampered = await h.call(
      "GET",
      `/api/public/audit/shared?t=${r.json.data.shareToken}x`,
    );
    expect(tampered.status).toBe(404);
    const guessed = await h.call(
      "GET",
      `/api/public/audit/shared?t=${r.json.data.id}0000`,
    );
    expect(guessed.status).toBe(404);
    const bad = await h.call("POST", "/api/public/audit", {
      body: { url: "file:///etc/passwd" },
    });
    expect(bad.status).toBe(422);
  });

  it("runs a managed request through its allowed states and keeps an event trail", async () => {
    const { a, site } = await ready("cb3@example.com");
    const c = await h.call("POST", `/api/sites/${site.id}/requests`, {
      cookie: a.cookie,
      body: { title: "Make me a Valentine flyer" },
    });
    expect(c.status).toBe(201);
    const rid = c.json.data.id;
    const ev = (event: string) =>
      h.call("POST", `/api/sites/${site.id}/requests/${rid}/events`, {
        cookie: a.cookie,
        body: { event },
      });
    expect((await ev("deliver")).status).toBe(409);
    expect((await ev("start")).json.data.state).toBe("IN_PROGRESS");
    expect((await ev("deliver")).json.data.state).toBe("DELIVERED");
    expect((await ev("accept")).json.data.state).toBe("ACCEPTED");
    expect((await ev("start")).status).toBe(409);
    const list = await h.call("GET", `/api/sites/${site.id}/requests`, {
      cookie: a.cookie,
    });
    expect(list.json.data[0].state).toBe("ACCEPTED");
    const trail =
      await h.sql`SELECT event FROM managed_request_events WHERE request_id=${rid} ORDER BY created_at`;
    expect(trail.map((t) => String(t.event))).toEqual([
      "start",
      "deliver",
      "accept",
    ]);
  });

  it("runs the customer loop: suggestions need consent, performance is honest, hand-off is hash-bound, storyboards need a chosen direction", async () => {
    const { a, site } = await ready("loop1@example.com");
    const vs = await h.call("GET", `/api/sites/${site.id}/versions`, {
      cookie: a.cookie,
    });
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${vs.json.data[0].id}/publish`,
      { cookie: a.cookie },
    );
    expect(pub.status).toBe(200);
    const post = await fetch(`${h.base}/api/public/sites/${site.id}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Bola",
        phone: "+234 805 550 0002",
        message: "Need a cake",
      }),
    });
    expect(post.status).toBeLessThan(300);
    const sug = await h.call(
      "GET",
      `/api/sites/${site.id}/customers/suggestions`,
      { cookie: a.cookie },
    );
    expect(sug.json.data[0]).toMatchObject({
      kind: "reply_now",
      requiresApproval: true,
      blockedBecause: null,
    });

    await h.sql`UPDATE leads SET status='FOLLOW_UP', last_outbound_at=now() - interval '3 days', last_inbound_at=now() - interval '4 days' WHERE site_id=${site.id}`;
    const quiet = await h.call(
      "GET",
      `/api/sites/${site.id}/customers/suggestions`,
      { cookie: a.cookie },
    );
    expect(quiet.json.data[0]).toMatchObject({ kind: "nudge" });
    expect(quiet.json.data[0].blockedBecause).toMatch(/agreed/);
    const cid = (
      await h.sql`SELECT customer_id FROM leads WHERE site_id=${site.id}`
    )[0]!.customer_id as string;
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/customers/${cid}/consent`, {
          cookie: a.cookie,
          body: { consented: true },
        })
      ).status,
    ).toBe(200);
    const agreed = await h.call(
      "GET",
      `/api/sites/${site.id}/customers/suggestions`,
      { cookie: a.cookie },
    );
    expect(agreed.json.data[0].blockedBecause).toBeNull();
    const other = await h.signup("loop1-other@example.com", "Other");
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/customers/${cid}/consent`, {
          cookie: other.cookie,
          body: { consented: false },
        })
      ).status,
    ).toBeGreaterThanOrEqual(403);

    const perf = await h.call("GET", `/api/sites/${site.id}/performance`, {
      cookie: a.cookie,
    });
    expect(perf.status).toBe(200);
    expect(perf.json.data.headline).toMatch(/not counted|counted/i);
    expect(
      perf.json.data.lines.every((l: { evidence: string }) =>
        ["OBSERVED", "INFERRED", "ESTIMATED"].includes(l.evidence),
      ),
    ).toBe(true);

    const cap = {
      headline: "Hello",
      body: "Open Mon-Sat 9am-6pm",
      cta: "",
      hashtags: [],
    };
    const it = (
      await h.call("POST", `/api/sites/${site.id}/calendar/items`, {
        cookie: a.cookie,
        body: {
          title: "Post",
          caption: cap,
          channels: ["facebook", "instagram"],
        },
      })
    ).json.data.id;
    const ib = `/api/sites/${site.id}/calendar/items/${it}`;
    expect(
      (await h.call("GET", `${ib}/handoff`, { cookie: a.cookie })).status,
    ).toBe(409);
    await h.call("POST", `${ib}/submit`, { cookie: a.cookie });
    await h.call("POST", `${ib}/approve`, { cookie: a.cookie });
    const ho = await h.call("GET", `${ib}/handoff`, { cookie: a.cookie });
    expect(ho.status).toBe(200);
    expect(ho.json.data.map((p: { channel: string }) => p.channel)).toEqual([
      "facebook",
      "instagram",
    ]);
    expect(
      ho.json.data.every((p: { manual: boolean }) => p.manual === true),
    ).toBe(true);
    await h.sql`UPDATE calendar_items SET caption = jsonb_set(caption, '{body}', '"Changed behind your back"') WHERE id=${it}`;
    const tampered = await h.call("GET", `${ib}/handoff`, { cookie: a.cookie });
    expect(tampered.status).toBe(409);
    expect(tampered.json.error).toBe("changed_after_approval");

    const cb = await h.call("POST", `/api/sites/${site.id}/campaign-briefs`, {
      cookie: a.cookie,
      body: {
        hasProductPhoto: true,
        brief: {
          name: "Box",
          objective: "announce",
          audience: "Parents",
          subjectKey: "offer:box",
          subject: "the cake box",
          startOn: "2026-10-20",
          endOn: "2026-10-31",
          channels: ["instagram"],
        },
      },
    });
    const sbUrl = `/api/sites/${site.id}/campaign-briefs/${cb.json.data.id}`;
    expect(
      (
        await h.call("POST", `${sbUrl}/storyboard`, {
          cookie: a.cookie,
          body: { cta: "Order now" },
        })
      ).status,
    ).toBe(409);
    await h.call("POST", `${sbUrl}/choose`, {
      cookie: a.cookie,
      body: { angle: "moment" },
    });
    const sb = await h.call("POST", `${sbUrl}/storyboard`, {
      cookie: a.cookie,
      body: { cta: "Order on WhatsApp", detail: "Six cupcakes and a cake" },
    });
    expect(sb.status).toBe(200);
    expect(
      sb.json.data.storyboard.scenes.map((x: { id: string }) => x.id),
    ).toEqual(["open", "detail", "close"]);
    expect(sb.json.data.storyboard.reducedMotion).toBe("still-frames");
  });
});
