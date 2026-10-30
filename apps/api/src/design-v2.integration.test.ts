import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LlmClient } from "@kora/reasoner";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

const brief = {
  name: "Nkem Interiors",
  description:
    "We design homes and small offices in Lagos. We provide space planning, furnishing, lighting and styling.",
  location: "Lekki, Lagos",
  email: "hello@nkeminteriors.example",
};

const stub: LlmClient = {
  model: "stub-design-1",
  provider: "stub-provider",
  complete() {
    return Promise.resolve({
      text: JSON.stringify({
        understanding: {
          industry: "Interior design",
          audience: "Homeowners",
          offering: "Space planning",
          tone: "calm",
        },
        strategy: {
          positioning: "Considered homes",
          keyMessage: "Rooms that fit how you live",
        },
        architecture: {
          lookId: "luxe-centered",
          rationale: "Quiet and centred",
        },
        design: {
          paletteStrategy: "royal-ivory",
          personality: ["elegant"],
          rationale: "Ivory and indigo",
        },
        content: {
          heroHeading: "Homes and offices planned around how you live",
        },
        media: { art: "arch" },
      }),
      inputTokens: 120,
      outputTokens: 80,
      model: "stub-design-1",
      provider: "stub-provider",
    });
  },
};

let h: Harness;
let hAi: Harness;
beforeAll(async () => {
  if (enabled) {
    h = await startHarness();
    hAi = await startHarness({ llm: stub });
  }
});
afterAll(async () => {
  if (enabled) {
    await h.close();
    await hAi.close();
  }
});

const newSite = async (harness: Harness, email: string) => {
  const o = await harness.signup(email);
  const site = (
    await harness.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: { orgId: o.orgId, name: brief.name },
    })
  ).json.data;
  return { o, site };
};

d("SiteSpec v2 through the real API", () => {
  it("generates a v2 design with no AI, publishes it, serves bundled fonts and verifies the bytes", async () => {
    const { o, site } = await newSite(h, "v2-pub@example.com");
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    expect(gen.status).toBe(201);
    expect(gen.json.data.source).toBe("DETERMINISTIC");
    const version = gen.json.data.version;
    const full = (
      await h.call("GET", `/api/sites/${site.id}/versions/${version.id}`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(full.spec.version).toBe(2);
    expect(full.files).toEqual(
      expect.arrayContaining(["index.html", "styles.css", "favicon.svg"]),
    );
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${version.id}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.status).toBe(200);
    expect(pub.json.data.verification.status).toBe("MATCH");
    const live = await fetch(pub.json.data.publicUrl);
    const html = await live.text();
    expect(live.status).toBe(200);
    expect(html).toContain("Nkem Interiors");
    expect(html).toContain("font-src &#39;self&#39;");
    const css = await (
      await fetch(`${pub.json.data.publicUrl}styles.css`)
    ).text();
    const fontUrl = /url\((\/_kora\/fonts\/[a-z0-9-]+\.woff2)\)/.exec(css)![1]!;
    const font = await fetch(`${h.base}${fontUrl}`);
    expect(font.status).toBe(200);
    expect(font.headers.get("content-type")).toBe("font/woff2");
    expect(font.headers.get("cache-control")).toContain("immutable");
    expect((await font.arrayBuffer()).byteLength).toBeGreaterThan(2000);
    for (const bad of [
      "/_kora/fonts/../../package.json",
      "/_kora/fonts/evil.woff2",
      "/_kora/fonts/inter-latin-400-normal.woff",
      "/_kora/fonts/%2e%2e%2fpackage.json",
    ])
      expect((await fetch(`${h.base}${bad}`)).status).toBe(404);
  });

  it("offers three genuinely different directions without saving anything", async () => {
    const { o, site } = await newSite(h, "v2-dir@example.com");
    const r = await h.call("POST", `/api/sites/${site.id}/design/directions`, {
      cookie: o.cookie,
      body: brief,
    });
    expect(r.status).toBe(200);
    const dirs = r.json.data as Array<{
      index: number;
      look: string;
      palette: string;
      previewUrl: string;
      swatches: string[];
    }>;
    expect(dirs).toHaveLength(3);
    expect(new Set(dirs.map((x) => x.look)).size).toBe(3);
    expect(new Set(dirs.map((x) => x.palette)).size).toBe(3);
    for (const x of dirs) {
      const page = await h.call("GET", x.previewUrl, { cookie: o.cookie });
      expect(page.status).toBe(200);
      const css = await h.call("GET", `${x.previewUrl}styles.css`, {
        cookie: o.cookie,
      });
      expect(css.status).toBe(200);
      const stranger = await h.signup(`stranger-${x.index}@example.com`);
      expect(
        (await h.call("GET", x.previewUrl, { cookie: stranger.cookie })).status,
      ).toBe(404);
    }
    const versions = (
      await h.call("GET", `/api/sites/${site.id}/versions`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(versions).toHaveLength(0);
    const pick = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: { ...brief, direction: 2 },
    });
    expect(pick.json.data.version).toBeTruthy();
  });

  it("edits with friendly visual controls and rejects invalid ones with a plain message", async () => {
    const { o, site } = await newSite(h, "v2-edit@example.com");
    const v1 = (
      await h.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: brief,
      })
    ).json.data.version;
    const edit = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        baseVersionId: v1.id,
        designEdit: { kind: "font", pairing: "geometric" },
      },
    });
    expect(edit.status).toBe(201);
    expect(edit.json.data.version.parentVersionId).toBe(v1.id);
    const bad = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: { designEdit: { kind: "nav", value: "marquee" } },
    });
    expect(bad.status).toBe(422);
    expect(bad.json.error).toBe("edit_not_applied");
    const colour = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: { instruction: "Make the primary colour teal" },
    });
    expect(colour.status).toBe(201);
    const premium = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: { instruction: "make it feel more premium" },
    });
    expect(premium.status).toBe(422);
  });

  it("uses the AI only to choose among registered designs, labels the provider and counts tokens", async () => {
    const { o, site } = await newSite(hAi, "v2-ai@example.com");
    const gen = await hAi.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    expect(gen.status).toBe(201);
    expect(gen.json.data.source).toBe("MODEL");
    expect(gen.json.data.provider).toBe("stub-provider");
    expect(gen.json.data.rationale.layout).toBe("Quiet and centred");
    const v = (
      await hAi.call(
        "GET",
        `/api/sites/${site.id}/versions/${gen.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(v.spec.design.paletteStrategy).toBe("royal-ivory");
    expect(v.spec.meta.generator).toBe("model");
  });

  it("v1 → upgrade → publish v2 → roll back to v1 → v2 again; every step verifies", async () => {
    const { o, site } = await newSite(h, "v2-compat@example.com");
    const v1 = (
      await h.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: { ...brief, format: 1 },
      })
    ).json.data.version;
    const p1 = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${v1.id}/publish`,
      { cookie: o.cookie },
    );
    expect(p1.json.data.verification.status).toBe("MATCH");
    const before = await (await fetch(p1.json.data.publicUrl)).text();

    const up = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${v1.id}/upgrade`,
      { cookie: o.cookie, body: {} },
    );
    expect(up.status).toBe(201);
    const v2 = up.json.data.version;
    expect(v2.parentVersionId).toBe(v1.id);
    // an upgrade is a draft: the live site is still v1
    expect(await (await fetch(p1.json.data.publicUrl)).text()).toBe(before);
    expect(
      (
        await h.call(
          "POST",
          `/api/sites/${site.id}/versions/${v2.id}/upgrade`,
          { cookie: o.cookie, body: {} },
        )
      ).status,
    ).toBe(409);

    const p2 = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${v2.id}/publish`,
      { cookie: o.cookie },
    );
    expect(p2.json.data.verification.status).toBe("MATCH");
    expect(await (await fetch(p2.json.data.publicUrl)).text()).toContain(
      "font-src",
    );
    expect(await (await fetch(p2.json.data.publicUrl)).text()).not.toBe(before);

    const back = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${v1.id}/rollback`,
      { cookie: o.cookie },
    );
    expect(back.status).toBe(200);
    expect(back.json.data.verification.status).toBe("MATCH");
    expect(await (await fetch(back.json.data.publicUrl)).text()).toBe(before);

    const again = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${v2.id}/publish`,
      { cookie: o.cookie },
    );
    expect(again.json.data.verification.status).toBe("MATCH");
    // immutable history: v1's stored artifact is unchanged by any of this
    const stored = (
      await h.call("GET", `/api/sites/${site.id}/versions/${v1.id}`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(stored.spec.version).toBe(1);
  });
});
