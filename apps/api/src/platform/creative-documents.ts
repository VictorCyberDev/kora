import { z } from "zod";

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
  logoForm:z.enum(["wordmark","lettermark","monogram","geometric","abstract","combination","emblem","icon"]).nullable().default(null),
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
  logoForm:z.enum(["wordmark","lettermark","monogram","geometric","abstract","combination","emblem","icon"]).default("combination"),
  customSize:z.object({width:z.number().int().min(128).max(4096),height:z.number().int().min(128).max(4096)}).optional(),
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
): GraphicLayer {
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
    fontSize,
    fontFamily: "sans-serif",
    weight,
    align: "left",
  };
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
  request: z.infer<typeof createDocumentSchema>,
  brand: {
    version: number;
    name: string;
    approvedLogo?: { id: string; source: CreativeDocument } | null;
    colors?: {
      background: string;
      foreground: string;
      primary: string;
      accent: string;
    };
  },
): CreativeDocument {
  const brandName = brand.name.slice(0, 80);
  const colors = brand.colors ?? {
    background: "#faf7f2",
    foreground: "#18181b",
    primary: "#7c3329",
    accent: "#cb8d64",
  };
  // The user, not an inference model, supplies all factual marketing claims.
  const dimension = {
    flyer: [1080, 1350],
    poster: [1200, 1800],
    social: [1080, 1080],
    story: [1080, 1920],
    carousel: [1080, 1080],
    banner: [1600, 900],
    logo: [1000, 1000],
    ad:[1200,628],
    thumbnail:[1280,720],
    announcement:[1080,1350],
    event:[1080,1350],
    product:[1080,1080],
  } as const;
  const [width, height] = request.customSize
    ? [request.customSize.width,request.customSize.height]
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
          id: uid(),
          x: Math.round(55 + part.x * factor),
          y: Math.round(25 + part.y * factor),
          width: Math.round(part.width * factor),
          height: Math.round(part.height * factor),
        });
      }
    }
    if (request.kind === "logo") {
      // Genuine editable vector composition; no raster logo or embedded text.
      if (variant === 0) {
        layers.push(rectangle(170, 160, 660, 640, highlight, 110));
        layers.push({
          id: uid(),
          type: "ellipse",
          x: 325,
          y: 250,
          width: 350,
          height: 350,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: background,
        });
      } else if (variant === 1) {
        layers.push(rectangle(235, 130, 530, 690, highlight, 25));
        layers.push(rectangle(340, 230, 320, 490, background, 20));
      } else {
        layers.push({
          id: uid(),
          type: "ellipse",
          x: 190,
          y: 165,
          width: 620,
          height: 620,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: highlight,
        });
        layers.push(rectangle(465, 230, 70, 490, background));
      }
      layers.push(textLayer(brandName, 140, 835, 720, 65, ink, "700"));
    } else {
      layers.push(
        rectangle(
          0,
          0,
          variant === 2 ? width * 0.12 : width,
          variant === 2 ? height : 35,
          highlight,
        ),
      );
      layers.push(
        textLayer(
          brandName.toUpperCase(),
          80,
          Math.round(height * 0.08),
          width - 160,
          30,
          ink,
          "700",
        ),
      );
      layers.push(
        textLayer(
          header.slice(0, 120),
          80,
          Math.round(height * 0.3),
          width - 160,
          Math.min(90, Math.round(width * 0.08)),
          ink,
          "900",
        ),
      );
      if (request.description && index === 0)
        layers.push(
          textLayer(
            request.description,
            80,
            Math.round(height * 0.55),
            width - 160,
            34,
            ink,
            "400",
          ),
        );
      if (request.cta)
        layers.push(
          rectangle(
            78,
            Math.round(height * 0.76),
            width * 0.65,
            94,
            highlight,
            16,
          ),
        );
      if (request.cta)
        layers.push(
          textLayer(
            request.cta,
            103,
            Math.round(height * 0.78),
            width * 0.6,
            31,
            background,
            "700",
          ),
        );
    }
    return { id: uid(), width, height, background, layers };
  });
  return creativeDocumentSchema.parse({
    schemaVersion: 1,
    kind: request.kind,
    title: request.title,
    brandVersion: brand.version,
    approvedLogoId: brand.approvedLogo?.id ?? null,
    logoForm:request.kind==="logo"?request.logoForm:null,
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
      if (layer.type === "image")
        return `<image ${attributes} width="${layer.width}" height="${layer.height}" href="${esc(layer.src)}" preserveAspectRatio="${layer.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"/>`;
      if (layer.type === "line")
        return `<line ${attributes} x1="0" y1="0" x2="${layer.width}" y2="${layer.height}" stroke-width="${layer.strokeWidth}" stroke="${layer.fill}"/>`;
      const lines = layer.text
        .split("\n")
        .slice(0, 12)
        .map(
          (line, i) =>
            `<tspan x="0" dy="${i === 0 ? layer.fontSize : layer.fontSize * 1.2}">${esc(line)}</tspan>`,
        )
        .join("");
      return `<text ${attributes} font-family="${layer.fontFamily}" font-size="${layer.fontSize}" font-weight="${layer.weight}" text-anchor="start" fill="${layer.fill}">${lines}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safe.width} ${safe.height}" width="${safe.width}" height="${safe.height}" role="img"><rect width="100%" height="100%" fill="${safe.background}"/>${contents}</svg>`;
}
