import { describe, expect, it } from "vitest";
import {
  applyIntelligence,
  hashSpec,
  lintArtifact,
  planSite,
  renderSiteV2,
} from "../src/index.js";
import { BRIEFS } from "./fixtures/briefs.js";

const good = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    understanding: {
      industry: "Interior design",
      audience: "Homeowners in Lagos",
      offering: "Space planning and styling",
      tone: "calm",
    },
    strategy: {
      positioning: "A calm studio for considered homes",
      keyMessage: "Rooms that fit how you live",
    },
    architecture: {
      lookId: "luxe-centered",
      rationale: "Quiet, centred, lots of air",
    },
    design: {
      paletteStrategy: "royal-ivory",
      personality: ["elegant", "minimal"],
      rationale: "Ivory with deep indigo",
    },
    content: {
      eyebrow: "Interior design · Lekki",
      heroHeading: "Homes and small offices, planned around how you live",
      heroSubheading:
        "Space planning, furnishing, lighting and styling in Lagos.",
    },
    media: { art: "arch" },
    ...over,
  });
const brief = BRIEFS.interior!;

describe("design intelligence is untrusted input to the deterministic planner", () => {
  it("applies a valid answer: look, palette, art, personality and clean copy", () => {
    const r = applyIntelligence(brief, good());
    expect(r.spec.meta.generator).toBe("model");
    expect(r.spec.design.paletteStrategy).toBe("royal-ivory");
    expect(r.spec.design.imagery.art).toBe("arch");
    expect(r.spec.design.personality).toEqual(["elegant", "minimal"]);
    expect(
      (r.spec.pages[0]!.sections[0] as { heading: string }).heading,
    ).toContain("planned around how you live");
    expect(r.applied).toEqual(
      expect.arrayContaining(["layout", "palette", "copy"]),
    );
    expect(lintArtifact(renderSiteV2(r.spec))).toEqual([]);
  });
  it("accepts a fenced JSON answer", () => {
    expect(
      applyIntelligence(brief, "```json\n" + good() + "\n```").spec.design
        .paletteStrategy,
    ).toBe("royal-ivory");
  });
  it.each([
    ["not json", "I would suggest a calm design!"],
    [
      "unknown look",
      good({ architecture: { lookId: "neon-marquee", rationale: "x" } }),
    ],
    [
      "unknown palette",
      good({
        design: { paletteStrategy: "#ff0000", personality: [], rationale: "x" },
      }),
    ],
    [
      "extra html in a design field",
      good({ media: { art: "<script>alert(1)</script>" } }),
    ],
  ])("falls back to the deterministic design for %s", (_n, text) => {
    const r = applyIntelligence(brief, text);
    expect(r.applied).toEqual([]);
    expect(r.rejected.length).toBeGreaterThan(0);
    expect(hashSpec(r.spec)).toBe(hashSpec(planSite(brief)));
  });
  it("keeps the design but refuses copy with clichés or invented facts", () => {
    const cliche = applyIntelligence(
      brief,
      good({
        content: {
          heroHeading: "Unlock world-class interiors that elevate your space",
        },
      }),
    );
    expect(cliche.rejected.join(" ")).toContain("cliche");
    expect(cliche.applied).not.toContain("copy");
    expect(cliche.spec.design.paletteStrategy).toBe("royal-ivory");
    expect(
      (cliche.spec.pages[0]!.sections[0] as { heading: string }).heading,
    ).not.toMatch(/unlock/i);
    const invented = applyIntelligence(
      brief,
      good({
        content: {
          heroSubheading:
            "Award-winning studio with 15 years of experience and 200 happy clients.",
        },
      }),
    );
    expect(invented.rejected.join(" ")).toMatch(
      /unsupported-claim|invented-number/,
    );
    expect(JSON.stringify(invented.spec)).not.toMatch(
      /Award-winning|15 years|200 happy/,
    );
  });
  it("model-chosen copy containing markup is escaped by the renderer, never executed", () => {
    const r = applyIntelligence(
      brief,
      good({
        content: {
          heroHeading: `Rooms <img src=x onerror=alert(1)> that work`,
        },
      }),
    );
    const html = renderSiteV2(r.spec)["index.html"]!;
    expect(html).not.toContain("<img src=x");
    expect(lintArtifact(renderSiteV2(r.spec))).toEqual([]);
  });
});
