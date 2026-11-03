import { describe, expect, it } from "vitest";
import { BrandKitSchema } from "./brand.js";
import {
  MotionSpecSchema,
  motionFrameSvg,
  motionStyleFromGenome,
  previewTimes,
} from "./motion.js";

const kit = BrandKitSchema.parse({
  colors: {
    ink: "#1a1410",
    canvas: "#f6efe6",
    primary: "#5a2d1a",
    primaryText: "#fff7ef",
    accent: "#c2542d",
    accentText: "#ffffff",
    muted: "#6b5f55",
  },
  typography: {
    pairing: "x",
    displayFamily: "Fraunces",
    bodyFamily: "Work Sans",
  },
  shape: "soft",
  voice: { tone: "warm", avoid: [] },
  imagery: { style: "minimal", seed: 3 },
});
const base = {
  template: "offer_reveal" as const,
  format: "story" as const,
  headline: "Birthday cakes",
  subline: "Message us on WhatsApp",
  items: ["Cupcakes", "Small chops"],
  cta: "Order on WhatsApp",
  contact: "+2348012345678",
  durationSec: 7,
};
const genome = (o: Record<string, string> = {}) => ({
  motionIntensity: "measured",
  motionCharacter: "float",
  headlineBehavior: "sentence",
  radiusStyle: "soft",
  ...o,
});

describe("motion follows the brand's genome", () => {
  it("restrained brands are slower, never overshoot and travel less", () => {
    const s = motionStyleFromGenome(genome({ motionIntensity: "restrained" }));
    expect(s.speed).toBeLessThan(1);
    expect(s.overshoot).toBe(false);
    expect(s.travel).toBeLessThan(1);
  });
  it("loud brands are quicker and travel further", () => {
    const s = motionStyleFromGenome(genome({ motionIntensity: "expressive" }));
    expect(s.speed).toBeGreaterThan(1);
    expect(s.travel).toBeGreaterThan(1);
  });
  it("uppercase brands set the headline in capitals; radius follows the brand", () => {
    const s = motionStyleFromGenome(
      genome({ headlineBehavior: "uppercase", radiusStyle: "none" }),
    );
    expect(s.uppercase).toBe(true);
    expect(s.radius).toBe(0);
    const svg = motionFrameSvg(
      MotionSpecSchema.parse({ ...base, style: s }),
      kit,
      "Tola's Cakes",
      6,
    ).svg;
    expect(svg).toContain(">BIRTHDAY<");
    expect(svg).toContain(">CAKES<");
    expect(svg).not.toMatch(/>Birthday</);
  });
  it("a style changes the frames, the same style gives the same frame, and no style is unchanged", () => {
    const plain = MotionSpecSchema.parse(base);
    const calm = MotionSpecSchema.parse({
      ...base,
      style: motionStyleFromGenome(genome({ motionIntensity: "restrained" })),
    });
    const f = (sp: typeof plain, t: number) =>
      motionFrameSvg(sp, kit, "Tola's Cakes", t).svg;
    expect(f(calm, 1.5)).not.toBe(f(plain, 1.5));
    expect(f(calm, 1.5)).toBe(f(calm, 1.5));
    // the end state is complete whatever the pace
    expect(f(calm, 6.9)).toContain("Order on WhatsApp");
  });
  it("every brand still finishes its entrance by the last poster frame, even on a short video", () => {
    for (const intensity of ["restrained", "measured", "expressive"]) {
      const sp = MotionSpecSchema.parse({
        ...base,
        durationSec: 4,
        style: motionStyleFromGenome(genome({ motionIntensity: intensity })),
      });
      const last = previewTimes(sp).at(-1)!;
      const svg = motionFrameSvg(sp, kit, "Tola's Cakes", last).svg;
      expect(svg).toContain("Order on WhatsApp");
      expect(svg).toContain("+2348012345678");
    }
  });
  it("bad styles are refused by the schema rather than rendered", () => {
    expect(() =>
      MotionSpecSchema.parse({ ...base, style: { speed: 50 } }),
    ).toThrow();
    expect(() =>
      MotionSpecSchema.parse({ ...base, style: { evil: true } }),
    ).toThrow();
  });
});
