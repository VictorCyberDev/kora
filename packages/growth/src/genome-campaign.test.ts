import { describe, expect, it } from "vitest";
import { BrandKitSchema } from "./brand.js";
import { BusinessFactsSchema } from "./facts.js";
import { deriveGenome, genomeDiff, genomeDrift, genomeGaps } from "./genome.js";
import {
  AdHypothesisSchema,
  CampaignBriefSchema,
  adState,
  channelAdaptation,
  creativeDirections,
  directionsDiffer,
  evidenceLabel,
  feasibleDirections,
} from "./campaign.js";

const kit = BrandKitSchema.parse({
  colors: {
    ink: "#111111",
    canvas: "#faf6ef",
    primary: "#b2452c",
    primaryText: "#ffffff",
    accent: "#e9a23b",
    accentText: "#111111",
    muted: "#666666",
  },
  typography: {
    pairing: "serif-sans",
    displayFamily: "DM Serif Display",
    bodyFamily: "Manrope",
  },
  voice: {
    tone: "warm",
    use: ["fresh", "homemade", "order"],
    avoid: ["luxury"],
  },
  imagery: {},
});
const facts = BusinessFactsSchema.parse({
  identity: { name: "Ada Cakes", tagline: "Baked the morning you collect." },
  contact: { city: "Lagos" },
  availability: { hours: [] },
  offer: {
    services: ["Birthday cakes"],
    offers: [{ id: "oct", title: "October box" }],
  },
  social: [],
});
const g = deriveGenome(kit, facts);

describe("brand genome", () => {
  it("derives from the kit and facts without inventing strategy", () => {
    expect(g.version).toBe(1);
    expect(g.strategic.promise).toBe("Baked the morning you collect.");
    expect(g.strategic.positioning).toBe("");
    expect(genomeGaps(g)).toEqual(
      expect.arrayContaining([expect.stringContaining("choose you")]),
    );
  });
  it("keeps owner-written strategy across versions and reports diffs", () => {
    const v1 = {
      ...g,
      strategic: { ...g.strategic, positioning: "Cakes baked to order." },
    };
    const v2 = deriveGenome(kit, facts, {
      previous: v1,
      wins: ["Tuesday photo posts"],
    });
    expect(v2.version).toBe(2);
    expect(v2.strategic.positioning).toBe("Cakes baked to order.");
    expect(genomeDiff(v1, v2)).toEqual(["performance.whatWorked"]);
  });
  it("flags copy that drifts from the owner's words", () => {
    expect(genomeDrift(g, "A luxury cake for you")).toEqual(
      expect.arrayContaining([expect.stringContaining("luxury")]),
    );
    expect(genomeDrift(g, "Fresh, homemade, order today")).toEqual([]);
  });
});

describe("campaign", () => {
  const brief = CampaignBriefSchema.parse({
    name: "October box",
    objective: "announce",
    audience: "Parents planning birthdays",
    subjectKey: "offer:oct",
    subject: "the October cake box",
    startOn: "2026-10-20",
    endOn: "2026-10-31",
    channels: ["instagram", "whatsapp"],
  });
  const dirs = creativeDirections(brief, g);
  it("offers four genuinely different directions", () => {
    expect(dirs).toHaveLength(4);
    expect(directionsDiffer(dirs)).toBe(true);
    expect(directionsDiffer([dirs[0]!, dirs[0]!])).toBe(false);
  });
  it("blocks directions that need facts Kora does not have", () => {
    const r = feasibleDirections(dirs, {
      productPhoto: true,
      verifiedTestimonial: false,
      verifiedPremises: false,
    });
    expect(r.feasible.map((d) => d.angle)).toEqual(["product", "moment"]);
    expect(r.blocked.map((b) => b.angle)).toEqual(["people", "place"]);
  });
  it("never lets spend through without approval of that cap", () => {
    const h = AdHypothesisSchema.parse({
      hypothesis: "Parents see the box on Instagram and message us",
      channel: "instagram",
      audience: "Parents in Lagos",
      budgetCap: 20000,
      currency: "NGN",
      days: 7,
      successMetric: "enquiries",
      successTarget: 10,
    });
    expect(adState(h)).toBe("NEEDS_APPROVAL");
    expect(adState(h, { approvedCap: 10000, by: "owner" })).toBe(
      "NEEDS_APPROVAL",
    );
    expect(adState(h, { approvedCap: 20000, by: "owner" })).toBe("APPROVED");
    expect(adState({ ...h, budgetCap: 0 })).toBe("DRAFT");
  });
  it("labels evidence honestly and adapts per channel", () => {
    expect(evidenceLabel("ESTIMATED")).toMatch(/not counted/);
    expect(channelAdaptation("whatsapp", dirs[0]!).format).toMatch(/portrait/);
  });
});
