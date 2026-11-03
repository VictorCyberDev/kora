import { describe, expect, it } from "vitest";
import {
  ARTIFACT_FORMATS,
  ARTIFACT_FORMAT_IDS,
  ArtifactSpecSchema,
  artifactIssues,
  composeArtifact,
  composeDirections,
  renderArtifactSvg,
  brandOsFromDirection,
  brandOsHash,
  VOICE_FAMILIES,
  TYPE_VOICES,
  type ArtifactFormatId,
} from "../src/index.js";

const direction = composeDirections({
  name: "Fade Lab",
  description: "We focus on clean fades and beard grooming in Lekki.",
  goal: "bookings",
})[0]!;
const mk = (genome = direction.genome) => ({
  name: "Fade Lab",
  version: 1,
  hash: "a".repeat(64),
  mode: "dark" as const,
  palette: {
    background: "#111111",
    foreground: "#f4f1ea",
    primary: "#e63b2e",
    secondary: "#f4f1ea",
    accent: "#ffd23f",
  },
  genome,
});
const content = {
  headline: "Clean fades. Sharp beards.",
  subline: "Clean fades · Beard grooming",
  cta: "Book a haircut",
  contact: "WhatsApp +2348012345678",
  eyebrow: "Lekki",
};

describe("ArtifactSpec", () => {
  it("renders every format at its true size with the brand version recorded", () => {
    for (const f of ARTIFACT_FORMAT_IDS) {
      const spec = composeArtifact({ format: f, brand: mk(), content });
      expect(ArtifactSpecSchema.parse(spec).brand.osVersion).toBe(1);
      const r = renderArtifactSvg(spec);
      const fmt = ARTIFACT_FORMATS[f];
      const bleed = spec.print ? 30 : 0;
      expect(r.width).toBe(fmt.width + bleed * 2);
      expect(r.height).toBe(fmt.height + bleed * 2);
      expect(r.svg).toContain("<svg");
      expect(r.svg).not.toMatch(/<script|javascript:|onload=/i);
    }
  });
  it("format drives composition: story, square and banner are laid out differently", () => {
    const comps = (
      ["social-square", "story", "banner", "flyer-a5"] as ArtifactFormatId[]
    ).map(
      (f) =>
        composeArtifact({
          format: f,
          brand: mk(),
          content: {
            ...content,
            bullets: f === "flyer-a5" ? ["a", "b", "c"] : [],
          },
        }).composition,
    );
    expect(new Set(comps).size).toBeGreaterThanOrEqual(3);
  });
  it("keeps text inside the canvas and clear of story chrome for short, long and awkward copy", () => {
    const heads = [
      "Open",
      "Clean fades and beard grooming in Lekki every day this week",
      "Supercalifragilisticexpialidocious barbershop appointment",
      "Ọ̀rọ̀ àgbà ní ilé ìwòsàn wa",
    ];
    for (const f of [
      "social-square",
      "story",
      "banner",
      "social-portrait",
    ] as ArtifactFormatId[])
      for (const headline of heads) {
        const spec = composeArtifact({
          format: f,
          brand: mk(),
          content: { ...content, headline: headline.slice(0, 80) },
        });
        const r = renderArtifactSvg(spec);
        const fmt = ARTIFACT_FORMATS[f];
        for (const b of r.boxes.filter(
          (x) => !["ticker", "cta-box", "brand"].includes(x.role),
        ))
          expect(b.x + b.w, `${f} ${b.role} right`).toBeLessThanOrEqual(
            fmt.width + 40,
          );
      }
  });
  it("works with no image (plate), and never ships a generated image the owner has not approved", () => {
    const noImg = composeArtifact({
      format: "social-square",
      brand: mk(),
      content,
    });
    expect(["plate", "none"]).toContain(noImg.media.kind);
    const gen = composeArtifact({
      format: "social-square",
      brand: mk(),
      content,
      hasImage: true,
      imageKind: "ai-generated",
      imageReview: "unreviewed",
      assetId: "m1",
    });
    expect(artifactIssues(gen).map((i) => i.code)).toContain(
      "MEDIA_UNREVIEWED",
    );
    const ok = composeArtifact({
      format: "social-square",
      brand: mk(),
      content,
      hasImage: true,
      imageKind: "ai-generated",
      imageReview: "owner-approved",
      assetId: "m1",
    });
    expect(artifactIssues(ok).map((i) => i.code)).not.toContain(
      "MEDIA_UNREVIEWED",
    );
    const owner = composeArtifact({
      format: "social-square",
      brand: mk(),
      content,
      hasImage: true,
      imageKind: "owner-supplied",
    });
    expect(artifactIssues(owner).map((i) => i.code)).toContain("MEDIA_MISSING");
  });
  it("escapes hostile text and invents no numbers", () => {
    const evil = composeArtifact({
      format: "social-square",
      brand: mk(),
      content: { ...content, headline: '</text><script>alert(1)</script>"&' },
    });
    const svg = renderArtifactSvg(evil).svg;
    expect(svg).not.toContain("<script");
    expect(svg).toMatch(/&lt;\/text&gt;/i);
    const claim = composeArtifact({
      format: "social-square",
      brand: mk(),
      content: { ...content, headline: "Over 500 happy clients" },
    });
    expect(
      artifactIssues(claim, { suppliedText: "Fade Lab Lekki" }).map(
        (i) => i.code,
      ),
    ).toContain("INVENTED_NUMBER");
  });
  it("one brand across channels: every artifact carries the same palette, type voice and brand hash", () => {
    const set = (
      ["social-square", "story", "banner", "flyer-a5"] as ArtifactFormatId[]
    ).map((f) => composeArtifact({ format: f, brand: mk(), content }));
    expect(
      new Set(
        set.map(
          (s) =>
            `${s.brand.typeVoice}|${s.brand.osHash}|${s.brand.palette.primary}`,
        ),
      ).size,
    ).toBe(1);
  });
  it("print artifacts add 3 mm bleed and say they are not press-ready", () => {
    const spec = composeArtifact({ format: "flyer-a5", brand: mk(), content });
    expect(spec.print).toBe(true);
    expect(renderArtifactSvg(spec).svg).toMatch(/viewBox="-30 -30 1540 2160"/);
  });
  it("every type voice has artifact font families", () => {
    for (const v of TYPE_VOICES) expect(VOICE_FAMILIES[v], v).toBeDefined();
  });
  it("brand OS version is bound into the artifact", () => {
    const os = brandOsFromDirection(direction, {
      name: "Fade Lab",
      palette: mk().palette,
      mode: "dark",
      ctas: ["Book a haircut"],
    });
    const spec = composeArtifact({
      format: "story",
      brand: { ...mk(), version: os.version, hash: brandOsHash(os) },
      content,
    });
    expect(spec.brand.osHash).toBe(brandOsHash(os));
  });
});
