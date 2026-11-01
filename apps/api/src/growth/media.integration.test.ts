import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MediaProvider } from "@kora/growth";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const calls: string[] = [];
const stub: MediaProvider = {
  id: "stub-open-model",
  kind: "image",
  generate: (r) => {
    calls.push(r.prompt);
    return Promise.resolve({
      bytes: PNG,
      mime: "image/png",
      provenance: {
        provider: "stub-open-model",
        model: "stub",
        license: "Apache-2.0",
        promptHash: "abc",
        seed: null,
        generated: true,
        review: "UNREVIEWED",
      },
    });
  },
};

let h: Harness;
let bare: Harness;
beforeAll(async () => {
  if (!enabled) return;
  h = await startHarness({ media: { image: [stub], video: [] } });
  bare = await startHarness();
});
afterAll(async () => {
  if (!enabled) return;
  await h.close();
  await bare.close();
});

const brief = {
  name: "Ada Cakes",
  description:
    "Birthday cakes, cupcakes and sourdough bread baked to order in Yaba, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-6pm" }],
  services: ["Birthday cakes", "Cupcakes"],
};
async function ready(hh: Harness, email: string) {
  const a = await hh.signup(email, "Org");
  const site = (
    await hh.call("POST", "/api/sites", {
      cookie: a.cookie,
      body: { orgId: a.orgId, name: brief.name, description: "x" },
    })
  ).json.data;
  await hh.call("POST", `/api/sites/${site.id}/generate`, {
    cookie: a.cookie,
    body: brief,
  });
  await hh.call("POST", `/api/sites/${site.id}/presence/import`, {
    cookie: a.cookie,
  });
  return { a, site };
}

d("generated media over the API", () => {
  it("is honest when nothing is configured", async () => {
    const { a, site } = await ready(bare, "media0@example.com");
    const st = await bare.call("GET", `/api/sites/${site.id}/media/status`, {
      cookie: a.cookie,
    });
    expect(st.json.data.image.configured).toBe(false);
    const r = await bare.call("POST", `/api/sites/${site.id}/media/generate`, {
      cookie: a.cookie,
      body: { subject: "Birthday cakes" },
    });
    expect(r.status).toBe(503);
    expect(r.json.error).toBe("not_configured");
  });

  it("generates only what the owner sells, stores provenance, serves safely and needs approval", async () => {
    const { a, site } = await ready(h, "media1@example.com");
    const no = await h.call("POST", `/api/sites/${site.id}/media/generate`, {
      cookie: a.cookie,
      body: { subject: "Wedding venue interior" },
    });
    expect(no.status).toBe(422);
    expect(no.json.error).toBe("subject_not_stated");
    expect(calls).toHaveLength(0);

    const r = await h.call("POST", `/api/sites/${site.id}/media/generate`, {
      cookie: a.cookie,
      body: { subject: "Birthday cakes", seed: 5 },
    });
    expect(r.status).toBe(201);
    expect(r.json.data.review).toBe("UNREVIEWED");
    expect(r.json.data.provenance).toMatchObject({
      generated: true,
      provider: "stub-open-model",
      license: "Apache-2.0",
    });
    expect(calls[0]).toContain("no people, no text");
    const id = r.json.data.id;

    const file = await fetch(
      `${h.base}/api/sites/${site.id}/media/${id}/file`,
      { headers: { cookie: a.cookie } },
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("x-kora-review")).toBe("UNREVIEWED");
    expect(file.headers.get("content-security-policy")).toContain("sandbox");

    const ok = await h.call(
      "POST",
      `/api/sites/${site.id}/media/${id}/review`,
      { cookie: a.cookie, body: { decision: "APPROVED" } },
    );
    expect(ok.json.data.review).toBe("APPROVED");
    const again = await h.call(
      "POST",
      `/api/sites/${site.id}/media/${id}/review`,
      { cookie: a.cookie, body: { decision: "REJECTED" } },
    );
    expect(again.status).toBe(409);

    const other = await h.signup("media1-other@example.com", "Other");
    const denied = await h.call("GET", `/api/sites/${site.id}/media`, {
      cookie: other.cookie,
    });
    expect(denied.status).toBeGreaterThanOrEqual(403);
    const meter =
      await h.sql`SELECT COUNT(*)::int AS n FROM usage_events WHERE site_id=${site.id} AND dimension='IMAGE_RENDER'`;
    expect(Number(meter[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  it("reports a failing provider as an error and saves nothing", async () => {
    const failing: MediaProvider = {
      id: "down",
      kind: "image",
      generate: () => Promise.reject(new Error("boom")),
    };
    const hh = await startHarness({ media: { image: [failing], video: [] } });
    try {
      const { a, site } = await ready(hh, "media2@example.com");
      const r = await hh.call("POST", `/api/sites/${site.id}/media/generate`, {
        cookie: a.cookie,
        body: { subject: "Cupcakes" },
      });
      expect(r.status).toBe(502);
      const list = await hh.call("GET", `/api/sites/${site.id}/media`, {
        cookie: a.cookie,
      });
      expect(list.json.data).toHaveLength(0);
    } finally {
      await hh.close();
    }
  });
});
