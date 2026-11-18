import { describe, it, expect } from "vitest";
import { buildCreativeDocument } from "./creative-documents.js";
import {
  assessCreativeSource,
  repairCreativeGeometry,
} from "./creative-evaluation.js";
const brand = { version: 2, name: "Meridian Bakes" };
describe("Krevstudio creative source quality", () => {
  it("recognizes structurally valid graphics without inventing an aesthetic score", () => {
    const doc = buildCreativeDocument(
      {
        kind: "flyer",
        title: "Launch",
        headline: "Fresh daily",
        cta: "Contact us",
      },
      brand,
    );
    expect(
      assessCreativeSource(doc).filter((x) => x.severity === "BLOCKER"),
    ).toEqual([]);
  });
  it("does not permit invisible objects to pass the owner approval gate", () => {
    const doc = buildCreativeDocument(
      { kind: "poster", title: "Poster", headline: "New opening" },
      brand,
    );
    doc.slides[0]!.layers[0]!.x = 6000;
    expect(
      assessCreativeSource(doc).some((x) => x.code === "LAYER_OUTSIDE_CANVAS"),
    ).toBe(true);
    const fixed = repairCreativeGeometry(doc);
    expect(fixed.changes).toHaveLength(1);
    expect(
      assessCreativeSource(fixed.source).some(
        (x) => x.code === "LAYER_OUTSIDE_CANVAS",
      ),
    ).toBe(false);
    expect(doc.slides[0]!.layers[0]!.x).toBe(6000);
  });
  it("flags a visible empty text layer for owner revision instead of inventing copy", () => {
    const doc = buildCreativeDocument(
      { kind: "social", title: "Post", headline: "Original claim" },
      brand,
    );
    const text = doc.slides[0]!.layers.find((l) => l.type === "text");
    if (!text) throw Error("Generated text not found");
    text.text = "";
    expect(assessCreativeSource(doc).some((x) => x.code === "EMPTY_TEXT")).toBe(
      true,
    );
    expect(
      repairCreativeGeometry(doc).source.slides[0]!.layers.find(
        (l) => l.id === text.id,
      ),
    ).toEqual(text);
  });
});
