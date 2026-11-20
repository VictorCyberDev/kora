import type { BrandKit } from "./brand.js";
import { resolveFont, xml, wrap } from "./assets.js";
import {
  timelineDimensions,
  type MotionTimeline,
  type TimelineLayer,
} from "./motion-timeline.js";

export interface ResolvedTimelineAsset {
  id: string;
  dataUri: string;
  width: number;
  height: number;
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const ease = (
  value: number,
  kind: MotionTimeline["scenes"][number]["motion"]["easing"],
) => {
  const x = clamp(value);
  if (kind === "linear") return x;
  if (kind === "ease-in") return x * x * x;
  if (kind === "ease-out") return 1 - (1 - x) ** 3;
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};
const token = (kit: BrandKit, value: "background" | "foreground" | "accent") =>
  value === "background"
    ? kit.colors.canvas
    : value === "foreground"
      ? kit.colors.ink
      : kit.colors.accent;

const textLayer = (
  layer: Extract<TimelineLayer, { type: "text" }>,
  kit: BrandKit,
  width: number,
  height: number,
) => {
  const boxWidth = layer.width * width;
  const fontSize = Math.max(
    16,
    Math.round(
      width *
        (layer.role === "headline"
          ? 0.07
          : layer.role === "cta"
            ? 0.034
            : 0.03),
    ),
  );
  const lines = wrap(
    layer.text,
    fontSize,
    boxWidth,
    Math.max(1, Math.floor((layer.height * height) / (fontSize * 1.2))),
  );
  const family = resolveFont(
    layer.role === "headline"
      ? kit.typography.displayFamily
      : kit.typography.bodyFamily,
  );
  const anchor =
    layer.align === "center"
      ? "middle"
      : layer.align === "right"
        ? "end"
        : "start";
  const x =
    (layer.x +
      (layer.align === "center"
        ? layer.width / 2
        : layer.align === "right"
          ? layer.width
          : 0)) *
    width;
  const y = layer.y * height + fontSize;
  return lines
    .map(
      (line, index) =>
        `<text x="${x.toFixed(1)}" y="${(y + index * fontSize * 1.18).toFixed(1)}" text-anchor="${anchor}" font-family="${xml(family)}" font-size="${fontSize}" font-weight="${layer.role === "headline" || layer.role === "cta" ? 700 : 400}" fill="${kit.colors.ink}">${xml(line)}</text>`,
    )
    .join("");
};

const imageLayer = (
  layer: Extract<TimelineLayer, { type: "image" }>,
  asset: ResolvedTimelineAsset | undefined,
  width: number,
  height: number,
  index: number,
) => {
  const x = layer.x * width;
  const y = layer.y * height;
  const w = layer.width * width;
  const h = layer.height * height;
  const clip = `timeline-image-${index}`;
  if (!asset)
    return `<g opacity="${layer.opacity}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#d9d9d9"/><path d="M${x + w * 0.15} ${y + h * 0.75} L${x + w * 0.4} ${y + h * 0.45} L${x + w * 0.58} ${y + h * 0.62} L${x + w * 0.78} ${y + h * 0.32}" fill="none" stroke="#777" stroke-width="8"/></g>`;
  const scale =
    layer.fit === "contain"
      ? Math.min(w / asset.width, h / asset.height)
      : Math.max(w / asset.width, h / asset.height);
  const renderedWidth = asset.width * scale;
  const renderedHeight = asset.height * scale;
  const imageX =
    layer.fit === "contain"
      ? x + (w - renderedWidth) / 2
      : x - (renderedWidth - w) * layer.focalX;
  const imageY =
    layer.fit === "contain"
      ? y + (h - renderedHeight) / 2
      : y - (renderedHeight - h) * layer.focalY;
  return `<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><image x="${imageX}" y="${imageY}" width="${renderedWidth}" height="${renderedHeight}" opacity="${layer.opacity}" preserveAspectRatio="none" clip-path="url(#${clip})" href="${asset.dataUri}"/>`;
};

/** Deterministic SVG frame for a v2 editable timeline. */
export function motionTimelineFrameSvg(
  timeline: MotionTimeline,
  kit: BrandKit,
  business: string,
  timeSec: number,
  assets: ReadonlyMap<string, ResolvedTimelineAsset> = new Map(),
): { svg: string; width: number; height: number } {
  const { width, height } = timelineDimensions(timeline.format);
  const time = clamp(timeSec, 0, timeline.durationSec);
  const scene =
    timeline.scenes.find(
      (candidate) =>
        time >= candidate.startSec &&
        time < candidate.startSec + candidate.durationSec,
    ) ?? timeline.scenes[timeline.scenes.length - 1]!;
  const local = clamp((time - scene.startSec) / scene.durationSec);
  const progress = ease(local, scene.motion.easing);
  const transitionProgress =
    scene.transition.type === "cut" || scene.transition.durationSec === 0
      ? 1
      : ease(
          (time - scene.startSec) / scene.transition.durationSec,
          scene.motion.easing,
        );
  const translate =
    scene.motion.preset === "still"
      ? 0
      : (1 - progress) * scene.motion.travel * height * 0.08;
  const scale =
    scene.motion.preset === "product-highlight"
      ? scene.motion.scaleFrom + (1 - scene.motion.scaleFrom) * progress
      : 1;
  const layerSvg = scene.layers
    .map((layer, index) => {
      if (layer.type === "text") return textLayer(layer, kit, width, height);
      if (layer.type === "image")
        return imageLayer(
          layer,
          assets.get(layer.assetId),
          width,
          height,
          index,
        );
      const x = layer.x * width;
      const y = layer.y * height;
      const w = layer.width * width;
      const h = layer.height * height;
      const color = token(kit, layer.colorToken);
      if (layer.motif === "line")
        return `<path d="M${x} ${y + h / 2} H${x + w}" stroke="${color}" stroke-width="${Math.max(3, width * 0.008)}" opacity="${layer.opacity}"/>`;
      if (layer.motif === "frame")
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${Math.max(3, width * 0.006)}" opacity="${layer.opacity}"/>`;
      if (layer.motif === "logo")
        return `<text x="${x}" y="${y + Math.min(h, width * 0.05)}" font-family="${xml(resolveFont(kit.typography.displayFamily))}" font-size="${Math.min(h, width * 0.05)}" font-weight="700" fill="${color}" opacity="${layer.opacity}">${xml(business)}</text>`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${kit.shape === "sharp" ? 0 : kit.shape === "rounded" ? 40 : 14}" fill="${color}" opacity="${layer.opacity}"/>`;
    })
    .join("");
  const captions = timeline.captions
    .filter((cue) => time >= cue.startSec && time < cue.endSec)
    .map(
      (cue, index) =>
        `<g><rect x="${width * 0.12}" y="${height * (0.83 + index * 0.07)}" width="${width * 0.76}" height="${height * 0.055}" rx="12" fill="#000" opacity=".78"/><text x="${width / 2}" y="${height * (0.867 + index * 0.07)}" text-anchor="middle" font-family="${xml(resolveFont(kit.typography.bodyFamily))}" font-size="${Math.round(width * 0.027)}" font-weight="600" fill="#fff">${xml(cue.text)}</text></g>`,
    )
    .join("");
  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${token(kit, scene.backgroundToken)}"/><g opacity="${transitionProgress.toFixed(3)}" transform="translate(0 ${translate.toFixed(2)}) scale(${scale.toFixed(4)})">${layerSvg}</g>${captions}</svg>`,
  };
}

const srtTime = (seconds: number) => {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${millis
    .toString()
    .padStart(3, "0")}`;
};

export function motionTimelineCaptionsSrt(timeline: MotionTimeline): string {
  return timeline.captions
    .slice()
    .sort((a, b) => a.startSec - b.startSec)
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.startSec)} --> ${srtTime(cue.endSec)}\n${cue.text.replace(/[\r\n]+/g, " ")}\n`,
    )
    .join("\n");
}
