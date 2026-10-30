import { describe, expect, it } from "vitest";
import {
  applyStructuredEditV2,
  designQuality,
  EditV2Error,
  generateSpecFromBrief,
  hashSpec,
  lintArtifact,
  parseSiteSpec,
  planSite,
  readableOn,
  renderAnySite,
  renderSite,
  renderSiteV2,
  ruleBasedEditV2,
  upgradeV1ToV2,
  parseSiteSpecV2,
  type SiteSpec,
} from "../src/index.js";
import { BRIEFS } from "./fixtures/briefs.js";

const spec = () => planSite(BRIEFS.restaurant!);

describe("visual controls compile to validated v2 specs", () => {
  it("changes palette, font, density, nav and keeps the spec valid and contrast-safe", () => {
    let s = applyStructuredEditV2(spec(), {
      kind: "palette",
      strategy: "forest-night",
      hueShift: 6,
    });
    expect(s.design.mode).toBe("dark");
    s = applyStructuredEditV2(s, { kind: "font", pairing: "geometric" });
    s = applyStructuredEditV2(s, { kind: "nav", value: "floating" });
    s = applyStructuredEditV2(s, { kind: "density", value: "compact" });
    expect(parseSiteSpecV2(s)).toEqual(s);
    expect(lintArtifact(renderSiteV2(s))).toEqual([]);
  });
  it("moves, duplicates, deletes and re-lays-out sections but refuses nonsense", () => {
    const base = spec();
    const types = (s: typeof base) => s.pages[0]!.sections.map((x) => x.type);
    const moved = applyStructuredEditV2(base, {
      kind: "section-move",
      page: "home",
      from: 2,
      to: 4,
    });
    expect(types(moved)).not.toEqual(types(base));
    expect(types(moved).slice().sort()).toEqual(types(base).slice().sort());
    const dup = applyStructuredEditV2(base, {
      kind: "section-duplicate",
      page: "home",
      index: 2,
    });
    expect(dup.pages[0]!.sections).toHaveLength(
      base.pages[0]!.sections.length + 1,
    );
    const idx = base.pages[0]!.sections.findIndex((s) => s.type === "faq");
    const shuffled = applyStructuredEditV2(base, {
      kind: "section-shuffle",
      page: "home",
      index: idx,
    });
    expect(
      (shuffled.pages[0]!.sections[idx] as { variant: string }).variant,
    ).not.toBe((base.pages[0]!.sections[idx] as { variant: string }).variant);
    expect(() =>
      applyStructuredEditV2(base, {
        kind: "section-variant",
        page: "home",
        index: idx,
        value: "carousel-3d",
      }),
    ).toThrow(EditV2Error);
    expect(() =>
      applyStructuredEditV2(base, {
        kind: "section-delete",
        page: "home",
        index: base.pages[0]!.sections.findIndex((s) => s.type === "contact"),
      }),
    ).toThrow(/contact/);
    expect(() =>
      applyStructuredEditV2(base, { kind: "font", pairing: "Papyrus" }),
    ).toThrow();
  });
  it("rule-based chat edits: colour, button text, add a service, rename", () => {
    const base = spec();
    const blue = ruleBasedEditV2(
      base,
      "Make the primary colour blue",
      readableOn,
    )!;
    expect(blue.design.palette.primary).toBe("#1f4fd8");
    expect(parseSiteSpecV2(blue)).toEqual(blue);
    expect(
      (
        ruleBasedEditV2(
          base,
          "change the main button to say Book a table now",
          readableOn,
        )!.pages[0]!.sections[0] as { primaryCta: { label: string } }
      ).primaryCta.label,
    ).toBe("Book a table now");
    expect(
      JSON.stringify(ruleBasedEditV2(base, "add Outdoor seating", readableOn)),
    ).toContain("Outdoor seating");
    expect(
      ruleBasedEditV2(base, "rename to Tola's Table", readableOn)!.business
        .name,
    ).toBe("Tola's Table");
    expect(
      ruleBasedEditV2(base, "make it feel more premium", readableOn),
    ).toBeNull();
  });
});

describe("upgrade v1 → v2 never touches v1 and never invents", () => {
  const v1: SiteSpec = parseSiteSpec({
    ...generateSpecFromBrief({
      name: "Old Co",
      description: "We provide plumbing and heating in Leeds. Family run.",
      location: "Leeds",
      phone: "+44 113 555 0100",
    }),
  });
  const rich = parseSiteSpec({
    ...v1,
    pages: [
      {
        ...v1.pages[0]!,
        sections: [
          ...v1.pages[0]!.sections,
          {
            type: "testimonials",
            heading: "Kind words",
            items: [{ quote: "Fixed it in an hour", author: "J. Smith" }],
          },
          {
            type: "pricing",
            heading: "Prices",
            tiers: [
              { name: "Callout", price: "£60", description: "", features: [] },
            ],
          },
          {
            type: "faq",
            heading: "Questions",
            items: [
              {
                question: "Do you work weekends?",
                answer: "Yes, by arrangement.",
              },
            ],
          },
        ],
      },
      ...v1.pages.slice(1),
    ],
  });
  it("carries the owner's own content over and adds nothing", () => {
    const before = hashSpec(rich);
    const { spec: up, carried } = upgradeV1ToV2(rich);
    expect(hashSpec(rich)).toBe(before);
    const html = JSON.stringify(up);
    for (const must of [
      "Fixed it in an hour",
      "J. Smith",
      "£60",
      "Do you work weekends?",
      "Leeds",
      "+44 113 555 0100",
    ])
      expect(html).toContain(must);
    expect(carried).toEqual(
      expect.arrayContaining(["testimonials", "pricing", "faq"]),
    );
    const facts = { text: JSON.stringify(rich) };
    expect(designQuality(up, facts)).toEqual([]);
    expect(lintArtifact(renderSiteV2(up))).toEqual([]);
    expect(up.version).toBe(2);
  });
  it("v1 still renders identically after the upgrade exists (rollback to v1 is possible)", () => {
    upgradeV1ToV2(rich);
    expect(renderAnySite(rich)).toEqual(renderSite(rich));
  });
});
