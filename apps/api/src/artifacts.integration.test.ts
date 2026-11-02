import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness({ env: { KORA_CREATIVE_ENGINE: "v3" } });
});
afterAll(async () => {
  if (enabled) await h.close();
});

const brief = { name: "Fade Lab", description: "We focus on clean fades and beard grooming in Lekki.", goal: "bookings", location: "Lekki, Lagos", whatsapp: "+2348012345678", services: ["Clean fades", "Beard grooming"] };
const setup = async (email: string) => {
  const o = await h.signup(email);
  const site = (await h.call("POST", "/api/sites", { cookie: o.cookie, body: { orgId: o.orgId, name: brief.name } })).json.data;
  const gen = await h.call("POST", `/api/sites/${site.id}/generate`, { cookie: o.cookie, body: brief });
  return { o, site, version: gen.json.data.version.id as string };
};
const ask = { format: "social-square", objective: "booking", headline: "Clean fades. Sharp beards.", cta: "Book a haircut" };

d("ArtifactSpec through the real API", () => {
  it("needs a Brand OS first, then renders from it and records the brand version", async () => {
    const o = await h.signup("art-none@example.com");
    const site = (await h.call("POST", "/api/sites", { cookie: o.cookie, body: { orgId: o.orgId, name: "No Brand" } })).json.data;
    const none = await h.call("POST", `/api/sites/${site.id}/artifacts/preview`, { cookie: o.cookie, body: ask });
    expect(none.status).toBe(409);
    expect(none.json.error).toBe("needs_brand_os");

    const { o: o2, site: s2 } = await setup("art-ok@example.com");
    const prev = await h.call("POST", `/api/sites/${s2.id}/artifacts/preview`, { cookie: o2.cookie, body: ask });
    expect(prev.status).toBe(200);
    expect(prev.json.data.svg).toContain("<svg");
    expect(prev.json.data.brandOs.version).toBe(1);
    const made = await h.call("POST", `/api/sites/${s2.id}/artifacts`, { cookie: o2.cookie, body: ask });
    expect(made.status).toBe(201);
    expect(made.json.data.asset.brandVersion).toBe(1);
    const file = await fetch(`${h.base}/api/sites/${s2.id}/assets/${made.json.data.asset.id}/file`, { headers: { cookie: o2.cookie } });
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1080);
  });

  it("an approved artifact keeps its brand version after the brand changes", async () => {
    const { o, site, version } = await setup("art-hist@example.com");
    const first = await h.call("POST", `/api/sites/${site.id}/artifacts`, { cookie: o.cookie, body: ask });
    const svg1 = await (await fetch(`${h.base}/api/sites/${site.id}/assets/${first.json.data.asset.id}/file?as=svg`, { headers: { cookie: o.cookie } })).text();
    const edit = await h.call("POST", `/api/sites/${site.id}/edit`, { cookie: o.cookie, body: { baseVersionId: version, instruction: "make it more premium" } });
    expect(edit.status).toBe(201);
    const os = (await h.call("GET", `/api/sites/${site.id}/brand-os`, { cookie: o.cookie })).json.data;
    expect(os.current.version).toBe(2);
    const second = await h.call("POST", `/api/sites/${site.id}/artifacts`, { cookie: o.cookie, body: ask });
    expect(second.json.data.asset.brandVersion).toBe(2);
    const svg1again = await (await fetch(`${h.base}/api/sites/${site.id}/assets/${first.json.data.asset.id}/file?as=svg`, { headers: { cookie: o.cookie } })).text();
    expect(svg1again).toBe(svg1);
    const list = (await h.call("GET", `/api/sites/${site.id}/assets`, { cookie: o.cookie })).json.data;
    expect(list.find((a: { id: string }) => a.id === first.json.data.asset.id).brandVersion).toBe(1);
  });

  it("renders a coordinated bundle with one campaign id and format-specific composition", async () => {
    const { o, site } = await setup("art-bundle@example.com");
    const r = await h.call("POST", `/api/sites/${site.id}/artifacts/bundle`, { cookie: o.cookie, body: { ...ask, formats: ["social-square", "story", "banner", "flyer-a5"] } });
    expect(r.status).toBe(201);
    expect(r.json.data.results).toHaveLength(4);
    const dims = r.json.data.results.map((x: { asset: { width: number; height: number } }) => `${x.asset.width}x${x.asset.height}`);
    expect(dims).toEqual(["1080x1080", "1080x1920", "1500x500", "1540x2160"]);
    expect(new Set(r.json.data.results.map((x: { composition: string }) => x.composition)).size).toBeGreaterThan(1);
  });

  it("refuses unreviewed generated pictures, oversized text and other tenants", async () => {
    const { o, site } = await setup("art-gate@example.com");
    const mid = randomUUID();
    await h.sql`INSERT INTO generated_media (id, site_id, org_id, kind, subject, mime, bytes, width, height, provenance, review)
      VALUES (${mid}, ${site.id}, ${o.orgId}, 'image', 'cake', 'image/png', ${Buffer.from("x")}, 64, 64, ${h.sql.json({ provider: "test" })}, 'UNREVIEWED')`;
    const unreviewed = await h.call("POST", `/api/sites/${site.id}/artifacts`, { cookie: o.cookie, body: { ...ask, mediaId: mid } });
    expect(unreviewed.status).toBe(422);
    expect(unreviewed.json.error).toBe("media_not_approved");
    const long = await h.call("POST", `/api/sites/${site.id}/artifacts`, { cookie: o.cookie, body: { ...ask, headline: "x".repeat(200) } });
    expect(long.status).toBe(400);
    const unknownFormat = await h.call("POST", `/api/sites/${site.id}/artifacts`, { cookie: o.cookie, body: { ...ask, format: "billboard" } });
    expect(unknownFormat.status).toBe(400);
    const other = await h.signup("art-gate-other@example.com");
    for (const path of ["artifacts/preview", "artifacts"]) {
      const r = await h.call("POST", `/api/sites/${site.id}/${path}`, { cookie: other.cookie, body: ask });
      expect(r.status).toBeGreaterThanOrEqual(403);
    }
  });

  it("copy that Kora composed cannot contain figures the owner never supplied", async () => {
    const { o, site } = await setup("art-num@example.com");
    const r = await h.call("POST", `/api/sites/${site.id}/artifacts`, { cookie: o.cookie, body: { ...ask, headline: "Serving Lagos since 2009", ownerWritten: false } });
    expect(r.status).toBe(422);
    const own = await h.call("POST", `/api/sites/${site.id}/artifacts`, { cookie: o.cookie, body: { ...ask, headline: "Open until 9pm this week", ownerWritten: true } });
    expect(own.status).toBe(201);
  });
});
