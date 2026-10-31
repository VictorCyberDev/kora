import { describe, expect, it } from "vitest";
import { ArtDirectionSchema, artDirectionIssues } from "./artdirection.js";

const base = () =>
  ArtDirectionSchema.parse({
    category: "bakery-cakes",
    concept: "A warm counter where every cake looks like a gift.",
    visualObject: "a cake seen from above, slightly off-centre",
    type: { pairing: "serif-sans", headlineVw: 0.08 },
    palette: {
      ink: "#2b1a14",
      canvas: "#fbf3ea",
      primary: "#b2452c",
      accent: "#e9a23b",
    },
    sections: [
      { id: "hero", rhythm: "full-bleed", factKey: "product:cakes", photos: 2 },
      { id: "product", rhythm: "dense", factKey: "product:cakes", photos: 2 },
      { id: "price-or-enquiry", rhythm: "open", factKey: "price:cake" },
      { id: "how-to-order", rhythm: "quiet", factKey: "hours" },
    ],
    image: {
      brief: "Owner photos of finished cakes on a plain table",
      provenance: "owner-upload",
    },
    motion: { behaviour: "reveal-rise", reducedMotion: "fade only" },
    brandCodes: ["off-centre cake"],
  });

describe("art direction floor", () => {
  it("passes a well-formed bakery direction", () => {
    expect(artDirectionIssues(base())).toEqual([]);
  });
  it("catches the Phase 0 defects", () => {
    const a = base();
    a.type.headlineVw = 0.03;
    a.sections[0]!.photos = 0;
    a.sections[1]!.photos = 1;
    a.sections[1]!.rhythm = "full-bleed";
    a.sections.push({ id: "how-it-works", rhythm: "dense", photos: 0 });
    const codes = artDirectionIssues(a).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "HEADLINE_TOO_SMALL",
        "FLAT_RHYTHM",
        "TOO_FEW_PHOTOS",
        "FILLER_SECTION",
        "BANNED_SECTION",
      ]),
    );
  });
  it("gates generated imagery and motion fallbacks", () => {
    const a = base();
    a.image.provenance = "generated";
    a.motion.reducedMotion = undefined;
    const codes = artDirectionIssues(a).map((i) => i.code);
    expect(codes).toContain("UNGATED_GENERATED_IMAGE");
    expect(codes).toContain("NO_REDUCED_MOTION");
  });
  it("requires the category's mandatory sections", () => {
    const a = base();
    a.sections = a.sections.filter((s) => s.id !== "how-to-order");
    expect(artDirectionIssues(a).map((i) => i.code)).toContain(
      "MISSING_REQUIRED",
    );
  });
});
