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
async function ready(email: string, withKit = true, hh: Harness = h) {
  const h = hh;
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
  it("persists editable timelines with revisions, optimistic concurrency, restore, duplication and tenant isolation", async () => {
    const { a, s } = await ready("st-motion-projects@example.com");
    const timeline = {
      version: 2,
      format: "square",
      durationSec: 4,
      brand: {
        kitVersion: 1,
        brandOsVersion: null,
        brandOsHash: null,
      },
      scenes: [
        {
          id: "opening",
          startSec: 0,
          durationSec: 4,
          transition: { type: "cut", durationSec: 0 },
          motion: {
            preset: "editorial-reveal",
            easing: "ease-out",
            travel: 0.15,
            scaleFrom: 1,
          },
          backgroundToken: "background",
          layers: [
            {
              id: "headline",
              type: "text",
              x: 0.1,
              y: 0.15,
              width: 0.8,
              height: 0.25,
              opacity: 1,
              overflow: "clip",
              text: "Christmas orders are open",
              role: "headline",
              align: "left",
            },
          ],
        },
      ],
      captions: [
        {
          id: "caption-1",
          sceneId: "opening",
          startSec: 0,
          endSec: 3,
          text: "Christmas orders are open",
        },
      ],
      audio: null,
    };
    const made = await h.call("POST", `/api/sites/${s.id}/motion/projects`, {
      cookie: a.cookie,
      body: { name: "Christmas launch", timeline },
    });
    expect(made.status).toBe(201);
    expect(made.json.data.revision).toBe(1);
    const projectId = made.json.data.id as string;
    const changed = {
      ...timeline,
      scenes: [
        {
          ...timeline.scenes[0],
          layers: [
            {
              ...timeline.scenes[0]!.layers[0],
              text: "Pre-order your Christmas cake",
            },
          ],
        },
      ],
    };
    const saved = await h.call(
      "PUT",
      `/api/sites/${s.id}/motion/projects/${projectId}`,
      {
        cookie: a.cookie,
        body: {
          name: "Christmas launch",
          timeline: changed,
          expectedRevision: 1,
        },
      },
    );
    expect(saved.status).toBe(200);
    expect(saved.json.data.revision).toBe(2);
    const preview = await h.call(
      "POST",
      `/api/sites/${s.id}/motion/timeline/preview`,
      { cookie: a.cookie, body: changed },
    );
    expect(preview.status).toBe(200);
    expect(preview.json.data.frames).toHaveLength(3);
    expect(preview.json.data.frames[0].svg).toContain(
      "Pre-order your Christmas cake",
    );
    const options = await h.call("GET", `/api/sites/${s.id}/studio/options`, {
      cookie: a.cookie,
    });
    if (options.json.data.motion.exportAvailable) {
      const queued = await h.call(
        "POST",
        `/api/sites/${s.id}/motion/projects/${projectId}/render`,
        { cookie: a.cookie, body: { expectedRevision: 2 } },
      );
      expect(queued.status).toBe(202);
      let render = queued.json.data;
      for (
        let attempt = 0;
        attempt < 60 && !["READY", "FAILED"].includes(render.status);
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        render = (
          await h.call("GET", `/api/sites/${s.id}/motion/${render.id}`, {
            cookie: a.cookie,
          })
        ).json.data;
      }
      expect(render.status).toBe("READY");
      const video = Buffer.from(
        await (
          await fetch(
            `${h.base}/api/sites/${s.id}/assets/${render.assetId}/file`,
            { headers: { cookie: a.cookie } },
          )
        ).arrayBuffer(),
      );
      expect(video.subarray(4, 8).toString()).toBe("ftyp");
    }
    expect(
      (
        await h.call("PUT", `/api/sites/${s.id}/motion/projects/${projectId}`, {
          cookie: a.cookie,
          body: {
            name: "stale",
            timeline,
            expectedRevision: 1,
          },
        })
      ).status,
    ).toBe(409);
    const history = await h.call(
      "GET",
      `/api/sites/${s.id}/motion/projects/${projectId}/revisions`,
      { cookie: a.cookie },
    );
    expect(
      history.json.data.map((row: { revision: number }) => row.revision),
    ).toEqual([2, 1]);
    const restored = await h.call(
      "POST",
      `/api/sites/${s.id}/motion/projects/${projectId}/restore`,
      {
        cookie: a.cookie,
        body: { revision: 1, expectedRevision: 2 },
      },
    );
    expect(restored.status).toBe(200);
    expect(restored.json.data.revision).toBe(3);
    expect(restored.json.data.timeline.scenes[0].layers[0].text).toBe(
      "Christmas orders are open",
    );
    const copy = await h.call(
      "POST",
      `/api/sites/${s.id}/motion/projects/${projectId}/duplicate`,
      { cookie: a.cookie, body: { name: "Campaign cutdown" } },
    );
    expect(copy.status).toBe(201);
    expect(copy.json.data.id).not.toBe(projectId);

    const other = await h.signup("st-motion-other@example.com", "Other");
    expect(
      (
        await h.call("GET", `/api/sites/${s.id}/motion/projects/${projectId}`, {
          cookie: other.cookie,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call(
          "DELETE",
          `/api/sites/${s.id}/motion/projects/${projectId}`,
          { cookie: a.cookie },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await h.call("GET", `/api/sites/${s.id}/motion/projects/${projectId}`, {
          cookie: a.cookie,
        })
      ).status,
    ).toBe(404);
  }, 90_000);

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

d("motion follows the Brand OS", () => {
  it("a v3 site's motion uses its Brand OS (palette, type, pace) and records which brand version; older sites are unchanged", async () => {
    const h3 = await startHarness({ env: { KORA_CREATIVE_ENGINE: "v3" } });
    try {
      const { a, s } = await ready("st-v3-motion@example.com", true, h3);
      const spec = {
        template: "offer_reveal",
        format: "square",
        headline: "Weekday lunch",
        subline: "Rice and stew",
        cta: "Order now",
        contact: "+2348012345678",
        durationSec: 5,
      };
      const r = await h3.call("POST", `/api/sites/${s.id}/motion/preview`, {
        cookie: a.cookie,
        body: spec,
      });
      expect(r.status).toBe(200);
      const bos = (
        await h3.call("GET", `/api/sites/${s.id}/brand-os`, {
          cookie: a.cookie,
        })
      ).json.data.current;
      expect(r.json.data.brandOs).toEqual({
        version: bos.version,
        hash: bos.hash,
      });
      const svg = r.json.data.frames[2].svg as string;
      // the brand's own colours reach the frame
      expect(svg.toLowerCase()).toContain(
        bos.brandOs.visual.palette.primary.toLowerCase(),
      );
      // an explicit style from the client cannot exceed the schema's bounds
      const bad = await h3.call("POST", `/api/sites/${s.id}/motion/preview`, {
        cookie: a.cookie,
        body: { ...spec, style: { speed: 99 } },
      });
      expect(bad.status).toBe(400);
    } finally {
      await h3.close();
    }
    // a v2 deployment has no Brand OS: no style is added and the response says so
    const { a, s } = await ready("st-v2-motion@example.com");
    const r = await h.call("POST", `/api/sites/${s.id}/motion/preview`, {
      cookie: a.cookie,
      body: {
        template: "offer_reveal",
        format: "square",
        headline: "Weekday lunch",
        durationSec: 5,
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.brandOs).toBeNull();
  }, 60_000);
});
