import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyStructuredEditV3,
  completenessV3,
  criticV3,
  EditV3Error,
  fitText,
  MAX_SITE_PAGES,
  MIN_SITE_PAGES,
  parseSiteSpecV3,
  planDirectionsV3,
  renderSiteV3,
  repairCompleteness,
  textAt,
  type SiteSpecV3,
} from "../src/index.js";
import { lintArtifact } from "../src/index.js";

interface Case {
  key: string;
  name: string;
  description: string;
}
const matrix = JSON.parse(
  readFileSync(
    new URL(
      "../../creative/test/fixtures/business-matrix.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Case[];
const brief = (c: Case) => ({ name: c.name, description: c.description });
const get = (key: string) => matrix.find((m) => m.key === key)!;
const ctx = { formEndpoint: "https://kora.example/api/public/sites/s1/forms" };

describe("acceptance matrix: every business, every direction", () => {
  for (const c of matrix) {
    const { directions } = planDirectionsV3(brief(c));
    it(`${c.key}: three directions, ${MIN_SITE_PAGES}-${MAX_SITE_PAGES} complete pages, nothing blocking`, () => {
      expect(directions).toHaveLength(3);
      for (const d of directions) {
        const n = d.spec.pages.length;
        expect(n, `${c.key}/${d.name}`).toBeGreaterThanOrEqual(MIN_SITE_PAGES);
        expect(n).toBeLessThanOrEqual(MAX_SITE_PAGES);
        expect(d.spec.pages[0]!.slug).toBe("home");
        const blocking = completenessV3(d.spec, {
          brief: brief(c),
          generation: true,
        }).filter((i) => i.severity === "block");
        expect(blocking, `${c.key}/${d.name}`).toEqual([]);
        expect(criticV3(d.spec).filter((i) => i.severity === "block")).toEqual(
          [],
        );
        expect(lintArtifact(renderSiteV3(d.spec, ctx))).toEqual([]);
      }
    });
  }
});

describe("Kochab Studio regression (was a single page of hero + contact)", () => {
  const k = get("kochab");
  const { directions } = planDirectionsV3(brief(k));
  it("is a creative technology studio with five or more complete pages in every direction", () => {
    for (const d of directions) {
      expect(d.spec.pages.length).toBeGreaterThanOrEqual(5);
      expect(d.spec.pages.map((p) => p.slug)).toEqual(
        expect.arrayContaining([
          "home",
          "services",
          "approach",
          "about",
          "contact",
        ]),
      );
      expect(d.spec.business.description).not.toMatch(/…/);
    }
  });
  it("names the owner's real services and never presents the business as SaaS", () => {
    const d = directions[0]!;
    const all = textAt(d.spec)
      .map((t) => t.text)
      .join(" ")
      .toLowerCase();
    for (const w of ["website", "brand", "software", "motion", "automation"])
      expect(all).toContain(w);
    expect(all).not.toMatch(/saas|subscription|what it does/);
  });
  it("has working navigation to every page and a working enquiry form", () => {
    const files = renderSiteV3(directions[0]!.spec, ctx);
    const home = files["index.html"]!;
    for (const p of directions[0]!.spec.pages.filter((x) => x.slug !== "home"))
      expect(home).toContain(`${p.slug}/index.html`);
    expect(files["contact/index.html"]).toMatch(/<form/);
    expect(files["contact/index.html"]).toContain(
      "kora.example/api/public/sites/s1/forms",
    );
  });
  it("keeps navigation labels whole even for a one-sentence description", () => {
    const short = planDirectionsV3({
      name: "Kochab Studio",
      description:
        "Kochab Studio is a creative technology agency helping startups build websites.",
    }).directions[0]!;
    for (const p of short.spec.pages)
      expect(p.nav ?? "", p.slug).not.toMatch(/…/);
    expect(renderSiteV3(short.spec, ctx)["index.html"]).not.toMatch(/…</);
  });
  it("never cuts copy with an ellipsis", () => {
    for (const d of directions)
      for (const t of textAt(d.spec))
        expect(t.text, t.at).not.toMatch(/(…|\.\.\.)\s*$/);
  });
});

describe("bakery acceptance case", () => {
  const { directions } = planDirectionsV3(brief(get("bakery")));
  it("has the six preferred pages", () => {
    for (const d of directions)
      expect(d.spec.pages.map((p) => p.slug)).toEqual([
        "home",
        "cakes",
        "small-chops",
        "gallery",
        "about",
        "contact",
      ]);
  });
  it("invents no price, delivery promise, inventory, location or review", () => {
    for (const d of directions) {
      const all = textAt(d.spec)
        .map((t) => t.text)
        .join(" ");
      expect(all).not.toMatch(
        /[₦$£€]|\bprice|\bfrom \d|\bfree delivery|we deliver|\bin stock|\breview|\bawarded|\d+ years/i,
      );
      expect(d.spec.business.location).toBeUndefined();
      expect(d.spec.business.hours).toEqual([]);
      expect(JSON.stringify(d.spec)).not.toContain('"type":"proof"');
    }
  });
  it("shows a photo only on a page it honestly depicts: no cake pictures on the small-chops page", () => {
    for (const d of directions) {
      const sc = d.spec.pages.find((p) => p.slug === "small-chops")!;
      expect(JSON.stringify(sc)).not.toMatch(/\/_kora\/media\//);
    }
  });
  it("labels stock photography as illustrative", () => {
    expect(
      JSON.stringify(
        directions[0]!.spec.pages.find((p) => p.slug === "gallery"),
      ),
    ).toContain("Illustrative photography");
  });
});

describe("ambiguous business", () => {
  it("does not invent an industry and stays honest", () => {
    const { directions } = planDirectionsV3(brief(get("ambiguous")));
    for (const d of directions) {
      expect(d.spec.pages.length).toBeGreaterThanOrEqual(MIN_SITE_PAGES);
      const all = textAt(d.spec)
        .map((t) => t.text)
        .join(" ")
        .toLowerCase();
      expect(all).not.toMatch(
        /bak|cake|restaurant|plumb|salon|software|clinic/,
      );
    }
  });
});

describe("sparse input and degraded modes", () => {
  it("a one-word description still yields a complete site", () => {
    const { directions } = planDirectionsV3({
      name: "Daily Loaf",
      description: "Bakery",
    });
    expect(directions[0]!.spec.pages.length).toBeGreaterThanOrEqual(
      MIN_SITE_PAGES,
    );
  });
  it("without contact details the site offers a form, never a phone number or map", () => {
    const d = planDirectionsV3(brief(get("plumber"))).directions[0]!;
    const html = renderSiteV3(d.spec, ctx)["contact/index.html"]!;
    expect(html).toMatch(/<form/);
    expect(html).not.toMatch(/href="tel:/);
    expect(html).not.toMatch(/maps\.google|openstreetmap/);
  });
  it("with supplied contact details the links are real and nothing else is invented", () => {
    const d = planDirectionsV3({
      ...brief(get("barber")),
      phone: "+234 801 234 5678",
      whatsapp: "+2348012345678",
    }).directions[0]!;
    const html = renderSiteV3(d.spec, ctx)["index.html"]!;
    expect(html).toMatch(/tel:\+2348012345678|wa\.me\/2348012345678/);
  });
  it("is deterministic with no AI provider at all", () => {
    const a = planDirectionsV3(brief(get("kochab")));
    const b = planDirectionsV3(brief(get("kochab")));
    expect(JSON.stringify(a.directions.map((d) => d.spec))).toBe(
      JSON.stringify(b.directions.map((d) => d.spec)),
    );
  });
});

describe("directions are genuinely different", () => {
  for (const key of ["bakery", "kochab", "salon"])
    it(`${key}: at least two of hero, typography, colour, composition differ between every pair`, () => {
      const { directions } = planDirectionsV3(brief(get(key)));
      const dims = (s: SiteSpecV3) => [
        s.design.genome.heroPhilosophy,
        s.design.genome.typeVoice,
        s.design.colorwayId,
        s.design.genome.compositionMode,
        s.design.genome.imageDominance,
      ];
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          const a = dims(directions[i]!.spec),
            b = dims(directions[j]!.spec);
          expect(
            a.filter((x, ix) => x !== b[ix]).length,
            `${key} ${i}/${j}`,
          ).toBeGreaterThanOrEqual(2);
        }
    });
});

describe("fitText never cuts mid-thought", () => {
  it("keeps whole sentences", () => {
    expect(
      fitText(
        "One short sentence. Another sentence that is long enough to not fit here at all.",
        40,
      ),
    ).toBe("One short sentence.");
  });
  it("shortens one long sentence at a clause boundary", () => {
    const out = fitText(
      "Kochab Studio is a creative technology agency helping startups build premium websites, powerful brands, and digital experiences.",
      100,
    );
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).toMatch(/\.$/);
    expect(out).not.toMatch(/…/);
  });
});

describe("page limit and owner editing", () => {
  const base = planDirectionsV3(brief(get("bakery"))).directions[0]!.spec;
  it("removes and reorders pages but never home or contact", () => {
    const less = applyStructuredEditV3(base, {
      kind: "remove-page",
      slug: "gallery",
    });
    expect(less.pages.map((p) => p.slug)).not.toContain("gallery");
    expect(() =>
      applyStructuredEditV3(base, { kind: "remove-page", slug: "home" }),
    ).toThrow(EditV3Error);
    expect(() =>
      applyStructuredEditV3(base, { kind: "remove-page", slug: "contact" }),
    ).toThrow(EditV3Error);
    const moved = applyStructuredEditV3(base, {
      kind: "move-page",
      slug: "about",
      to: 1,
    });
    expect(moved.pages.map((p) => p.slug)[1]).toBe("about");
    expect(() =>
      applyStructuredEditV3(base, { kind: "move-page", slug: "home", to: 2 }),
    ).toThrow(EditV3Error);
  });
  it("edits section text; model-written text may not assert unsupplied claims, owner text may", () => {
    const idx = base.pages
      .find((p) => p.slug === "about")!
      .sections.findIndex((s) => s.type === "story");
    const ok = applyStructuredEditV3(base, {
      kind: "section-text",
      page: "about",
      index: idx,
      body: ["We bake for birthdays and weddings."],
      author: "owner",
    });
    expect(JSON.stringify(ok)).toContain("We bake for birthdays and weddings.");
    expect(() =>
      applyStructuredEditV3(base, {
        kind: "section-text",
        page: "about",
        index: idx,
        body: ["Award-winning bakers with 15 years of experience."],
        author: "model",
      }),
    ).toThrow(EditV3Error);
  });
  it("replaces a picture through the same validation as generation", () => {
    const idx = base.pages
      .find((p) => p.slug === "gallery")!
      .sections.findIndex((s) => s.type === "gallery");
    const next = applyStructuredEditV3(base, {
      kind: "replace-media",
      page: "gallery",
      index: idx,
      item: 0,
      media: {
        url: "https://images.example.com/owner.jpg",
        alt: "Our own cake",
        role: "gallery",
        treatment: "none",
        provenance: {
          sourceType: "owner-approved-stored",
          reviewStatus: "owner-approved",
        },
      },
    });
    expect(JSON.stringify(next)).toContain("images.example.com/owner.jpg");
    expect(() =>
      applyStructuredEditV3(base, {
        kind: "replace-media",
        page: "gallery",
        index: idx,
        item: 0,
        media: { url: "javascript:alert(1)", alt: "x" },
      }),
    ).toThrow(EditV3Error);
  });
  it("does not grow a site past seven pages, but keeps a historical eight-page site readable", () => {
    const eight = structuredClone(base);
    while (eight.pages.length < 8)
      eight.pages.splice(1, 0, {
        ...structuredClone(eight.pages[1]!),
        slug: `extra-${eight.pages.length}`,
        title: `Extra ${eight.pages.length}`,
      });
    expect(() => parseSiteSpecV3(eight)).not.toThrow();
    // removing from a legacy site works; the limit check never rejects shrinking
    const shrunk = applyStructuredEditV3(eight, {
      kind: "remove-page",
      slug: "extra-7",
    });
    expect(shrunk.pages.length).toBe(7);
  });
  it("a nine-page spec is rejected by the schema", () => {
    const nine = structuredClone(base);
    while (nine.pages.length < 9)
      nine.pages.push({
        ...structuredClone(nine.pages[1]!),
        slug: `x${nine.pages.length}`,
      });
    expect(() => parseSiteSpecV3(nine)).toThrow();
  });
});

describe("historical sites keep working", () => {
  it("a single-page site still renders and is not failed by the new-generation rules", () => {
    const one = structuredClone(
      planDirectionsV3(brief(get("plumber"))).directions[0]!.spec,
    );
    one.pages = [one.pages[0]!];
    const parsed = parseSiteSpecV3(one);
    expect(lintArtifact(renderSiteV3(parsed, ctx))).toEqual([]);
    expect(
      completenessV3(parsed).filter((i) => i.code === "TOO_FEW_PAGES"),
    ).toEqual([]);
    expect(
      completenessV3(parsed, { generation: true }).map((i) => i.code),
    ).toContain("TOO_FEW_PAGES");
  });
});

describe("quality gate and bounded repair", () => {
  const spec = planDirectionsV3(brief(get("kochab"))).directions[0]!.spec;
  it("detects truncation, broken links and invented claims", () => {
    const bad = structuredClone(spec);
    const hero = bad.pages[0]!.sections[0] as { subheading: string };
    hero.subheading = "We help businesses grow and attract…";
    const cta = bad.pages
      .flatMap((p) => p.sections)
      .find((s) => s.type === "cta") as {
      button: { href: string };
      heading: string;
    };
    cta.button.href = "/nonexistent";
    cta.heading = "Trusted by 500 clients, award-winning";
    const codes = completenessV3(bad, { generation: true }).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "TRUNCATED_COPY",
        "BROKEN_LINK",
        "UNSUPPLIED_CLAIM",
      ]),
    );
  });
  it("repairs what is safe, in at most two rounds, and reports what it could not fix", () => {
    const bad = structuredClone(spec);
    const cta = bad.pages
      .flatMap((p) => p.sections)
      .find((s) => s.type === "cta") as {
      button: { href: string };
      heading: string;
    };
    cta.button.href = "/nonexistent";
    cta.heading = "Trusted by 500 clients";
    const r = repairCompleteness(bad, { generation: true });
    expect(r.rounds).toBeLessThanOrEqual(2);
    expect(r.applied).toContain("BROKEN_LINK");
    expect(r.remaining.map((i) => i.code)).toContain("UNSUPPLIED_CLAIM");
  });
});
