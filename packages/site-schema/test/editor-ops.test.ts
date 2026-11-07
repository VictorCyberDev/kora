import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ADDABLE_PAGES,
  ADDABLE_SECTIONS,
  applyStructuredEditV3,
  completenessV3,
  EditV3Error,
  planDirectionsV3,
  renderSiteV3,
  lintArtifact,
  textHash,
  type SiteSpecV3,
} from "../src/index.js";

const matrix = JSON.parse(
  readFileSync(
    new URL(
      "../../creative/test/fixtures/business-matrix.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Array<{ key: string; name: string; description: string }>;
const specOf = (key: string, dir = 0): SiteSpecV3 => {
  const c = matrix.find((m) => m.key === key)!;
  return planDirectionsV3({ name: c.name, description: c.description })
    .directions[dir]!.spec;
};
const ctx = { formEndpoint: "https://kora.example/api/public/sites/s1/forms" };
const slugs = (s: SiteSpecV3) => s.pages.map((p) => p.slug);

describe("editor operations are validated SiteSpec operations", () => {
  it("adds, reorders and removes sections", () => {
    const base = specOf("bakery");
    const before = base.pages.find((p) => p.slug === "about")!.sections.length;
    const withFaq = applyStructuredEditV3(base, {
      kind: "add-section",
      page: "about",
      section: "faq",
    });
    const pg = withFaq.pages.find((p) => p.slug === "about")!;
    expect(pg.sections.length).toBe(before + 1);
    const at = pg.sections.findIndex((s) => s.type === "faq");
    expect(at).toBeGreaterThan(0);
    // inserted before the closing action, never after it
    expect(pg.sections.findIndex((s) => s.type === "cta")).toBeGreaterThan(at);
    const gone = applyStructuredEditV3(withFaq, {
      kind: "remove-section",
      page: "about",
      index: at,
    });
    expect(gone.pages.find((p) => p.slug === "about")!.sections.length).toBe(
      before,
    );
  });

  it("adds and removes pages within the seven-page limit, and refuses beyond it", () => {
    let s = specOf("bakery");
    s = applyStructuredEditV3(s, { kind: "remove-page", slug: "gallery" });
    s = applyStructuredEditV3(s, { kind: "add-page", page: "faq" });
    expect(slugs(s)).toContain("faq");
    expect(slugs(s).at(-1)).toBe("contact");
    expect(() =>
      applyStructuredEditV3(s, { kind: "add-page", page: "faq" }),
    ).toThrow(/already/);
    s = applyStructuredEditV3(s, { kind: "add-page", page: "approach" });
    expect(s.pages.length).toBe(7);
    // seven pages: nothing more can be added; each add path is checked
    for (const k of ADDABLE_PAGES)
      expect(() =>
        applyStructuredEditV3(s, { kind: "add-page", page: k }),
      ).toThrow(EditV3Error);
  });

  it("regenerates one section or a whole page without touching the design or the owner's pictures", () => {
    const base = specOf("bakery", 1);
    const idx = base.pages
      .find((p) => p.slug === "cakes")!
      .sections.findIndex((s) => s.type === "story");
    const edited = applyStructuredEditV3(base, {
      kind: "section-text",
      page: "cakes",
      index: idx,
      body: ["My own words about cakes."],
    });
    const re = applyStructuredEditV3(edited, {
      kind: "regenerate-section",
      page: "cakes",
      index: idx,
    });
    const after = re.pages.find((p) => p.slug === "cakes")!.sections[idx]!;
    expect(JSON.stringify(after)).not.toContain("My own words");
    expect(after.type).toBe("story");
    expect(re.design).toEqual(base.design);
    expect(re.brand).toEqual(base.brand);
    expect(() =>
      applyStructuredEditV3(base, {
        kind: "regenerate-section",
        page: "cakes",
        index: 0,
      }),
    ).toThrow(EditV3Error); // the opening is edited by hand
    const page = applyStructuredEditV3(edited, {
      kind: "regenerate-page",
      page: "about",
    });
    expect(
      page.pages.find((p) => p.slug === "about")!.sections.map((s) => s.type),
    ).toEqual(
      base.pages.find((p) => p.slug === "about")!.sections.map((s) => s.type),
    );
  });

  it("edits service and product items: names, descriptions, adding and removing; prices need an owner confirmation", () => {
    const base = specOf("bakery");
    const home = base.pages.find((p) => p.slug === "home")!;
    const idx = home.sections.findIndex((s) => s.type === "offer");
    const a = applyStructuredEditV3(base, {
      kind: "item",
      page: "home",
      index: idx,
      action: "update",
      item: 0,
      title: "Wedding cakes",
      text: "Tiered cakes for the big day.",
    });
    const off = a.pages.find((p) => p.slug === "home")!.sections[idx] as {
      items: Array<{ title: string; text: string }>;
    };
    expect(off.items[0]).toMatchObject({
      title: "Wedding cakes",
      text: "Tiered cakes for the big day.",
    });
    const b = applyStructuredEditV3(a, {
      kind: "item",
      page: "home",
      index: idx,
      action: "add",
      title: "Pastries",
      text: "Sweet and savoury.",
    });
    expect(
      (
        b.pages.find((p) => p.slug === "home")!.sections[idx] as {
          items: unknown[];
        }
      ).items.length,
    ).toBe(off.items.length + 1);
    expect(() =>
      applyStructuredEditV3(b, {
        kind: "item",
        page: "home",
        index: idx,
        action: "update",
        item: 0,
        price: "from N5,000",
      }),
    ).toThrow(EditV3Error);
    const priced = applyStructuredEditV3(
      b,
      {
        kind: "item",
        page: "home",
        index: idx,
        action: "update",
        item: 0,
        price: "from N5,000",
      },
      { confirmedTextHashes: new Set([textHash("from N5,000")]) },
    );
    expect(JSON.stringify(priced)).toContain("from N5,000");
    const c = applyStructuredEditV3(b, {
      kind: "item",
      page: "home",
      index: idx,
      action: "remove",
      item: 2,
    });
    expect(
      (
        c.pages.find((p) => p.slug === "home")!.sections[idx] as {
          items: unknown[];
        }
      ).items.length,
    ).toBe(off.items.length);
    expect(() =>
      applyStructuredEditV3(base, {
        kind: "item",
        page: "home",
        index: 0,
        action: "add",
        title: "x",
      }),
    ).toThrow(EditV3Error); // a hero has no list
  });

  it("edits page titles, navigation labels, opening subheadings and search text", () => {
    const base = specOf("kochab");
    const s = applyStructuredEditV3(base, {
      kind: "page-meta",
      page: "services",
      title: "Our services",
      nav: "Services",
    });
    expect(s.pages.find((p) => p.slug === "services")).toMatchObject({
      title: "Our services",
      nav: "Services",
    });
    const h = applyStructuredEditV3(s, {
      kind: "section-text",
      page: "about",
      index: 0,
      subheading: "Who we are.",
    });
    expect(
      JSON.stringify(h.pages.find((p) => p.slug === "about")!.sections[0]),
    ).toContain("Who we are.");
    const seo = applyStructuredEditV3(h, {
      kind: "seo",
      title: "Kochab Studio | websites and brands",
      description: "A creative technology studio.",
    });
    expect(seo.seo.title).toContain("Kochab");
    expect(() =>
      applyStructuredEditV3(seo, {
        kind: "seo",
        description: "The best studio in town, guaranteed.",
      }),
    ).toThrow(EditV3Error);
  });
});

describe("every business: every editor operation yields a valid, complete, renderable site", () => {
  for (const c of matrix)
    it(`${c.key}`, () => {
      const base = specOf(c.key);
      for (const kind of ADDABLE_SECTIONS) {
        try {
          const s = applyStructuredEditV3(base, {
            kind: "add-section",
            page: "about",
            section: kind,
          });
          expect(
            completenessV3(s, { generation: true }).filter(
              (i) => i.severity === "block",
            ),
            `${c.key} add ${kind}`,
          ).toEqual([]);
          expect(lintArtifact(renderSiteV3(s, ctx))).toEqual([]);
        } catch (e) {
          expect(e).toBeInstanceOf(EditV3Error); // an honest refusal ("say what you offer first"), never a broken site
        }
      }
      for (const p of base.pages) {
        try {
          const s = applyStructuredEditV3(base, {
            kind: "regenerate-page",
            page: p.slug,
          });
          expect(
            completenessV3(s, { generation: true }).filter(
              (i) => i.severity === "block",
            ),
            `${c.key} regenerate ${p.slug}`,
          ).toEqual([]);
          expect(lintArtifact(renderSiteV3(s, ctx))).toEqual([]);
        } catch (e) {
          expect(e).toBeInstanceOf(EditV3Error);
        }
      }
      for (const k of ADDABLE_PAGES) {
        const without = base.pages.some((p) => p.slug === k)
          ? applyStructuredEditV3(base, { kind: "remove-page", slug: k })
          : base;
        try {
          const s = applyStructuredEditV3(without, {
            kind: "add-page",
            page: k,
          });
          expect(s.pages.length).toBeLessThanOrEqual(7);
          expect(
            completenessV3(s, { generation: true }).filter(
              (i) => i.severity === "block",
            ),
            `${c.key} add page ${k}`,
          ).toEqual([]);
          expect(lintArtifact(renderSiteV3(s, ctx))).toEqual([]);
        } catch (e) {
          expect(e).toBeInstanceOf(EditV3Error);
        }
      }
    });
});
