/**
 * Owner media pipeline. The uploaded file is never stored or served: it is decoded, checked, auto-oriented, stripped of
 * metadata and re-encoded, so a polyglot, an embedded script or a hostile EXIF block cannot survive. The declared MIME
 * type is only a hint; the real format comes from the file's own structure.
 */
import { createHash } from "node:crypto";
import sharp, { type Metadata, type Sharp } from "sharp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MIN_SIDE = 240;
export const ROLES = [
  "product",
  "service",
  "portfolio",
  "team",
  "location",
  "environment",
  "process",
  "gallery",
  "general",
] as const;
export type MediaRole = (typeof ROLES)[number];

export class MediaRejected extends Error {
  constructor(
    readonly code:
      | "too_large"
      | "unsupported_type"
      | "corrupt"
      | "too_small"
      | "too_many_pixels"
      | "empty",
    message: string,
  ) {
    super(message);
    this.name = "MediaRejected";
  }
}

export type DetectedFormat = "png" | "jpeg" | "webp";
/** Real format from magic bytes. Anything else (SVG, GIF, HTML, executables, PDFs, archives) is refused. */
export function detectFormat(b: Buffer): DetectedFormat | null {
  if (
    b.length >= 8 &&
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return "jpeg";
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "webp";
  return null;
}

export interface MediaQuality {
  /** 0-100. Usable as a hero when >= 60 and landscape and wide enough; usable at all when >= 40. */
  score: number;
  flags: Array<
    | "LOW_RESOLUTION"
    | "BLURRY"
    | "TOO_DARK"
    | "TOO_BRIGHT"
    | "LOW_CONTRAST"
    | "VERY_TALL"
    | "VERY_WIDE"
    | "HEAVILY_COMPRESSED"
  >;
  orientation: "landscape" | "portrait" | "square";
  megapixels: number;
  /** Mean luminance 0-255 and a sharpness index (variance of the Laplacian on a 256px grey copy). */
  brightness: number;
  sharpness: number;
  heroReady: boolean;
}

export interface ProcessedMedia {
  format: DetectedFormat;
  width: number;
  height: number;
  hasAlpha: boolean;
  sha256: string;
  quality: MediaQuality;
  v640?: Buffer;
  v1280?: Buffer;
  v1920?: Buffer;
  logoPng?: Buffer;
  thumb: Buffer;
  originalBytes: number;
}

async function measure(
  img: Sharp,
  width: number,
  height: number,
  originalBytes: number,
  format: DetectedFormat,
): Promise<MediaQuality> {
  const small = img.clone().resize(256, 256, { fit: "inside" }).greyscale();
  const stats = await small.clone().stats();
  const brightness = stats.channels[0]?.mean ?? 128;
  const spread = stats.channels[0]?.stdev ?? 40;
  const lap = await small
    .clone()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], scale: 1, offset: 128 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const d = lap.data;
  let mean = 0;
  for (const v of d) mean += v;
  mean /= d.length || 1;
  let variance = 0;
  for (const v of d) variance += (v - mean) ** 2;
  variance /= d.length || 1;
  const flags: MediaQuality["flags"] = [];
  const longSide = Math.max(width, height);
  const aspect = width / height;
  if (longSide < 1000) flags.push("LOW_RESOLUTION");
  // Calibrated on real photographs (Laplacian variance with offset 128 on a 256px grey copy): sharp photos score
  // roughly 180-3,000; the same photos after a strong blur score 14-140; a flat image scores 0.
  if (variance < 60) flags.push("BLURRY");
  if (brightness < 45) flags.push("TOO_DARK");
  if (brightness > 225) flags.push("TOO_BRIGHT");
  if (spread < 18) flags.push("LOW_CONTRAST");
  if (aspect < 0.5) flags.push("VERY_TALL");
  if (aspect > 2.6) flags.push("VERY_WIDE");
  // bytes per pixel of the ORIGINAL: very low for a jpeg means heavy compression artefacts
  if (format === "jpeg" && originalBytes / (width * height) < 0.18)
    flags.push("HEAVILY_COMPRESSED");
  let score = 100;
  for (const f of flags)
    score -= {
      LOW_RESOLUTION: 22,
      BLURRY: 30,
      TOO_DARK: 14,
      TOO_BRIGHT: 14,
      LOW_CONTRAST: 10,
      VERY_TALL: 8,
      VERY_WIDE: 8,
      HEAVILY_COMPRESSED: 12,
    }[f];
  if (longSide >= 1800) score = Math.min(100, score + 4);
  score = Math.max(0, Math.min(100, score));
  const orientation =
    aspect > 1.12 ? "landscape" : aspect < 0.89 ? "portrait" : "square";
  return {
    score,
    flags,
    orientation,
    megapixels: Math.round(((width * height) / 1e6) * 10) / 10,
    brightness: Math.round(brightness),
    sharpness: Math.round(variance * 10) / 10,
    heroReady:
      score >= 60 &&
      orientation !== "portrait" &&
      width >= 1200 &&
      !flags.includes("BLURRY"),
  };
}

/** Decodes, validates and re-encodes an upload. Throws MediaRejected with an owner-readable message. */
export async function processUpload(
  raw: Buffer,
  kind: "logo" | "photo",
): Promise<ProcessedMedia> {
  if (raw.length === 0) throw new MediaRejected("empty", "That file is empty.");
  if (raw.length > MAX_UPLOAD_BYTES)
    throw new MediaRejected(
      "too_large",
      "That file is larger than 8 MB. Please upload a smaller picture.",
    );
  const format = detectFormat(raw);
  if (!format)
    throw new MediaRejected(
      "unsupported_type",
      "Please upload a PNG, JPEG or WebP picture.",
    );
  let base: Sharp;
  let meta: Metadata;
  try {
    base = sharp(raw, {
      failOn: "error",
      limitInputPixels: 60_000_000,
      animated: false,
    });
    meta = await base.metadata();
    // Force a full decode so a truncated or corrupt body is found now, not when a visitor loads the page.
    await base.clone().resize(32, 32, { fit: "inside" }).raw().toBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/pixel limit|exceeds/i.test(msg))
      throw new MediaRejected(
        "too_many_pixels",
        "That picture is too large to process. Please resize it and try again.",
      );
    throw new MediaRejected(
      "corrupt",
      "That file could not be read as a picture. It may be damaged.",
    );
  }
  if (meta.format !== format || (meta.pages ?? 1) > 1)
    throw new MediaRejected(
      "unsupported_type",
      "Animated or mislabelled pictures are not supported. Please upload a still PNG, JPEG or WebP.",
    );
  // auto-orient first so width/height and focal points are in display space
  const oriented = base.clone().rotate();
  const m2 = await oriented.clone().metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap
    ? (m2.height ?? meta.height ?? 0)
    : (m2.width ?? meta.width ?? 0);
  const height = swap
    ? (m2.width ?? meta.width ?? 0)
    : (m2.height ?? meta.height ?? 0);
  if (Math.min(width, height) < (kind === "logo" ? 48 : MIN_SIDE))
    throw new MediaRejected(
      "too_small",
      kind === "logo"
        ? "That logo is too small. Please use one at least 48 pixels on its shortest side."
        : `That picture is too small. Please use one at least ${MIN_SIDE} pixels on its shortest side.`,
    );
  const hasAlpha = !!meta.hasAlpha;
  const quality = await measure(oriented, width, height, raw.length, format);
  const thumb = await oriented
    .clone()
    .resize(320, 320, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  const out: ProcessedMedia = {
    format,
    width,
    height,
    hasAlpha,
    quality,
    thumb,
    originalBytes: raw.length,
    sha256: "",
  };
  if (kind === "logo") {
    // logos keep transparency; metadata is stripped by default; never enlarged
    out.logoPng = await oriented
      .clone()
      .resize(900, 900, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    out.sha256 = createHash("sha256").update(out.logoPng).digest("hex");
  } else {
    const enc = (w: number) =>
      oriented
        .clone()
        .resize({ width: w, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .webp({ quality: w >= 1600 ? 78 : 80 })
        .toBuffer();
    out.v640 = await enc(640);
    out.v1280 = await enc(1280);
    if (width >= 1500) out.v1920 = await enc(1920);
    out.sha256 = createHash("sha256")
      .update(out.v1280 ?? Buffer.alloc(0))
      .digest("hex");
  }
  return out;
}

/** A first guess at what a picture shows, from its file name and shape only. Never from its content. The owner can correct it. */
export function suggestRole(
  filename: string,
  q: Pick<MediaQuality, "orientation">,
): MediaRole {
  const f = filename.toLowerCase();
  const rules: Array<[RegExp, MediaRole]> = [
    [/team|staff|founder|owner|portrait|crew/, "team"],
    [
      /product|item|cake|dish|menu|bottle|bag|shoe|dress|bouquet|plate/,
      "product",
    ],
    [
      /shop|store|exterior|front|building|office|location|studio|room|interior/,
      "location",
    ],
    [/process|making|prep|baking|cutting|work.?in.?progress|behind/, "process"],
    [/portfolio|project|before|after|wedding|event|job|install/, "portfolio"],
    [/service|treatment|haircut|fade|braid|massage|repair/, "service"],
    [/gallery|moment|vibe|mood/, "gallery"],
  ];
  const hit = rules.find(([re]) => re.test(f));
  if (hit) return hit[1];
  return q.orientation === "landscape" ? "environment" : "general";
}

/** A filename safe to show and log. Only used for display; storage never uses it. */
export const safeFilename = (n: string) =>
  n
    .replace(/[\\/]/g, "_")
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .slice(0, 80) || "upload";
