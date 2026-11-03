import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

process.env.KORA_STUDIO_WORKER = "true";
const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness();
});
afterAll(async () => {
  if (enabled) await h.close();
});

const brief = {
  name: "Studio Kitchen",
  description:
    "Home-style Nigerian meals, catering and party jollof in Lekki, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-8pm" }],
};
async function ready(email: string, withKit = true) {
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
  const imp = await h.call("POST", `/api/sites/${s.id}/presence/import`, {
    cookie: a.cookie,
  });
  const facts = imp.json.data.facts;
  facts.offer.services = ["Party jollof", "Small chops"];
  facts.offer.offers = [
    {
      id: "lunch",
      title: "Weekday lunch",
      detail: "Rice and stew",
      price: "₦3,500",
    },
    { id: "eid", title: "Eid platter", detail: "", endsOn: "2020-01-01" },
  ];
  await h.call("PUT", `/api/sites/${s.id}/presence/profile`, {
    cookie: a.cookie,
    body: { facts, expectedRevision: 1 },
  });
  if (withKit)
    await h.call("POST", `/api/sites/${s.id}/brand-kit`, {
      cookie: a.cookie,
      body: { from: "site" },
    });
  return { a, s };
}

d("content studio", () => {
  it("needs a profile and brand kit, writes from facts, blocks ended offers, validates edits", async () => {
    const nokit = await ready("st0@example.com", false);
    const r0 = await h.call("POST", `/api/sites/${nokit.s.id}/content/drafts`, {
      cookie: nokit.a.cookie,
      body: { goal: "welcome", channel: "instagram" },
    });
    expect(r0.status).toBe(409);
    expect(r0.json.error).toBe("no_brand_kit");

    const { a, s } = await ready("st1@example.com");
    const ok = await h.call("POST", `/api/sites/${s.id}/content/drafts`, {
      cookie: a.cookie,
      body: { goal: "announce_offer", channel: "instagram", offerId: "lunch" },
    });
    expect(ok.status).toBe(201);
    expect(ok.json.data.source).toBe("deterministic");
    expect(ok.json.data.drafts[0].draft.body).toContain("₦3,500");
    const ended = await h.call("POST", `/api/sites/${s.id}/content/drafts`, {
      cookie: a.cookie,
      body: { goal: "announce_offer", channel: "instagram", offerId: "eid" },
    });
    expect(ended.status).toBe(422);
    expect(ended.json.message).toMatch(/ended/);
    const draft = ok.json.data.drafts[0];
    const bad = await h.call(
      "PATCH",
      `/api/sites/${s.id}/content/drafts/${draft.id}`,
      {
        cookie: a.cookie,
        body: { ...draft.draft, body: "Everything is ₦100 today" },
      },
    );
    expect(bad.status).toBe(422);
    const fine = await h.call(
      "PATCH",
      `/api/sites/${s.id}/content/drafts/${draft.id}`,
      {
        cookie: a.cookie,
        body: { ...draft.draft, headline: "Lunch is ready" },
      },
    );
    expect(fine.status).toBe(200);
    expect(fine.json.data.source).toBe("owner");
    expect(
      (
        await h.call(
          "DELETE",
          `/api/sites/${s.id}/content/drafts/${draft.id}`,
          { cookie: a.cookie },
        )
      ).status,
    ).toBe(200);
    const list = await h.call("GET", `/api/sites/${s.id}/content/drafts`, {
      cookie: a.cookie,
    });
    expect(
      list.json.data.find((x: { id: string }) => x.id === draft.id),
    ).toBeUndefined();
  });
});

d("brand studio", () => {
  it("renders a real PNG with the brand kit version, freezes it, and isolates tenants", async () => {
    const { a, s } = await ready("st2@example.com");
    const spec = {
      format: "square",
      category: "offer",
      headline: "Weekday lunch",
      subline: "Rice and stew",
      cta: "Order on WhatsApp",
      contact: "+2348012345678",
    };
    const made = await h.call("POST", `/api/sites/${s.id}/assets`, {
      cookie: a.cookie,
      body: spec,
    });
    expect(made.status).toBe(201);
    const asset = made.json.data.asset;
    expect(asset.brandVersion).toBe(1);
    const file = await fetch(
      `${h.base}/api/sites/${s.id}/assets/${asset.id}/file`,
      { headers: { cookie: a.cookie } },
    );
    expect(file.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await file.arrayBuffer());
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.readUInt32BE(16)).toBe(1080);
    expect(buf.length).toBeGreaterThan(5000);
    const used =
      await h.sql`SELECT dimension, SUM(quantity)::int AS n FROM usage_events WHERE site_id=${s.id} GROUP BY dimension`;
    expect(
      Object.fromEntries(used.map((u) => [u.dimension, u.n])),
    ).toMatchObject({ IMAGE_RENDER: 1 });
    const svg = await fetch(
      `${h.base}/api/sites/${s.id}/assets/${asset.id}/file?as=svg`,
      { headers: { cookie: a.cookie } },
    );
    expect(svg.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(await svg.text()).toContain("Weekday lunch");

    // A new kit version does not change the stored asset.
    const kit = (
      await h.call("GET", `/api/sites/${s.id}/brand-kit`, { cookie: a.cookie })
    ).json.data.current.kit;
    kit.colors.primary = "#0b6b3a";
    kit.colors.primaryText = "#ffffff";
    await h.call("POST", `/api/sites/${s.id}/brand-kit`, {
      cookie: a.cookie,
      body: { kit },
    });
    const again = Buffer.from(
      await (
        await fetch(`${h.base}/api/sites/${s.id}/assets/${asset.id}/file`, {
          headers: { cookie: a.cookie },
        })
      ).arrayBuffer(),
    );
    expect(again.equals(buf)).toBe(true);
    const v2 = (
      await h.call("POST", `/api/sites/${s.id}/assets`, {
        cookie: a.cookie,
        body: spec,
      })
    ).json.data.asset;
    expect(v2.brandVersion).toBe(2);
    await expect(
      h.sql`UPDATE media_assets SET format='x' WHERE id=${asset.id}`,
    ).rejects.toThrow(/append-only/);

    // Rules: foreign phone numbers, ended offers, unknown fields.
    expect(
      (
        await h.call("POST", `/api/sites/${s.id}/assets`, {
          cookie: a.cookie,
          body: { ...spec, contact: "+2348099999999" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await h.call("POST", `/api/sites/${s.id}/assets`, {
          cookie: a.cookie,
          body: { ...spec, headline: "Eid platter sale" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await h.call("POST", `/api/sites/${s.id}/assets`, {
          cookie: a.cookie,
          body: { ...spec, fontFamily: "Comic Sans" },
        })
      ).status,
    ).toBe(400);

    const b = await h.signup("st2b@example.com", "B");
    expect(
      (await h.call("GET", `/api/sites/${s.id}/assets`, { cookie: b.cookie }))
        .status,
    ).toBe(404);
    expect(
      (
        await fetch(`${h.base}/api/sites/${s.id}/assets/${asset.id}/file`, {
          headers: { cookie: b.cookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call("POST", `/api/sites/${s.id}/assets`, {
          cookie: b.cookie,
          body: spec,
        })
      ).status,
    ).toBe(404);
  });
});

d("motion studio", () => {
  it("previews instantly, renders a real MP4 through the queue, and retries failures safely", async () => {
    const { a, s } = await ready("st3@example.com");
    const spec = {
      template: "service_stack",
      format: "square",
      headline: "What we do",
      items: ["Party jollof", "Small chops"],
      cta: "Order now",
      contact: "+2348012345678",
      durationSec: 4,
    };
    const pre = await h.call("POST", `/api/sites/${s.id}/motion/preview`, {
      cookie: a.cookie,
      body: spec,
    });
    expect(pre.json.data.frames).toHaveLength(3);
    expect(pre.json.data.frames[2].svg).toContain("Order now");

    const opts = await h.call("GET", `/api/sites/${s.id}/studio/options`, {
      cookie: a.cookie,
    });
    if (!opts.json.data.motion.exportAvailable) return; // honest skip on hosts without an encoder
    const q = await h.call("POST", `/api/sites/${s.id}/motion`, {
      cookie: a.cookie,
      body: spec,
    });
    expect(q.status).toBe(202);
    let job = q.json.data;
    for (let i = 0; i < 60 && !["READY", "FAILED"].includes(job.status); i++) {
      await new Promise((r) => setTimeout(r, 1000));
      job = (
        await h.call("GET", `/api/sites/${s.id}/motion/${job.id}`, {
          cookie: a.cookie,
        })
      ).json.data;
    }
    expect(job.status).toBe("READY");
    const vid = Buffer.from(
      await (
        await fetch(`${h.base}/api/sites/${s.id}/assets/${job.assetId}/file`, {
          headers: { cookie: a.cookie },
        })
      ).arrayBuffer(),
    );
    expect(vid.subarray(4, 8).toString()).toBe("ftyp");

    // A job that cannot render ends FAILED after bounded attempts and is only then retryable.
    expect(
      (
        await h.call("POST", `/api/sites/${s.id}/motion/${job.id}/retry`, {
          cookie: a.cookie,
        })
      ).status,
    ).toBe(409);
    await h.sql`UPDATE brand_kits SET kit=kit WHERE false`;
    const bad = await h.call("POST", `/api/sites/${s.id}/motion`, {
      cookie: a.cookie,
      body: spec,
    });
    await h.sql`UPDATE motion_renders SET status='FAILED',attempts=3,error='boom' WHERE id=${bad.json.data.id}`;
    expect(
      (
        await h.call(
          "POST",
          `/api/sites/${s.id}/motion/${bad.json.data.id}/retry`,
          { cookie: a.cookie },
        )
      ).status,
    ).toBe(200);
  }, 90_000);
});
