import { describe, it, expect } from "vitest";
import {
  buildCreativeDocument,
  creativeDocumentSchema,
  renderSlideSvg,
} from "./creative-documents.js";
const brand = {
  version: 3,
  name: "Meridian Bakes",
  colors: {
    background: "#f8f3e9",
    foreground: "#202020",
    primary: "#86512e",
    accent: "#dd9f73",
  },
};
describe("Krevstudio editable documents", () => {
  it.each([
    "flyer",
    "poster",
    "social",
    "story",
    "carousel",
    "banner",
    "logo",
    "ad",
    "thumbnail",
    "announcement",
    "event",
    "product",
  ] as const)("produces a schema-valid brand-bound %s", (kind) => {
    const doc = buildCreativeDocument(
      {
        kind,
        title: "Launch",
        headline: "Sourdough and pastries",
        description: "Fresh bread",
        cta: "Message us",
        direction: 0,
        slides: kind === "carousel" ? 4 : 1,
      },
      brand,
    );
    expect(creativeDocumentSchema.parse(doc)).toEqual(doc);
    expect(doc.brandVersion).toBe(3);
    expect(doc.slides).toHaveLength(kind === "carousel" ? 4 : 1);
    expect(doc.slides[0]!.layers.length).toBeGreaterThan(1);
    expect(renderSlideSvg(doc.slides[0]!)).toContain(
      'xmlns="http://www.w3.org/2000/svg"',
    );
  });
  it("escapes supplied text and never embeds scripts or foreign SVG", () => {
    const doc = buildCreativeDocument(
      {
        kind: "flyer",
        title: "Test",
        headline: '<script>alert("no")</script>',
        description: "",
        cta: "",
        direction: 1,
        slides: 1,
      },
      brand,
    );
    const svg = renderSlideSvg(doc.slides[0]!);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
  it("builds structurally distinct editable layouts, not three color swaps", () => {
    const rendered = [0, 1, 2].map((direction) =>
      buildCreativeDocument(
        {
          kind: "flyer",
          title: "Launch flyer",
          headline: "Artisan sourdough and pastries",
          description: "Made locally",
          cta: "Contact us",
          direction,
        },
        brand,
      ),
    );
    const signatures = rendered.map((doc) =>
      doc.slides[0]!.layers.map((layer) => ({
        type: layer.type,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        align: layer.type === "text" ? layer.align : null,
      })),
    );
    expect(new Set(signatures.map((s) => JSON.stringify(s))).size).toBe(3);
    expect(
      rendered[1]!.slides[0]!.layers.some(
        (layer) => layer.type === "text" && layer.align === "center",
      ),
    ).toBe(true);
    expect(
      rendered[2]!.slides[0]!.layers.some(
        (layer) =>
          layer.type === "rect" &&
          layer.height === rendered[2]!.slides[0]!.height,
      ),
    ).toBe(true);
  });
  it("fits long owner-supplied headings without losing content", () => {
    const headline =
      "Artisan sourdough, handmade pastries and celebration cakes for important moments";
    for (const direction of [0, 1, 2]) {
      const doc = buildCreativeDocument(
        { kind: "social", title: "Bakery story", headline, direction },
        brand,
      );
      const text = doc.slides[0]!.layers.find(
        (layer) => layer.type === "text" && layer.text.includes("sourdough"),
      );
      expect(text).toBeDefined();
      if (!text || text.type !== "text") continue;
      expect(text.text.replace(/\n/g, " ").replace(/\s+/g, " ")).toBe(headline);
      expect(text.text.split("\n").length).toBeGreaterThan(1);
      for (const line of text.text.split("\n"))
        expect(line.length * text.fontSize * 0.63).toBeLessThanOrEqual(
          text.width + 2,
        );
      expect(text.y + text.height).toBeLessThanOrEqual(doc.slides[0]!.height);
    }
  });
  it("keeps short-format advertisement headlines clear of the CTA and avoids duplicate copy", () => {
    const headline =
      "Artisan sourdough, pastries and celebration cakes";
    const slide = buildCreativeDocument(
      {
        kind: "ad",
        title: "Meridian bakery advertisement",
        headline,
        description: headline,
        cta: "Contact us",
        direction: 0,
      },
      brand,
    ).slides[0]!;
    const headlineLayer = slide.layers.find(
      (layer) =>
        layer.type === "text" &&
        layer.text.replace(/\\n/g, " ") === headline,
    );
    const ctaLayer = slide.layers.find(
      (layer) => layer.type === "text" && layer.text === "Contact us",
    );
    expect(headlineLayer?.type).toBe("text");
    expect(ctaLayer?.type).toBe("text");
    if (headlineLayer?.type !== "text" || ctaLayer?.type !== "text")
      return;
    expect(headlineLayer.y + headlineLayer.height).toBeLessThan(
      ctaLayer.y - 12,
    );
    expect(
      slide.layers.filter(
        (layer) =>
          layer.type === "text" &&
          layer.text.replace(/\\n/g, " ") === headline,
      ),
    ).toHaveLength(1);
  });
  it("honors approved BrandOS typography across generated artwork", () => {
    const copy = "Custom cakes for celebrations";
    const serif = buildCreativeDocument(
      { kind: "poster", title: "Launch", headline: copy },
      { ...brand, typeVoice: "heritage-serif" },
    );
    const technical = buildCreativeDocument(
      { kind: "poster", title: "Launch", headline: copy },
      { ...brand, typeVoice: "technical-grotesk" },
    );
    const family = (doc: typeof serif) =>
      doc.slides[0]!.layers.find(
        (layer) =>
          layer.type === "text" &&
          layer.text.replace(/\n/g, " ").includes(copy),
      );
    const serifHeadline = family(serif);
    const technicalHeadline = family(technical);
    expect(serifHeadline).toMatchObject({ fontFamily: "serif" });
    expect(technicalHeadline).toMatchObject({ fontFamily: "monospace" });
  });
  it("does not fabricate a sale amount or deadline", () => {
    const doc = buildCreativeDocument(
      {
        kind: "poster",
        title: "Campaign",
        headline: "Our offers",
        description: "",
        cta: "",
        direction: 2,
        slides: 1,
      },
      brand,
    );
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/30% off|save 50%|tomorrow only/i);
  });
  it("generates genuinely different editable vector compositions", () => {
    const create = (direction: number) =>
      buildCreativeDocument(
        {
          kind: "logo",
          title: "Identity",
          headline: "Meridian Bakes",
          description: "",
          cta: "",
          direction,
          slides: 1,
        },
        brand,
      ).slides[0]!;
    const a = create(0),
      b = create(1),
      c = create(2);
    expect(
      new Set(
        [a, b, c].map((x) =>
          JSON.stringify(
            x.layers.map((l) => [l.type, l.x, l.y, l.width, l.height]),
          ),
        ),
      ).size,
    ).toBe(3);
    for (const form of [
      "wordmark",
      "lettermark",
      "monogram",
      "geometric",
      "abstract",
      "combination",
      "emblem",
      "icon",
    ] as const) {
      const result = buildCreativeDocument(
        {
          kind: "logo",
          title: "Identity",
          headline: "Meridian Bakes",
          logoForm: form,
        },
        brand,
      );
      expect(result.logoForm).toBe(form);
      expect(renderSlideSvg(result.slides[0]!)).toContain("<svg");
      expect(result.slides[0]!.layers.length).toBeGreaterThan(0);
    }
  });
  it("renders vector-first abstract marks with distinct paths across directions", () => {
    const sources = [0, 1, 2].map((direction) =>
      buildCreativeDocument(
        {
          kind: "logo",
          title: "Brand identity",
          headline: "Meridian Bakes",
          logoForm: "abstract",
          direction,
        },
        brand,
      ),
    );
    const designs = sources.map((doc) => {
      const paths = doc.slides[0]!.layers.filter(
        (layer) => layer.type === "path",
      );
      expect(paths.length).toBeGreaterThan(0);
      const svg = renderSlideSvg(doc.slides[0]!);
      expect(svg).toContain("<path");
      expect(svg).not.toContain("<script>");
      return paths.map((layer) => layer.d).join(" ");
    });
    expect(new Set(designs).size).toBe(3);
  });
  it("scales approved vector path coordinates to a small campaign logo", () => {
    const logo = buildCreativeDocument(
      {
        kind: "logo",
        title: "Logo",
        headline: "Meridian Bakes",
        logoForm: "abstract",
        direction: 0,
      },
      brand,
    );
    const sourcePath = logo.slides[0]!.layers.find(
      (layer) => layer.type === "path",
    );
    expect(sourcePath).toBeDefined();
    const campaign = buildCreativeDocument(
      {
        kind: "flyer",
        title: "Campaign",
        headline: "Artisan sourdough",
        direction: 0,
      },
      {
        ...brand,
        approvedLogo: { id: crypto.randomUUID(), source: logo },
      },
    );
    const reused = campaign.slides[0]!.layers.find(
      (layer) => layer.type === "path",
    );
    expect(reused).toBeDefined();
    expect(reused!.width).toBeLessThan(sourcePath!.width);
    if (reused?.type !== "path" || sourcePath?.type !== "path") {
      throw new Error("Expected an editable vector path");
    }
    expect(reused.viewBoxWidth).toBe(sourcePath.width);
    expect(reused.viewBoxHeight).toBe(sourcePath.height);
    const svg = renderSlideSvg(campaign.slides[0]!);
    expect(svg).toContain(
      `scale(${reused.width / sourcePath.width} ${reused.height / sourcePath.height})`,
    );
  });
  it("honors bounded custom sizes without exceeding source schema", () => {
    const doc = buildCreativeDocument(
      {
        kind: "ad",
        title: "Offer",
        headline: "Our custom ad",
        customSize: { width: 1400, height: 760 },
      },
      brand,
    );
    expect(doc.slides[0]!.width).toBe(1400);
    expect(doc.slides[0]!.height).toBe(760);
    expect(() =>
      buildCreativeDocument(
        {
          kind: "ad",
          title: "Bad",
          headline: "Oversize",
          customSize: { width: 90000, height: 760 },
        },
        brand,
      ),
    ).toThrow();
  });
  it("preserves left, center and right text alignment in actual SVG output", () => {
    const doc = buildCreativeDocument(
      { kind: "flyer", title: "Aligned", headline: "Meridian Bakes" },
      brand,
    );
    const text = doc.slides[0]!.layers.find((layer) => layer.type === "text");
    expect(text).toBeDefined();
    for (const [align, anchor, x] of [
      ["left", "start", 0],
      ["center", "middle", text!.width / 2],
      ["right", "end", text!.width],
    ] as const) {
      const layer = { ...text!, align };
      const svg = renderSlideSvg({
        ...doc.slides[0]!,
        layers: [layer],
      });
      expect(svg).toContain(`text-anchor="${anchor}"`);
      expect(svg).toContain(`<tspan x="${x}"`);
    }
  });
  it("saves vector paths and rejects injected SVG or external references", () => {
    const doc = buildCreativeDocument(
      {
        kind: "logo",
        title: "Icon",
        headline: "Meridian Bakes",
        logoForm: "icon",
      },
      brand,
    );
    const layer = doc.slides[0]!.layers[0]!;
    const path = {
      ...layer,
      type: "path",
      d: "M 0 20 C 40 0 90 100 130 20 Z",
      stroke: "#202020",
      strokeWidth: 3,
    };
    const slide = { ...doc.slides[0]!, layers: [path] };
    expect(renderSlideSvg(slide as (typeof doc.slides)[0])).toContain(
      'd="M 0 20 C 40 0 90 100 130 20 Z"',
    );
    expect(() =>
      renderSlideSvg({
        ...slide,
        layers: [{ ...path, d: "M 0 0 <script>alert(1)</script>" }],
      } as (typeof doc.slides)[0]),
    ).toThrow();
    expect(() =>
      renderSlideSvg({
        ...slide,
        layers: [{ ...path, d: "M 0 0 url(https://example.com/x)" }],
      } as (typeof doc.slides)[0]),
    ).toThrow();
  });
  it("keeps image focal cropping editable and bounded during SVG export", () => {
    const doc = buildCreativeDocument(
      { kind: "flyer", title: "Photo flyer", headline: "Fresh pastries" },
      brand,
    );
    const image = {
      id: crypto.randomUUID(),
      type: "image" as const,
      x: 50,
      y: 90,
      width: 600,
      height: 500,
      rotation: 0,
      opacity: 1,
      locked: false,
      fill: "#ffffff",
      src: "https://example.com/approved.webp",
      alt: "Approved bakery photo",
      fit: "cover" as const,
      focalX: 1,
      focalY: 0,
    };
    const slide = { ...doc.slides[0]!, layers: [image] };
    expect(renderSlideSvg(slide)).toContain(
      'preserveAspectRatio="xMaxYMin slice"',
    );
    expect(() =>
      renderSlideSvg({
        ...slide,
        layers: [{ ...image, focalX: 1.5 }],
      }),
    ).toThrow();
  });
  it("rejects unsafe layer data and excessive resource use", () => {
    const doc = buildCreativeDocument(
      {
        kind: "social",
        title: "Launch",
        headline: "New products",
        description: "",
        cta: "",
        direction: 0,
        slides: 1,
      },
      brand,
    );
    expect(() =>
      creativeDocumentSchema.parse({
        ...doc,
        slides: [
          {
            ...doc.slides[0]!,
            layers: [
              {
                ...doc.slides[0]!.layers[0]!,
                fill: "url(https://evil.example)",
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      creativeDocumentSchema.parse({
        ...doc,
        slides: Array.from({ length: 11 }, () => doc.slides[0]!),
      }),
    ).toThrow();
  });
});
