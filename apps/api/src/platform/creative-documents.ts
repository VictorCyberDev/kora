import { z } from "zod";
import { loadDesignSkills, resolveVertical } from "@kora/creative";

/** Shared source-of-truth for editable graphics AND vector logos. Never accepts SVG markup from customers. */
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const coord = z.number().finite().min(-4000).max(8000);
const common = z.object({
  id: z.string().uuid(),
  x: coord,
  y: coord,
  width: z.number().finite().min(1).max(8000),
  height: z.number().finite().min(1).max(8000),
  rotation: z.number().finite().min(-360).max(360).default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  fill: color,
});
export const graphicLayerSchema = z.discriminatedUnion("type", [
  common.extend({
    type: z.literal("text"),
    text: z.string().max(700),
    fontSize: z.number().int().min(6).max(380),
    fontFamily: z
      .enum(["sans-serif", "serif", "monospace"])
      .default("sans-serif"),
    weight: z.enum(["400", "600", "700", "900"]).default("600"),
    align: z.enum(["left", "center", "right"]).default("left"),
  }),
  common.extend({
    type: z.literal("rect"),
    radius: z.number().min(0).max(400).default(0),
  }),
  common.extend({ type: z.literal("ellipse") }),
  common.extend({
    type: z.literal("path"),
    d: z
      .string()
      .min(1)
      .max(5000)
      .regex(/^[MLHVCSQTAZmlhvcsqtaz0-9+.,\s-]+$/),
    stroke: color.default("#242424"),
    strokeWidth: z.number().finite().min(0).max(100).default(2),
    // SVG path coordinates are not automatically resized with layer bounds.
    // Optional for backwards compatibility with existing editable sources.
    viewBoxWidth: z.number().finite().min(1).max(8000).optional(),
    viewBoxHeight: z.number().finite().min(1).max(8000).optional(),
  }),
  common.extend({
    type: z.literal("line"),
    strokeWidth: z.number().min(0.5).max(100).default(4),
  }),
  common.extend({
    type: z.literal("image"),
    src: z
      .string()
      .url()
      .max(2000)
      .refine((value) => value.startsWith("https://")),
    alt: z.string().min(1).max(200),
    fit: z.enum(["cover", "contain"]).default("cover"),
    focalX: z.number().finite().min(0).max(1).default(0.5),
    focalY: z.number().finite().min(0).max(1).default(0.5),
  }),
]);
export type GraphicLayer = z.infer<typeof graphicLayerSchema>;
export const slideSchema = z.object({
  id: z.string().uuid(),
  width: z.number().int().min(128).max(4096),
  height: z.number().int().min(128).max(4096),
  background: color,
  layers: z.array(graphicLayerSchema).max(80),
});
export const creativeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum([
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
  ]),
  title: z.string().trim().min(1).max(120),
  brandVersion: z.number().int().min(1).max(100000),
  approvedLogoId: z.string().uuid().nullable().default(null),
  logoForm: z
    .enum([
      "wordmark",
      "lettermark",
      "monogram",
      "geometric",
      "abstract",
      "combination",
      "emblem",
      "icon",
    ])
    .nullable()
    .default(null),
  slides: z.array(slideSchema).min(1).max(10),
  sourcePrompt: z.string().max(1000),
});
export type CreativeDocument = z.infer<typeof creativeDocumentSchema>;
export type CreativeKind = CreativeDocument["kind"];

export const createDocumentSchema = z.object({
  kind: creativeDocumentSchema.shape.kind,
  title: z.string().trim().min(1).max(120),
  headline: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).default(""),
  cta: z.string().trim().max(70).default(""),
  direction: z.number().int().min(0).max(2).default(0),
  slides: z.number().int().min(1).max(10).default(1),
  logoForm: z
    .enum([
      "wordmark",
      "lettermark",
      "monogram",
      "geometric",
      "abstract",
      "combination",
      "emblem",
      "icon",
    ])
    .default("combination"),
  customSize: z
    .object({
      width: z.number().int().min(128).max(4096),
      height: z.number().int().min(128).max(4096),
    })
    .optional(),
});
export const editDocumentSchema = z.object({
  revision: z.number().int().min(1),
  source: creativeDocumentSchema,
});
const uid = () => crypto.randomUUID();
function textLayer(
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  fill: string,
  weight: "400" | "600" | "700" | "900" = "600",
): Extract<GraphicLayer, { type: "text" }> {
  return {
    id: uid(),
    type: "text",
    x,
    y,
    width,
    height: Math.ceil(fontSize * 2.5),
    rotation: 0,
    opacity: 1,
    locked: false,
    fill,
    text,
    fontSize: Math.max(6, Math.min(380, Math.round(fontSize))),
    fontFamily: "sans-serif",
    weight,
    align: "left",
  };
}
/** Fit owner-supplied copy into a bounded multiline SVG text box without
 * dropping words, inventing claims or relying on browser-specific line wrapping. */
function fittedHeadline(
  copy: string,
  x: number,
  y: number,
  width: number,
  preferredSize: number,
  fill: string,
  weight: "400" | "600" | "700" | "900" = "900",
  maxHeight = Infinity,
): Extract<GraphicLayer, { type: "text" }> {
  const words = copy.trim().split(/\s+/).filter(Boolean);
  const wrap = (size: number) => {
    const maxChars = Math.max(8, Math.floor(width / (size * 0.63)));
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (line && line.length + 1 + word.length > maxChars) {
        lines.push(line);
        line = "";
      }
      if (word.length > maxChars) {
        if (line) lines.push(line);
        line = "";
        for (let i = 0; i < word.length; i += maxChars) {
          const part = word.slice(i, i + maxChars);
          if (part.length === maxChars) lines.push(part);
          else line = part;
        }
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let fontSize = Math.min(100, Math.max(22, preferredSize));
  let lines = wrap(fontSize);
  while (
    (lines.length > 3 || lines.length * fontSize * 1.2 > maxHeight) &&
    fontSize > 14
  ) {
    fontSize = Math.max(14, fontSize - 2);
    lines = wrap(fontSize);
  }
  const layer = textLayer(
    lines.join("\n"),
    x,
    y,
    width,
    fontSize,
    fill,
    weight,
  );
  layer.height = Math.ceil(fontSize * 1.28 * Math.max(1, lines.length));
  return layer;
}

function rectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  radius = 0,
): GraphicLayer {
  return {
    id: uid(),
    type: "rect",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    fill,
    radius,
  };
}
export function buildCreativeDocument(
  rawRequest: z.input<typeof createDocumentSchema>,
  brand: {
    version: number;
    name: string;
    typeVoice?: string;
    approvedLogo?: { id: string; source: CreativeDocument } | null;
    colors?: {
      background: string;
      foreground: string;
      primary: string;
      accent: string;
    };
  },
): CreativeDocument {
  const request = createDocumentSchema.parse(rawRequest);
  const brandName = brand.name.slice(0, 80);
  const colors = brand.colors ?? {
    background: "#faf7f2",
    foreground: "#18181b",
    primary: "#7c3329",
    accent: "#cb8d64",
  };
  // Use the same pinned first-party adaptation of design guidance as Website
  // Studio. Industry comes only from owner-supplied text; the approved BrandOS
  // type voice wins over an inferred category.
  const vertical = resolveVertical(
    [brandName, request.headline, request.description].join(" "),
  );
  const designType =
    request.kind === "logo"
      ? "logo"
      : request.kind === "carousel"
        ? "carousel"
        : "graphic";
  const skills = loadDesignSkills({ industry: vertical.cluster }, designType);
  const typographicDirection = skills.rules.some(
    (rule) => rule.effect === "typography-hierarchy",
  );
  const typeVoice = brand.typeVoice ?? "";
  const displayFamily: "sans-serif" | "serif" | "monospace" =
    typographicDirection &&
    (/serif|fashion|luxury|heritage|roman|craft/.test(typeVoice) ||
      (typeVoice.length === 0 &&
        ["food", "beauty", "hospitality", "creative"].includes(
          vertical.cluster,
        )))
      ? "serif"
      : typographicDirection && /technical|futurist|utility/.test(typeVoice)
        ? "monospace"
        : "sans-serif";
  // The user, not an inference model, supplies all factual marketing claims.
  const dimension = {
    flyer: [1080, 1350],
    poster: [1200, 1800],
    social: [1080, 1080],
    story: [1080, 1920],
    carousel: [1080, 1080],
    banner: [1600, 900],
    logo: [1000, 1000],
    ad: [1200, 628],
    thumbnail: [1280, 720],
    announcement: [1080, 1350],
    event: [1080, 1350],
    product: [1080, 1080],
  } as const;
  const [width, height] = request.customSize
    ? [request.customSize.width, request.customSize.height]
    : dimension[request.kind];
  const slideCount = request.kind === "carousel" ? request.slides : 1;
  const slides = Array.from({ length: slideCount }, (_, index) => {
    const variant = (request.direction + index) % 3;
    const background = variant === 1 ? colors.foreground : colors.background;
    const ink = variant === 1 ? colors.background : colors.foreground;
    const highlight = variant === 1 ? colors.accent : colors.primary;
    const header =
      index === 0 ? request.headline : request.description || request.headline;
    const layers: GraphicLayer[] = [];
    // Only the explicitly owner-approved logo may propagate. Its existing
    // vector geometry is reused, never hallucinated from the brand name.
    if (request.kind !== "logo" && brand.approvedLogo?.source.slides[0]) {
      for (const part of brand.approvedLogo.source.slides[0].layers
        .filter((l) => l.type !== "text")
        .slice(0, 8)) {
        const factor = 0.085;
        layers.push({
          ...part,
          ...(part.type === "path"
            ? {
                viewBoxWidth: part.viewBoxWidth ?? part.width,
                viewBoxHeight: part.viewBoxHeight ?? part.height,
              }
            : {}),
          id: uid(),
          x: Math.round(55 + part.x * factor),
          y: Math.round(25 + part.y * factor),
          width: Math.round(part.width * factor),
          height: Math.round(part.height * factor),
        });
      }
    }
    if (request.kind === "logo") {
      const form = request.logoForm;
      const words = brandName.match(/[A-Za-z0-9]+/g) ?? [];
      const initials = (
        words.length > 1
          ? words
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
          : brandName.slice(0, 2)
      ).toUpperCase();
      // True editable cubic and linear vector silhouettes, not letter tiles.
      const vectorMark = (d: string, fill: string): GraphicLayer => ({
        id: uid(),
        type: "path",
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
        rotation: 0,
        opacity: 1,
        locked: false,
        fill,
        d,
        stroke: fill,
        strokeWidth: 0,
      });
      const symbol = () => {
        if (variant === 0) {
          // Twin directional ribbons with a purposeful negative-space channel.
          layers.push(
            vectorMark(
              "M 155 675 L 360 205 L 545 675 L 408 675 L 360 505 L 292 675 Z",
              highlight,
            ),
          );
          layers.push(
            vectorMark(
              "M 490 675 L 680 205 L 870 675 L 735 675 L 680 505 L 625 675 Z",
              highlight,
            ),
          );
          layers.push(rectangle(320, 723, 415, 12, ink, 6));
        } else if (variant === 1) {
          // Open arch with a cut-through opening; reads at monochrome size.
          layers.push(
            vectorMark(
              "M 185 705 C 185 350 315 170 500 170 C 685 170 815 350 815 705 L 685 705 C 685 445 615 315 500 315 C 385 315 315 445 315 705 Z",
              highlight,
            ),
          );
          layers.push(rectangle(365, 760, 270, 18, ink, 8));
        } else {
          // Interlocking flowing surfaces; distinct from arches and ribbons.
          layers.push(
            vectorMark(
              "M 180 570 C 285 275 520 180 805 295 C 655 360 515 505 435 770 C 355 665 285 605 180 570 Z",
              highlight,
            ),
          );
          layers.push(
            vectorMark(
              "M 820 575 C 715 775 485 825 230 715 C 380 640 500 525 590 305 C 685 410 755 515 820 575 Z",
              ink,
            ),
          );
        }
      };
      const wordmark = (y: number, size = 84) => {
        const fit = Math.max(
          30,
          Math.min(size, 820 / (brandName.length * 0.58)),
        );
        const mark = textLayer(brandName, 90, y, 820, fit, ink, "700");
        mark.fontFamily = displayFamily;
        layers.push(mark);
      };
      if (form === "wordmark") {
        wordmark(360, 115);
        layers.push(
          rectangle(
            92,
            545,
            Math.min(800, brandName.length * 18),
            8,
            highlight,
            4,
          ),
        );
      } else if (form === "lettermark") {
        layers.push(textLayer(initials, 220, 190, 570, 290, highlight, "900"));
        layers.push(rectangle(210, 640, 570, 12, ink, 5));
      } else if (form === "monogram") {
        layers.push(rectangle(170, 140, 660, 660, highlight, 95));
        layers.push(textLayer(initials, 260, 260, 520, 250, background, "900"));
      } else if (form === "emblem") {
        layers.push({
          id: uid(),
          type: "ellipse",
          x: 155,
          y: 115,
          width: 690,
          height: 690,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: highlight,
        });
        layers.push({
          id: uid(),
          type: "ellipse",
          x: 205,
          y: 165,
          width: 590,
          height: 590,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: background,
        });
        layers.push(textLayer(initials, 380, 300, 400, 165, ink, "900"));
        wordmark(820, 52);
      } else {
        symbol();
        if (form === "combination" || form === "geometric") wordmark(825, 70);
        if (form === "abstract") {
          // Interlocking geometric negative space is editable and distinct.
          layers.push({
            id: uid(),
            type: "ellipse",
            x: 390,
            y: 335,
            width: 210,
            height: 210,
            rotation: 0,
            opacity: 1,
            locked: false,
            fill: background,
          });
        }
      }
    } else {
      // Different editorial systems rather than the same poster recolored.
      // Every visible word still comes exclusively from the owner brief.
      const margin = Math.round(width * 0.075);
      const headlineSize = Math.min(100, Math.round(width * 0.082));
      if (variant === 0) {
        // Editorial: generous paper, a large serif declaration and a fine rule.
        layers.push(rectangle(0, 0, width, 22, highlight));
        const identity = textLayer(
          brandName.toUpperCase(),
          margin,
          Math.round(height * 0.09),
          width - margin * 2,
          28,
          ink,
          "700",
        );
        layers.push(identity);
        layers.push(
          rectangle(
            margin,
            Math.round(height * 0.2),
            width * 0.18,
            6,
            highlight,
          ),
        );
        const headlineTop = Math.round(height * 0.29);
        const hasSupportingCopy =
          index === 0 &&
          !!request.description &&
          request.description.trim() !== header.trim();
        const headlineBottom = Math.round(
          height * (hasSupportingCopy ? 0.56 : request.cta ? 0.77 : 0.93),
        );
        const headline = fittedHeadline(
          header,
          margin,
          headlineTop,
          width - margin * 2,
          headlineSize,
          ink,
          "700",
          headlineBottom - headlineTop,
        );
        headline.fontFamily = displayFamily;
        layers.push(headline);
        if (hasSupportingCopy) {
          const descriptionTop = Math.max(
            Math.round(height * 0.57),
            headlineTop + headline.height + 12,
          );
          const descriptionBottom = Math.round(
            height * (request.cta ? 0.76 : 0.94),
          );
          if (descriptionBottom > descriptionTop + 16) {
            layers.push(
              fittedHeadline(
                request.description,
                margin,
                descriptionTop,
                width - margin * 2,
                30,
                ink,
                "400",
                descriptionBottom - descriptionTop,
              ),
            );
          }
        }
        if (request.cta) {
          layers.push(
            rectangle(
              margin,
              Math.round(height * 0.79),
              width * 0.55,
              90,
              highlight,
              8,
            ),
          );
          layers.push(
            textLayer(
              request.cta,
              margin + 24,
              Math.round(height * 0.805),
              width * 0.5,
              30,
              background,
              "700",
            ),
          );
        }
      } else if (variant === 1) {
        // Cinematic: dark surround and a centered typographic composition.
        layers.push(
          rectangle(0, 0, Math.round(width * 0.018), height, highlight),
        );
        layers.push(
          rectangle(width * 0.33, height * 0.19, width * 0.34, 5, highlight),
        );
        const identity = textLayer(
          brandName.toUpperCase(),
          margin,
          Math.round(height * 0.08),
          width - margin * 2,
          26,
          ink,
          "600",
        );
        identity.align = "center";
        layers.push(identity);
        const hasDescription =
          index === 0 &&
          !!request.description &&
          request.description.trim() !== header.trim();
        const headlineStart = Math.round(height * 0.32);
        const headlineEnd = Math.round(
          height * (hasDescription ? 0.57 : request.cta ? 0.8 : 0.95),
        );
        const headline = fittedHeadline(
          header,
          margin,
          headlineStart,
          width - margin * 2,
          Math.round(headlineSize * 0.92),
          ink,
          "900",
          headlineEnd - headlineStart,
        );
        headline.align = "center";
        headline.fontFamily = displayFamily;
        layers.push(headline);
        if (hasDescription) {
          const descriptionTop = Math.max(
            Math.round(height * 0.59),
            headlineStart + headline.height + 12,
          );
          const descriptionBottom = Math.round(
            height * (request.cta ? 0.79 : 0.95),
          );
          if (descriptionBottom > descriptionTop + 16) {
            const description = fittedHeadline(
              request.description,
              margin * 1.5,
              descriptionTop,
              width - margin * 3,
              30,
              ink,
              "400",
              descriptionBottom - descriptionTop,
            );
            description.align = "center";
            layers.push(description);
          }
        }
        if (request.cta) {
          const action = textLayer(
            request.cta,
            margin,
            Math.round(height * 0.82),
            width - margin * 2,
            31,
            highlight,
            "700",
          );
          action.align = "center";
          layers.push(action);
        }
      } else {
        // Asymmetric: a strong color field and a narrow right-hand editorial column.
        const rail = Math.round(width * 0.26);
        const gap = Math.round(width * 0.06);
        const left = rail + gap;
        const available = width - left - margin;
        layers.push(rectangle(0, 0, rail, height, highlight));
        layers.push(
          rectangle(
            left,
            Math.round(height * 0.23),
            available * 0.24,
            6,
            highlight,
          ),
        );
        const identity = textLayer(
          brandName.toUpperCase(),
          left,
          Math.round(height * 0.09),
          available,
          27,
          ink,
          "700",
        );
        layers.push(identity);
        const hasDescription =
          index === 0 &&
          !!request.description &&
          request.description.trim() !== header.trim();
        const headlineStart = Math.round(height * 0.32);
        const headlineEnd = Math.round(
          height * (hasDescription ? 0.58 : request.cta ? 0.79 : 0.94),
        );
        const headline = fittedHeadline(
          header,
          left,
          headlineStart,
          available,
          Math.round(headlineSize * 0.72),
          ink,
          "900",
          headlineEnd - headlineStart,
        );
        headline.fontFamily = displayFamily;
        layers.push(headline);
        if (hasDescription) {
          const descriptionTop = Math.max(
            Math.round(height * 0.6),
            headlineStart + headline.height + 12,
          );
          const descriptionBottom = Math.round(
            height * (request.cta ? 0.78 : 0.94),
          );
          if (descriptionBottom > descriptionTop + 16) {
            layers.push(
              fittedHeadline(
                request.description,
                left,
                descriptionTop,
                available,
                28,
                ink,
                "400",
                descriptionBottom - descriptionTop,
              ),
            );
          }
        }
        if (request.cta) {
          layers.push(
            rectangle(left, Math.round(height * 0.81), available, 88, ink, 8),
          );
          layers.push(
            textLayer(
              request.cta,
              left + 18,
              Math.round(height * 0.825),
              available - 36,
              27,
              background,
              "700",
            ),
          );
        }
      }
    }
    return { id: uid(), width, height, background, layers };
  });
  return creativeDocumentSchema.parse({
    schemaVersion: 1,
    kind: request.kind,
    title: request.title,
    brandVersion: brand.version,
    approvedLogoId: brand.approvedLogo?.id ?? null,
    logoForm: request.kind === "logo" ? request.logoForm : null,
    slides,
    sourcePrompt: request.headline,
  });
}
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
export function renderSlideSvg(slide: z.infer<typeof slideSchema>): string {
  const safe = slideSchema.parse(slide);
  const contents = safe.layers
    .map((layer) => {
      const transform = `translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width / 2} ${layer.height / 2})`;
      const attributes = `opacity="${layer.opacity}" transform="${transform}"`;
      if (layer.type === "rect")
        return `<rect ${attributes} width="${layer.width}" height="${layer.height}" rx="${layer.radius}" fill="${layer.fill}"/>`;
      if (layer.type === "ellipse")
        return `<ellipse ${attributes} cx="${layer.width / 2}" cy="${layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="${layer.fill}"/>`;
      if (layer.type === "path") {
        const scaleX = layer.width / (layer.viewBoxWidth ?? layer.width);
        const scaleY = layer.height / (layer.viewBoxHeight ?? layer.height);
        return `<path opacity="${layer.opacity}" transform="${transform} scale(${scaleX} ${scaleY})" d="${esc(layer.d)}" fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}"/>`;
      }
      if (layer.type === "image") {
        const x =
          layer.focalX < 1 / 3
            ? "xMin"
            : layer.focalX > 2 / 3
              ? "xMax"
              : "xMid";
        const y =
          layer.focalY < 1 / 3
            ? "YMin"
            : layer.focalY > 2 / 3
              ? "YMax"
              : "YMid";
        return `<image ${attributes} width="${layer.width}" height="${layer.height}" href="${esc(layer.src)}" preserveAspectRatio="${x}${y} ${layer.fit === "cover" ? "slice" : "meet"}"/>`;
      }
      if (layer.type === "line")
        return `<line ${attributes} x1="0" y1="0" x2="${layer.width}" y2="${layer.height}" stroke-width="${layer.strokeWidth}" stroke="${layer.fill}"/>`;
      const anchor =
        layer.align === "center"
          ? "middle"
          : layer.align === "right"
            ? "end"
            : "start";
      const anchorX =
        layer.align === "center"
          ? layer.width / 2
          : layer.align === "right"
            ? layer.width
            : 0;
      const lines = layer.text
        .split("\n")
        .slice(0, 12)
        .map(
          (line, i) =>
            `<tspan x="${anchorX}" dy="${i === 0 ? layer.fontSize : layer.fontSize * 1.2}">${esc(line)}</tspan>`,
        )
        .join("");
      return `<text ${attributes} font-family="${layer.fontFamily}" font-size="${layer.fontSize}" font-weight="${layer.weight}" text-anchor="${anchor}" fill="${layer.fill}">${lines}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safe.width} ${safe.height}" width="${safe.width}" height="${safe.height}" role="img"><rect width="100%" height="100%" fill="${safe.background}"/>${contents}</svg>`;
}
