import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertKnowledgeSafe,
  blueprintIssues,
  buildBlueprint,
  claimIssues,
  classifyVertical,
  MAX_PAGES,
  MIN_PAGES,
  PROFILES,
  VERTICALS,
} from "../src/index.js";

interface Case {
  key: string;
  name: string;
  description: string;
  expect: string[];
}
const matrix = JSON.parse(
  readFileSync(
    new URL("./fixtures/business-matrix.json", import.meta.url),
    "utf8",
  ),
) as Case[];

describe("industry knowledge", () => {
  it("never reads as a claim about the owner's business", () => {
    expect(() => assertKnowledgeSafe()).not.toThrow();
  });
  it("detects claims when they are present", () => {
    expect(claimIssues("Trusted by 500 clients for 10 years")).not.toEqual([]);
    expect(claimIssues("Share the date and the number of guests.")).toEqual([]);
  });
  it("is versioned and reviewed, and refers only to real verticals", () => {
    const ids = new Set(VERTICALS.map((v) => v.id));
    for (const p of PROFILES) {
      expect(ids.has(p.verticalId), p.verticalId).toBe(true);
      expect(p.meta.profileVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(p.meta.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.meta.restrictions.length).toBeGreaterThan(0);
      for (const t of p.topics) {
        expect(t.intro.length).toBeLessThanOrEqual(400);
        expect(() => new RegExp(t.match, "i")).not.toThrow();
      }
    }
  });
});

describe("classification across the acceptance matrix", () => {
  for (const c of matrix)
    it(`${c.key} is understood as ${c.expect.join(" or ")}`, () => {
      const r = classifyVertical(`${c.name} ${c.description}`);
      expect(c.expect).toContain(r.vertical.id);
    });
  it("does not classify Kochab Studio as SaaS", () => {
    const k = matrix.find((m) => m.key === "kochab")!;
    expect(buildBlueprint(k).classification.verticalId).toBe("digital-studio");
  });
  it("treats a sentence without a trade as ambiguous instead of inventing an industry", () => {
    const bp = buildBlueprint({
      name: "Acme Co",
      description: "My company provides services.",
    });
    expect(bp.classification.ambiguous).toBe(true);
    expect(bp.classification.label).toBe("General business");
    expect(bp.followUp).not.toBeNull();
    expect(bp.suggestedOfferCategories).toEqual([]);
    expect(bp.pageArchitecture.length).toBeGreaterThanOrEqual(MIN_PAGES);
  });
});

describe("business blueprint", () => {
  for (const c of matrix)
    it(`${c.key}: a usable ${MIN_PAGES}-${MAX_PAGES} page blueprint with no invented facts`, () => {
      const bp = buildBlueprint({ name: c.name, description: c.description });
      expect(blueprintIssues(bp)).toEqual([]);
      const n = bp.pageArchitecture.length;
      expect(n).toBeGreaterThanOrEqual(MIN_PAGES);
      expect(n).toBeLessThanOrEqual(MAX_PAGES);
      for (const o of [...bp.suggestedOfferCategories])
        expect(o.provenance).toBe("SUGGESTED_UNCONFIRMED");
      for (const f of bp.confirmedFacts)
        expect(f.provenance).toBe("OWNER_CONFIRMED");
      // nothing the owner did not supply is marked as confirmed
      expect(bp.unknownFacts.map((u) => u.key)).toContain("prices");
      expect(bp.unknownFacts.map((u) => u.key)).toContain("testimonials");
    });

  it("bakery: six pages, cakes and small chops confirmed, no catalogue invented", () => {
    const bp = buildBlueprint({
      name: "Sweet Crumbs Bakery",
      description: "I bake cakes and small chops.",
    });
    expect(bp.classification.verticalId).toBe("bakery");
    expect(bp.pageArchitecture.map((p) => p.slug)).toEqual([
      "home",
      "cakes",
      "small-chops",
      "gallery",
      "about",
      "contact",
    ]);
    const confirmed = bp.provenance
      .filter((p) => p.field.startsWith("offering:"))
      .map((p) => p.field);
    expect(confirmed).toEqual(["offering:cakes", "offering:small-chops"]);
    expect(bp.unknownFacts.map((u) => u.key)).toEqual(
      expect.arrayContaining(["prices", "location", "hours"]),
    );
    // pastries and bread are only suggestions to confirm
    expect(bp.suggestedOfferCategories.map((s) => s.id)).toEqual(
      expect.arrayContaining(["pastries", "bread"]),
    );
    expect(bp.imagePlan.targetPlacements).toBeGreaterThanOrEqual(10);
    expect(bp.imagePlan.searchIntents.length).toBeGreaterThanOrEqual(2);
    expect(bp.imagePlan.searchIntents.length).toBeLessThanOrEqual(4);
  });

  it("kochab: services and a way of working, from the owner's own words", () => {
    const k = matrix.find((m) => m.key === "kochab")!;
    const bp = buildBlueprint(k);
    const slugs = bp.pageArchitecture.map((p) => p.slug);
    expect(slugs[0]).toBe("home");
    expect(slugs).toContain("services");
    expect(slugs).toContain("approach");
    expect(slugs.at(-1)).toBe("contact");
    const labels = bp.provenance.filter(
      (p) =>
        p.field.startsWith("offering:") && p.provenance === "OWNER_CONFIRMED",
    );
    expect(labels.length).toBeGreaterThanOrEqual(4);
  });

  it("is deterministic", () => {
    const a = buildBlueprint({
      name: "X Bakery",
      description: "We bake bread and pastries.",
    });
    const b = buildBlueprint({
      name: "X Bakery",
      description: "We bake bread and pastries.",
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("without any contact method it plans for the enquiry form, not a phone number", () => {
    const bp = buildBlueprint({
      name: "Sweet Crumbs Bakery",
      description: "I bake cakes and small chops.",
    });
    expect(bp.conversionStrategy.formOnly).toBe(true);
    expect(bp.confirmedFacts.some((f) => f.key === "phone")).toBe(false);
  });
});
