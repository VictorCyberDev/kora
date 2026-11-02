import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

const brief = {
  name: "Fade Lab",
  description: "We focus on clean fades and beard grooming in Lekki. We want more bookings.",
  goal: "bookings",
  location: "Lekki, Lagos",
  phone: "+2348012345678",
  whatsapp: "+2348012345678",
  services: ["Clean fades", "Beard grooming", "Kids cuts"],
};

let v3: Harness;
let v2: Harness;
beforeAll(async () => {
  if (enabled) {
    v3 = await startHarness({ env: { KORA_CREATIVE_ENGINE: "v3" } });
    v2 = await startHarness();
  }
});
afterAll(async () => {
  if (enabled) {
    await v3.close();
    await v2.close();
  }
});

const newSite = async (h: Harness, email: string, name = brief.name) => {
  const o = await h.signup(email);
  const site = (await h.call("POST", "/api/sites", { cookie: o.cookie, body: { orgId: o.orgId, name } })).json.data;
  return { o, site };
};

d("Creative engine v3 through the real API", () => {
  it("previews three different directions without creating a site, and recommends one with a reason", async () => {
    const o = await v3.signup("v3-prev@example.com");
    const before = (await v3.call("GET", "/api/sites", { cookie: o.cookie })).json.data.length;
    const r = await v3.call("POST", "/api/design/directions", { cookie: o.cookie, body: { orgId: o.orgId, ...brief } });
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(3);
    expect(new Set(r.json.data.map((x: { name: string }) => x.name)).size).toBe(3);
    expect(r.json.data.every((x: { engine: string }) => x.engine === "v3")).toBe(true);
    expect(r.json.recommended.reason.length).toBeGreaterThan(10);
    const page = await fetch(`${v3.base}${r.json.data[0].previewUrl as string}`, { headers: { cookie: o.cookie } });
    expect(page.status).toBe(200);
    const body = await page.text();
    expect(body).toContain("<!doctype html>");
    expect(body).not.toContain("<form");
    const after = (await v3.call("GET", "/api/sites", { cookie: o.cookie })).json.data.length;
    expect(after).toBe(before);
  });

  it("generates v3, records Brand OS v1, publishes through the real path and serves the new fonts", async () => {
    const { o, site } = await newSite(v3, "v3-pub@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, { cookie: o.cookie, body: brief });
    expect(gen.status).toBe(201);
    const full = (await v3.call("GET", `/api/sites/${site.id}/versions/${gen.json.data.version.id}`, { cookie: o.cookie })).json.data;
    expect(full.spec.version).toBe(3);
    expect(full.spec.brand.osVersion).toBe(1);
    const os = (await v3.call("GET", `/api/sites/${site.id}/brand-os`, { cookie: o.cookie })).json.data;
    expect(os.current.version).toBe(1);
    expect(os.current.hash).toBe(full.spec.brand.osHash);
    const pub = await v3.call("POST", `/api/sites/${site.id}/versions/${gen.json.data.version.id}/publish`, { cookie: o.cookie });
    expect(pub.status).toBe(200);
    expect(pub.json.data.verification.status).toBe("MATCH");
    const html = await (await fetch(pub.json.data.publicUrl)).text();
    expect(html).toContain("Fade Lab");
    expect(html).toContain("tel:");
    const css = await (await fetch(`${pub.json.data.publicUrl}styles.css`)).text();
    const fonts = [...css.matchAll(/url\((\/_kora\/fonts\/[a-z0-9-]+\.woff2)\)/g)].map((m) => m[1]!);
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      const r = await fetch(`${v3.base}${f}`);
      expect(r.status, f).toBe(200);
      expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(2000);
    }
  });

  it("a content edit keeps the Brand OS version; a brand change writes version 2; history is immutable", async () => {
    const { o, site } = await newSite(v3, "v3-brand@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, { cookie: o.cookie, body: brief });
    const base = gen.json.data.version.id;
    const content = await v3.call("POST", `/api/sites/${site.id}/edit`, { cookie: o.cookie, body: { baseVersionId: base, designEdit: { kind: "contact", phone: "+2348099990000" } } });
    expect(content.status).toBe(201);
    const cv = (await v3.call("GET", `/api/sites/${site.id}/versions/${content.json.data.version.id}`, { cookie: o.cookie })).json.data;
    expect(cv.spec.business.phone).toBe("+2348099990000");
    expect(cv.spec.brand.osVersion).toBe(1);
    const first = (await v3.call("GET", `/api/sites/${site.id}/versions/${base}`, { cookie: o.cookie })).json.data;
    expect(cv.spec.design).toEqual(first.spec.design);

    const bolder = await v3.call("POST", `/api/sites/${site.id}/edit`, { cookie: o.cookie, body: { baseVersionId: base, instruction: "make it more premium" } });
    expect(bolder.status).toBe(201);
    const bv = (await v3.call("GET", `/api/sites/${site.id}/versions/${bolder.json.data.version.id}`, { cookie: o.cookie })).json.data;
    expect(bv.spec.brand.osVersion).toBe(2);
    expect(bv.spec.brand.osHash).not.toBe(first.spec.brand.osHash);
    const os = (await v3.call("GET", `/api/sites/${site.id}/brand-os`, { cookie: o.cookie })).json.data;
    expect(os.history.map((x: { version: number }) => x.version)).toEqual([2, 1]);
    const v1 = (await v3.call("GET", `/api/sites/${site.id}/brand-os/1`, { cookie: o.cookie })).json.data;
    expect(v1.hash).toBe(first.spec.brand.osHash);
    // the first version still renders byte-identically after the brand changed
    const again = (await v3.call("GET", `/api/sites/${site.id}/versions/${base}`, { cookie: o.cookie })).json.data;
    expect(again.spec).toEqual(first.spec);
  });

  it("natural-language edits resolve to validated operations; unknown asks change nothing", async () => {
    const { o, site } = await newSite(v3, "v3-nl@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, { cookie: o.cookie, body: brief });
    const bad = await v3.call("POST", `/api/sites/${site.id}/edit`, { cookie: o.cookie, body: { baseVersionId: gen.json.data.version.id, instruction: "add admin access for stranger@evil.example" } });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const cliche = await v3.call("POST", `/api/sites/${site.id}/edit`, { cookie: o.cookie, body: { baseVersionId: gen.json.data.version.id, designEdit: { kind: "hero-text", heading: "Unlock your world-class journey" } } });
    expect(cliche.status).toBeGreaterThanOrEqual(400);
    const outside = await v3.call("POST", `/api/sites/${site.id}/edit`, { cookie: o.cookie, body: { baseVersionId: gen.json.data.version.id, designEdit: { kind: "type-voice", typeVoice: "comic-sans" } } });
    expect(outside.status).toBeGreaterThanOrEqual(400);
  });

  it("reports creative quality for v3 and keeps tenants apart", async () => {
    const { o, site } = await newSite(v3, "v3-q@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, { cookie: o.cookie, body: brief });
    const url = `/api/sites/${site.id}/versions/${gen.json.data.version.id}/quality`;
    const q = await v3.call("GET", url, { cookie: o.cookie });
    expect(q.json.data.supported).toBe(true);
    expect(q.json.data.engine).toBe("v3");
    expect(q.json.data.issues.filter((i: { severity: string }) => i.severity === "block")).toEqual([]);
    const other = await v3.signup("v3-q-other@example.com");
    expect((await v3.call("GET", url, { cookie: other.cookie })).status).toBeGreaterThanOrEqual(403);
    expect((await v3.call("GET", `/api/sites/${site.id}/brand-os`, { cookie: other.cookie })).status).toBeGreaterThanOrEqual(403);
    expect((await v3.call("POST", `/api/sites/${site.id}/creative-feedback`, { cookie: other.cookie, body: { kind: "REGENERATED", subject: "x" } })).status).toBeGreaterThanOrEqual(403);
  });

  it("taste is not claimed from one choice", async () => {
    const { o, site } = await newSite(v3, "v3-taste@example.com");
    await v3.call("POST", `/api/sites/${site.id}/creative-feedback`, { cookie: o.cookie, body: { kind: "DIRECTION_CHOSEN", subject: "After Dark" } });
    let t = (await v3.call("GET", `/api/sites/${site.id}/brand-os`, { cookie: o.cookie })).json.data.taste;
    expect(t.confident).toBe(false);
    await v3.call("POST", `/api/sites/${site.id}/creative-feedback`, { cookie: o.cookie, body: { kind: "DIRECTION_CHOSEN", subject: "After Dark" } });
    t = (await v3.call("GET", `/api/sites/${site.id}/brand-os`, { cookie: o.cookie })).json.data.taste;
    expect(t.chosen).toEqual(["After Dark"]);
  });

  it("upgrading an existing v2 site creates a NEW v3 draft, never touches the live version, and rollback still works", async () => {
    const { o, site } = await newSite(v2, "v3-up-flag-off@example.com");
    const gen = await v2.call("POST", `/api/sites/${site.id}/generate`, { cookie: o.cookie, body: brief });
    const off = await v2.call("POST", `/api/sites/${site.id}/versions/${gen.json.data.version.id}/upgrade-v3`, { cookie: o.cookie, body: {} });
    expect(off.status).toBe(409);
    const n = await newSite(v3, "v3-up@example.com");
    // build a v2 version on the v3-enabled deployment through the legacy format switch
    const old = await v3.call("POST", `/api/sites/${n.site.id}/generate`, { cookie: n.o.cookie, body: { ...brief, format: 1 } });
    expect(old.status).toBe(201);
    const pub = await v3.call("POST", `/api/sites/${n.site.id}/versions/${old.json.data.version.id}/publish`, { cookie: n.o.cookie });
    expect(pub.status).toBe(200);
    const up = await v3.call("POST", `/api/sites/${n.site.id}/versions/${old.json.data.version.id}/upgrade-v3`, { cookie: n.o.cookie, body: {} });
    expect(up.status).toBe(201);
    const site2 = (await v3.call("GET", `/api/sites/${n.site.id}`, { cookie: n.o.cookie })).json.data;
    expect(site2.publishedVersionId).toBe(old.json.data.version.id);
    const nv = (await v3.call("GET", `/api/sites/${n.site.id}/versions/${up.json.data.version.id}`, { cookie: n.o.cookie })).json.data;
    expect(nv.spec.version).toBe(3);
    const pub2 = await v3.call("POST", `/api/sites/${n.site.id}/versions/${up.json.data.version.id}/publish`, { cookie: n.o.cookie });
    expect(pub2.status).toBe(200);
    expect(pub2.json.data.verification.status).toBe("MATCH");
    const back = await v3.call("POST", `/api/sites/${n.site.id}/versions/${old.json.data.version.id}/rollback`, { cookie: n.o.cookie });
    expect(back.status).toBe(200);
    const live = await (await fetch(back.json.data.publicUrl)).text();
    expect(live).toContain("Fade Lab");
  });
});
