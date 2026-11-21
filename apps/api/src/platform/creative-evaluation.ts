import type { CreativeDocument } from "./creative-documents.js";
export type CreativeFinding = {
  severity: "BLOCKER" | "WARNING" | "INFO";
  code: string;
  slide: number;
  layerId?: string;
  message: string;
};
/** Objective source checks; these are not a substitute for independent screenshot or human review. */
export function assessCreativeSource(
  source: CreativeDocument,
): CreativeFinding[] {
  const findings: CreativeFinding[] = [];
  source.slides.forEach((slide, index) => {
    const slideNum = index + 1;
    const texts = slide.layers.filter((l) => l.type === "text");
    if (!texts.length && source.kind !== "logo")
      findings.push({
        severity: "WARNING",
        code: "NO_TEXT",
        slide: slideNum,
        message: "This slide has no editable message.",
      });
    // Deterministic typographic collision gate. Use glyph-height estimates,
    // not the larger editable layer handle rectangles. Ignore logos because
    // geometric letter overlays may intentionally intersect in a monogram.
    if (source.kind !== "logo") {
      for (let i = 0; i < texts.length; i++) {
        const a = texts[i]!;
        if (a.rotation !== 0 || !a.text.trim()) continue;
        const aHeight = Math.min(
          a.height,
          a.fontSize * 1.2 * a.text.split("\\n").length,
        );
        for (let j = i + 1; j < texts.length; j++) {
          const b = texts[j]!;
          if (b.rotation !== 0 || !b.text.trim()) continue;
          const bHeight = Math.min(
            b.height,
            b.fontSize * 1.2 * b.text.split("\\n").length,
          );
          const horizontal = Math.min(a.x + a.width, b.x + b.width) -
            Math.max(a.x, b.x);
          const vertical = Math.min(a.y + aHeight, b.y + bHeight) -
            Math.max(a.y, b.y);
          if (
            horizontal > Math.min(a.width, b.width) * 0.15 &&
            vertical > Math.min(aHeight, bHeight) * 0.2
          ) {
            findings.push({
              severity: "BLOCKER",
              code: "TEXT_COLLISION",
              slide: slideNum,
              layerId: b.id,
              message: "Two visible text blocks overlap; adjust their layout before export.",
            });
          }
        }
      }
    }
    for (const layer of slide.layers) {
      if (
        layer.x + layer.width < 0 ||
        layer.y + layer.height < 0 ||
        layer.x > slide.width ||
        layer.y > slide.height
      ) {
        findings.push({
          severity: "BLOCKER",
          code: "LAYER_OUTSIDE_CANVAS",
          slide: slideNum,
          layerId: layer.id,
          message:
            "A layer sits entirely outside the canvas and cannot be seen.",
        });
      }
      if (layer.type === "text") {
        if (!layer.text.trim())
          findings.push({
            severity: "BLOCKER",
            code: "EMPTY_TEXT",
            slide: slideNum,
            layerId: layer.id,
            message: "Empty text objects should be edited or removed.",
          });
        if (layer.fontSize < 14)
          findings.push({
            severity: "WARNING",
            code: "SMALL_TEXT",
            slide: slideNum,
            layerId: layer.id,
            message: "Text may be hard to read at this export size.",
          });
        const lines = layer.text.split("\n");
        const longest = Math.max(0, ...lines.map((l) => l.length));
        if (longest * layer.fontSize * 0.46 > layer.width * 1.6)
          findings.push({
            severity: "WARNING",
            code: "TEXT_MAY_OVERFLOW",
            slide: slideNum,
            layerId: layer.id,
            message:
              "The text is long for this text box. Check the real render.",
          });
      }
      if (layer.type === "image" && !layer.alt.trim())
        findings.push({
          severity: "BLOCKER",
          code: "PHOTO_DESCRIPTION",
          slide: slideNum,
          layerId: layer.id,
          message: "Approved photos require useful alternative text.",
        });
    }
  });
  return findings;
}
/** Bounded geometric fixes only. Copy remains intact and untouched. */
export function repairCreativeGeometry(source: CreativeDocument): {
  source: CreativeDocument;
  changes: { slide: number; layerId: string; action: string }[];
} {
  const clone = structuredClone(source);
  const changes: { slide: number; layerId: string; action: string }[] = [];
  clone.slides.forEach((slide, i) => {
    for (const layer of slide.layers) {
      if (
        layer.x > slide.width ||
        layer.y > slide.height ||
        layer.x + layer.width < 0 ||
        layer.y + layer.height < 0
      ) {
        layer.x = Math.max(8, Math.min(slide.width - layer.width - 8, layer.x));
        layer.y = Math.max(
          8,
          Math.min(slide.height - layer.height - 8, layer.y),
        );
        changes.push({
          slide: i + 1,
          layerId: layer.id,
          action: "Move fully offscreen layer inside canvas",
        });
      }
    }
  });
  return { source: clone, changes };
}
