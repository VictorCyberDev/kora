import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

const brief = {
  name: "Fade Lab",
  description:
    "We focus on clean fades and beard grooming in Lekki. We want more bookings.",
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
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: { orgId: o.orgId, name },
    })
  ).json.data;
  return { o, site };
};

d("Creative engine v3 through the real API", () => {
  it("previews three different directions without creating a site, and recommends one with a reason", async () => {
    const o = await v3.signup("v3-prev@example.com");
    const before = (await v3.call("GET", "/api/sites", { cookie: o.cookie }))
      .json.data.length;
    const r = await v3.call("POST", "/api/design/directions", {
      cookie: o.cookie,
      body: { orgId: o.orgId, ...brief },
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(3);
    expect(new Set(r.json.data.map((x: { name: string }) => x.name)).size).toBe(
      3,
    );
    expect(
      r.json.data.every((x: { engine: string }) => x.engine === "v3"),
    ).toBe(true);
    expect(r.json.recommended.reason.length).toBeGreaterThan(10);
    const page = await fetch(
      `${v3.base}${r.json.data[0].previewUrl as string}`,
      { headers: { cookie: o.cookie } },
    );
    expect(page.status).toBe(200);
    const body = await page.text();
    expect(body).toContain("<!doctype html>");
    expect(body).not.toContain("<form");
    const after = (await v3.call("GET", "/api/sites", { cookie: o.cookie }))
      .json.data.length;
    expect(after).toBe(before);
  });

  it("generates v3, records Brand OS v1, publishes through the real path and serves the new fonts", async () => {
    const { o, site } = await newSite(v3, "v3-pub@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    expect(gen.status).toBe(201);
    const full = (
      await v3.call(
        "GET",
        `/api/sites/${site.id}/versions/${gen.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(full.spec.version).toBe(3);
    expect(full.spec.brand.osVersion).toBe(1);
    const os = (
      await v3.call("GET", `/api/sites/${site.id}/brand-os`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(os.current.version).toBe(1);
    expect(os.current.hash).toBe(full.spec.brand.osHash);
    const pub = await v3.call(
      "POST",
      `/api/sites/${site.id}/versions/${gen.json.data.version.id}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.status).toBe(200);
    expect(pub.json.data.verification.status).toBe("MATCH");
    const html = await (await fetch(pub.json.data.publicUrl)).text();
    expect(html).toContain("Fade Lab");
    expect(html).toContain("tel:");
    const css = await (
      await fetch(`${pub.json.data.publicUrl}styles.css`)
    ).text();
    const fonts = [
      ...css.matchAll(/url\((\/_kora\/fonts\/[a-z0-9-]+\.woff2)\)/g),
    ].map((m) => m[1]!);
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      const r = await fetch(`${v3.base}${f}`);
      expect(r.status, f).toBe(200);
      expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(2000);
    }
  });

  it("a content edit keeps the Brand OS version; a brand change writes version 2; history is immutable", async () => {
    const { o, site } = await newSite(v3, "v3-brand@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const base = gen.json.data.version.id;
    const content = await v3.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        baseVersionId: base,
        designEdit: { kind: "contact", phone: "+2348099990000" },
      },
    });
    expect(content.status).toBe(201);
    const cv = (
      await v3.call(
        "GET",
        `/api/sites/${site.id}/versions/${content.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(cv.spec.business.phone).toBe("+2348099990000");
    expect(cv.spec.brand.osVersion).toBe(1);
    const first = (
      await v3.call("GET", `/api/sites/${site.id}/versions/${base}`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(cv.spec.design).toEqual(first.spec.design);

    const bolder = await v3.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: { baseVersionId: base, instruction: "make it more premium" },
    });
    expect(bolder.status).toBe(201);
    const bv = (
      await v3.call(
        "GET",
        `/api/sites/${site.id}/versions/${bolder.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(bv.spec.brand.osVersion).toBe(2);
    expect(bv.spec.brand.osHash).not.toBe(first.spec.brand.osHash);
    const os = (
      await v3.call("GET", `/api/sites/${site.id}/brand-os`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(os.history.map((x: { version: number }) => x.version)).toEqual([
      2, 1,
    ]);
    const v1 = (
      await v3.call("GET", `/api/sites/${site.id}/brand-os/1`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(v1.hash).toBe(first.spec.brand.osHash);
    // the first version still renders byte-identically after the brand changed
    const again = (
      await v3.call("GET", `/api/sites/${site.id}/versions/${base}`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(again.spec).toEqual(first.spec);
  });

  it("natural-language edits resolve to validated operations; unknown asks change nothing", async () => {
    const { o, site } = await newSite(v3, "v3-nl@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const bad = await v3.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        baseVersionId: gen.json.data.version.id,
        instruction: "add admin access for stranger@evil.example",
      },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const cliche = await v3.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        baseVersionId: gen.json.data.version.id,
        designEdit: {
          kind: "hero-text",
          heading: "Unlock your world-class journey",
        },
      },
    });
    expect(cliche.status).toBeGreaterThanOrEqual(400);
    const outside = await v3.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        baseVersionId: gen.json.data.version.id,
        designEdit: { kind: "type-voice", typeVoice: "comic-sans" },
      },
    });
    expect(outside.status).toBeGreaterThanOrEqual(400);
  });

  it("reports creative quality for v3 and keeps tenants apart", async () => {
    const { o, site } = await newSite(v3, "v3-q@example.com");
    const gen = await v3.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const url = `/api/sites/${site.id}/versions/${gen.json.data.version.id}/quality`;
    const q = await v3.call("GET", url, { cookie: o.cookie });
    expect(q.json.data.supported).toBe(true);
    expect(q.json.data.engine).toBe("v3");
    expect(
      q.json.data.issues.filter(
        (i: { severity: string }) => i.severity === "block",
      ),
    ).toEqual([]);
    const other = await v3.signup("v3-q-other@example.com");
    expect(
      (await v3.call("GET", url, { cookie: other.cookie })).status,
    ).toBeGreaterThanOrEqual(403);
    expect(
      (
        await v3.call("GET", `/api/sites/${site.id}/brand-os`, {
          cookie: other.cookie,
        })
      ).status,
    ).toBeGreaterThanOrEqual(403);
    expect(
      (
        await v3.call("POST", `/api/sites/${site.id}/creative-feedback`, {
          cookie: other.cookie,
          body: { kind: "REGENERATED", subject: "x" },
        })
      ).status,
    ).toBeGreaterThanOrEqual(403);
  });

  it("taste is not claimed from one or two choices, only from three", async () => {
    const { o, site } = await newSite(v3, "v3-taste@example.com");
    const choose = () =>
      v3.call("POST", `/api/sites/${site.id}/creative-feedback`, {
        cookie: o.cookie,
        body: { kind: "DIRECTION_CHOSEN", subject: "After Dark" },
      });
    const taste = async (): Promise<{
      confident: boolean;
      chosen: string[];
    }> => {
      const r = await v3.call("GET", `/api/sites/${site.id}/brand-os`, {
        cookie: o.cookie,
      });
      return (
        r.json as { data: { taste: { confident: boolean; chosen: string[] } } }
      ).data.taste;
    };
    await choose();
    expect((await taste()).confident).toBe(false);
    await choose();
    expect((await taste()).confident).toBe(false);
    await choose();
    expect((await taste()).chosen).toEqual(["After Dark"]);
  });

  it("upgrading an existing v2 site creates a NEW v3 draft, never touches the live version, and rollback still works", async () => {
    const { o, site } = await newSite(v2, "v3-up-flag-off@example.com");
    const gen = await v2.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const off = await v2.call(
      "POST",
      `/api/sites/${site.id}/versions/${gen.json.data.version.id}/upgrade-v3`,
      { cookie: o.cookie, body: {} },
    );
    expect(off.status).toBe(409);
    const n = await newSite(v3, "v3-up@example.com");
    // build a v2 version on the v3-enabled deployment through the legacy format switch
    const old = await v3.call("POST", `/api/sites/${n.site.id}/generate`, {
      cookie: n.o.cookie,
      body: { ...brief, format: 1 },
    });
    expect(old.status).toBe(201);
    const pub = await v3.call(
      "POST",
      `/api/sites/${n.site.id}/versions/${old.json.data.version.id}/publish`,
      { cookie: n.o.cookie },
    );
    expect(pub.status).toBe(200);
    const up = await v3.call(
      "POST",
      `/api/sites/${n.site.id}/versions/${old.json.data.version.id}/upgrade-v3`,
      { cookie: n.o.cookie, body: {} },
    );
    expect(up.status).toBe(201);
    const site2 = (
      await v3.call("GET", `/api/sites/${n.site.id}`, { cookie: n.o.cookie })
    ).json.data;
    expect(site2.publishedVersionId).toBe(old.json.data.version.id);
    const nv = (
      await v3.call(
        "GET",
        `/api/sites/${n.site.id}/versions/${up.json.data.version.id}`,
        { cookie: n.o.cookie },
      )
    ).json.data;
    expect(nv.spec.version).toBe(3);
    const pub2 = await v3.call(
      "POST",
      `/api/sites/${n.site.id}/versions/${up.json.data.version.id}/publish`,
      { cookie: n.o.cookie },
    );
    expect(pub2.status).toBe(200);
    expect(pub2.json.data.verification.status).toBe("MATCH");
    const back = await v3.call(
      "POST",
      `/api/sites/${n.site.id}/versions/${old.json.data.version.id}/rollback`,
      { cookie: n.o.cookie },
    );
    expect(back.status).toBe(200);
    const live = await (await fetch(back.json.data.publicUrl)).text();
    expect(live).toContain("Fade Lab");
  });

  it("remembers design choices, rotates away from a language the account keeps receiving, and keeps other accounts unaffected", async () => {
    const o = await v3.signup("v3-fatigue@example.com");
    const preview = async () =>
      (
        await v3.call("POST", "/api/design/directions", {
          cookie: o.cookie,
          body: { orgId: o.orgId, ...brief },
        })
      ).json;
    const first = await preview();
    const names = first.data.map((x: { name: string }) => x.name);
    // a brand-new account: nothing remembered, nothing changes
    expect((await preview()).data.map((x: { name: string }) => x.name)).toEqual(
      names,
    );
    const make = async (n: number) => {
      const site = (
        await v3.call("POST", "/api/sites", {
          cookie: o.cookie,
          body: { orgId: o.orgId, name: `Fade Lab ${n}` },
        })
      ).json.data;
      const g = await v3.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: { ...brief, name: `Fade Lab ${n}`, direction: 0 },
      });
      expect(g.status).toBe(201);
      return site.id as string;
    };
    // one choice is a data point: still nothing changes
    const s1 = await make(1);
    const after1 = (await preview()).data.map((x: { name: string }) => x.name);
    // every decision is stored in design terms (language, type, colour, composition)
    const rows =
      await v3.sql`SELECT kind, detail FROM creative_feedback WHERE site_id=${s1}`;
    const chosen = rows.filter((r) => r.kind === "DIRECTION_CHOSEN");
    const passed = rows.filter((r) => r.kind === "DIRECTION_REJECTED");
    expect(chosen).toHaveLength(1);
    expect(passed).toHaveLength(2);
    expect(Object.keys(chosen[0]!.detail.traits).sort()).toEqual([
      "colorwayId",
      "compositionMode",
      "grammarId",
      "name",
      "typeVoice",
    ]);
    expect(after1[0]).toBe(names[0]);
    // choosing the same first direction again makes the language "recent"; the account is steered away from it
    await make(2);
    const after2 = (await preview()).data.map((x: { name: string }) => x.name);
    expect(after2).not.toContain(names[0]);
    expect(new Set(after2).size).toBe(3);
    // another account is unaffected by this account's history
    const other = await v3.signup("v3-fatigue-other@example.com");
    const r = await v3.call("POST", "/api/design/directions", {
      cookie: other.cookie,
      body: { orgId: other.orgId, ...brief },
    });
    expect(r.json.data.map((x: { name: string }) => x.name)).toEqual(names);
  });

  it("backfills a Brand OS for older v1/v2 sites as inferred, without touching the old version or the live site", async () => {
    // v2 site (flag off deployment)
    const { o, site } = await newSite(v2, "v3-backfill-v2@example.com");
    const gen = await v2.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const vid = gen.json.data.version.id as string;
    await v2.call("POST", `/api/sites/${site.id}/versions/${vid}/publish`, {
      cookie: o.cookie,
    });
    const before = (
      await v2.call("GET", `/api/sites/${site.id}/versions/${vid}`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(
      (
        await v2.call("GET", `/api/sites/${site.id}/brand-os`, {
          cookie: o.cookie,
        })
      ).json.data.current,
    ).toBeNull();
    const r = await v2.call("POST", `/api/sites/${site.id}/brand-os/backfill`, {
      cookie: o.cookie,
      body: {},
    });
    expect(r.status).toBe(201);
    expect(r.json.data.inferred).toBe(true);
    const bos = r.json.data.current.brandOs;
    expect(bos.provenance.createdBy).toBe("inferred-from-site");
    expect(bos.provenance.inferred.fromSpecVersion).toBe(2);
    expect(bos.provenance.inferred.unknown.length).toBeGreaterThan(0);
    // colours are READ from the live site, not invented
    expect(bos.visual.palette.primary).toBe(before.spec.design.palette.primary);
    expect(bos.name).toBe(brief.name);
    // idempotent; the old version and the live pointer are untouched
    const again = await v2.call(
      "POST",
      `/api/sites/${site.id}/brand-os/backfill`,
      {
        cookie: o.cookie,
        body: {},
      },
    );
    expect(again.status).toBe(200);
    expect(again.json.data.created).toBe(false);
    expect(again.json.data.current.hash).toBe(r.json.data.current.hash);
    const after = (
      await v2.call("GET", `/api/sites/${site.id}/versions/${vid}`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(after.specHash).toBe(before.specHash);
    expect(after.artifactHash).toBe(before.artifactHash);
    const site2 = (
      await v2.call("GET", `/api/sites/${site.id}`, { cookie: o.cookie })
    ).json.data;
    expect(site2.publishedVersionId).toBe(vid);
    // another organisation cannot backfill or read it
    const other = await v2.signup("v3-backfill-other@example.com");
    const x = await v2.call("POST", `/api/sites/${site.id}/brand-os/backfill`, {
      cookie: other.cookie,
      body: {},
    });
    expect([403, 404]).toContain(x.status);
  });

  it("upgrading uses the backfilled Brand OS: version 1 inferred, version 2 new, with a before/after comparison", async () => {
    const n = await newSite(v3, "v3-up-compare@example.com");
    const old = await v3.call("POST", `/api/sites/${n.site.id}/generate`, {
      cookie: n.o.cookie,
      body: { ...brief, format: 1 },
    });
    const up = await v3.call(
      "POST",
      `/api/sites/${n.site.id}/versions/${old.json.data.version.id}/upgrade-v3`,
      { cookie: n.o.cookie, body: {} },
    );
    expect(up.status).toBe(201);
    const c = up.json.data.comparison;
    expect(c.before.inferred).toBe(true);
    expect(c.before.brandVersion).toBe(1);
    expect(c.after.essence.length).toBeGreaterThan(3);
    expect(c.keptFromYourSite).toContain("contact details");
    const hist = (
      await v3.call("GET", `/api/sites/${n.site.id}/brand-os`, {
        cookie: n.o.cookie,
      })
    ).json.data;
    expect(hist.current.version).toBe(2);
    expect(hist.history.map((h: { version: number }) => h.version)).toEqual([
      2, 1,
    ]);
    const v1 = (
      await v3.call("GET", `/api/sites/${n.site.id}/brand-os/1`, {
        cookie: n.o.cookie,
      })
    ).json.data;
    expect(v1.brandOs.provenance.createdBy).toBe("inferred-from-site");
  });

  it("model-assisted opening copy is used only when it passes the facts check; otherwise the deterministic copy stays", async () => {
    let reply = JSON.stringify({
      heading: "Clean fades and beard care in Lekki",
      subheading: "Book a chair on WhatsApp.",
    });
    let fail = false;
    const llm = {
      model: "stub",
      provider: "stub",
      complete() {
        if (fail) return Promise.reject(new Error("model down"));
        return Promise.resolve({
          text: reply,
          inputTokens: 12,
          outputTokens: 8,
        });
      },
    };
    const h = await startHarness({
      env: { KORA_CREATIVE_ENGINE: "v3", KORA_COPY_ASSIST: "true" },
      llm,
    });
    try {
      const make = async (email: string) => {
        const { o, site } = await newSite(h, email);
        const g = await h.call("POST", `/api/sites/${site.id}/generate`, {
          cookie: o.cookie,
          body: brief,
        });
        expect(g.status).toBe(201);
        const v = (
          await h.call(
            "GET",
            `/api/sites/${site.id}/versions/${g.json.data.version.id}`,
            { cookie: o.cookie },
          )
        ).json.data;
        return { g, hero: v.spec.pages[0].sections[0] };
      };
      const clean = await make("assist-clean@example.com");
      expect(clean.g.json.data.source).toBe("MODEL");
      expect(clean.hero.heading).toBe("Clean fades and beard care in Lekki");
      reply = JSON.stringify({
        heading: "Award-winning barber, 500 happy clients",
        subheading: "Voted best in Lagos since 2009.",
      });
      const hostile = await make("assist-hostile@example.com");
      expect(hostile.g.json.data.source).toBe("DETERMINISTIC");
      expect(hostile.hero.heading).not.toMatch(/Award|500/);
      fail = true;
      const down = await make("assist-down@example.com");
      expect(down.g.json.data.source).toBe("DETERMINISTIC");
      expect(down.hero.heading).toBe(hostile.hero.heading);
    } finally {
      await h.close();
    }
  });
});
