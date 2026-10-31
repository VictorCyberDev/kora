import { describe, expect, it } from "vitest";
import {
  creativeFindings,
  distinctness,
  gradeFindings,
  nearDuplicate,
  planSite,
} from "../src/v2/index.js";
import { BRIEFS } from "./fixtures/briefs.js";

const bakery = {
  name: "Ada's Cakes",
  description:
    "A small bakery in Yaba. We bake birthday cakes, cupcakes and sourdough bread to order.",
  location: "Yaba, Lagos",
  whatsapp: "+2348035550142",
};

describe("creative quality", () => {
  it("measures real generated sites and grades them", () => {
    for (const [k, b] of Object.entries(BRIEFS)) {
      const spec = planSite(b);
      const f = creativeFindings(spec, { text: b.description });
      const g = gradeFindings(f);
      expect(["K0", "K1", "K2", "K3", "K4", "K5"], k).toContain(g.grade);
    }
  });
  it("flags the Phase 0 defects on a bakery page", () => {
    const spec = planSite(bakery);
    const f = creativeFindings(spec, {
      text: `${bakery.description}`,
      industry: "bakery",
    });
    // generated pages carry abstract art, not photos, so the photo floor must trip.
    expect(f.map((x) => x.rule)).toContain("photo-floor");
  });
  it("blocks a food page that never names a product", () => {
    const spec = planSite({
      name: "Sweet Corner",
      description:
        "We are a family business serving our neighbourhood every day.",
    });
    const f = creativeFindings(spec, {
      text: "family business",
      industry: "bakery",
    });
    expect(f.map((x) => x.rule)).toContain("category-vocabulary");
    expect(gradeFindings(f).grade).not.toBe("K5");
  });
  it("grades by severity and never gives K5 to a flagged page", () => {
    const mk = (n: number, severity: "block" | "warn") =>
      Array.from({ length: n }, () => ({
        rule: "x",
        perspective: "copy" as const,
        severity,
        message: "",
      }));
    expect(gradeFindings([]).grade).toBe("K5");
    expect(gradeFindings(mk(1, "warn")).grade).toBe("K4");
    expect(gradeFindings(mk(3, "warn")).grade).toBe("K3");
    expect(gradeFindings(mk(1, "block")).grade).toBe("K2");
    expect(gradeFindings(mk(3, "block")).grade).toBe("K0");
  });
  it("detects near-duplicate sites", () => {
    const a = planSite(BRIEFS.repair!);
    expect(distinctness(a, a)).toBe(0);
    expect(nearDuplicate(a, [a]).tooSimilar).toBe(true);
    expect(nearDuplicate(a, []).tooSimilar).toBe(false);
    expect(distinctness(a, planSite(BRIEFS.interior!))).toBeGreaterThan(0);
  });
});
