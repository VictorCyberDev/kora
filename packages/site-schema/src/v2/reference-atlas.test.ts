import { describe, expect, it } from "vitest";
import {
  ATLAS_STATS,
  campaignBlueprintsFor,
  resolveAtlasVertical,
  websiteBlueprintsFor,
} from "./reference-atlas.js";
import { planDirections } from "./atlas-plan.js";

describe("Reference Atlas", () => {
  it("exceeds the requested website and campaign design space", () => {
    expect(ATLAS_STATS.verticals).toBeGreaterThanOrEqual(60);
    expect(ATLAS_STATS.websiteBlueprints).toBeGreaterThan(2_000);
    expect(ATLAS_STATS.campaignBlueprints).toBeGreaterThan(10_000);
  });

  it("retrieves Nigerian SME verticals from natural language", () => {
    expect(resolveAtlasVertical("premium barbershop in Yaba").id).toBe("barber");
    expect(resolveAtlasVertical("birthday cake business in Abuja").id).toBe("cake-business");
    expect(resolveAtlasVertical("lawyer office for SMEs").id).toBe("law");
    expect(resolveAtlasVertical("POS agent and cash withdrawal kiosk").id).toBe("pos-agent");
  });

  it("returns a useful shortlist without duplicating an entire corpus into the UI", () => {
    expect(websiteBlueprintsFor("barbershop", 18)).toHaveLength(18);
    expect(campaignBlueprintsFor("barbershop", 24)).toHaveLength(24);
  });

  it("normalizes local wording and gives image-led businesses a coherent multi-image story", () => {
    const directions = planDirections({
      name: "Edge House",
      description:
        "A premium barbing salon offering fades, beard grooming and home service in Yaba.",
      industry: "barbing salon",
      location: "Yaba, Lagos",
      services: ["Skin fade", "Beard grooming", "Home service"],
      whatsapp: "+2348012345678",
    });
    expect(directions).toHaveLength(3);
    for (const direction of directions) {
      expect(direction.name.toLowerCase()).toContain("barbershop");
      const mediaUrls = direction.spec.pages[0]!.sections.flatMap((section) => {
        if (section.type === "hero" || section.type === "about")
          return section.media ? [section.media.url] : [];
        if (
          section.type === "services" ||
          section.type === "features" ||
          section.type === "portfolio"
        )
          return section.items.flatMap((item) => (item.media ? [item.media.url] : []));
        return [];
      });
      expect(new Set(mediaUrls).size).toBeGreaterThanOrEqual(3);
      expect(direction.spec.design.imagery.style).toBe("photo-led");
    }
  });
});
