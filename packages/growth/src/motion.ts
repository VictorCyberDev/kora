import { z } from "zod";
import type { BrandKit } from "./brand.js";
import {
  COLORWAYS,
  layoutStack,
  paletteFor,
  resolveFont,
  textEls,
  xml,
  fit,
  type StackBlock,
} from "./assets.js";

export const MOTION_FORMATS = {
  story: { label: "9:16 Story / Reel", width: 1080, height: 1920 },
  square: { label: "1:1 Square", width: 1080, height: 1080 },
  portrait: { label: "4:5 Portrait", width: 1080, height: 1350 },
} as const;
export type MotionFormat = keyof typeof MOTION_FORMATS;
export const MOTION_TEMPLATES = [
  "offer_reveal",
  "service_stack",
  "hours_card",
] as const;
export type MotionTemplate = (typeof MOTION_TEMPLATES)[number];
export const FPS = 24;

const line = (n: number) => z.string().trim().max(n);
export const MotionSpecSchema = z
  .object({
    template: z.enum(MOTION_TEMPLATES),
    format: z.enum(["story", "square", "portrait"]),
    colorway: z.enum(COLORWAYS).default("primary"),
    headline: line(60).min(1),
    subline: line(120).default(""),
    items: z.array(line(48).min(1)).max(4).default([]),
    cta: line(28).default(""),
    contact: line(60).default(""),
    durationSec: z.number().min(4).max(12).default(7),
  })
  .strict();
export type MotionSpec = z.infer<typeof MotionSpecSchema>;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeBack = (x: number) => {
  const c1 = 1.4,
    c3 = c1 + 1,
    t = clamp(x) - 1;
  return 1 + c3 * t * t * t + c1 * t * t;
};
/** progress of an animation that starts at `at` seconds and lasts `len` seconds */
const prog = (t: number, at: number, len: number) => clamp((t - at) / len);

/**
 * Pure: the same spec, kit and time always give the same frame. A video is just these frames in order,
 * which is what makes renders reproducible and retries safe.
 */
export function motionFrameSvg(
  spec: MotionSpec,
  kit: BrandKit,
  business: string,
  t: number,
): { svg: string; width: number; height: number } {
  const { width: W, height: H } = MOTION_FORMATS[spec.format];
  const tall = spec.format === "story";
  const pad = Math.round(W * 0.09);
  const inner = W - pad * 2;
  const p = paletteFor(kit, spec.colorway, "bold");
  const display = resolveFont(kit.typography.displayFamily);
  const body = resolveFont(kit.typography.bodyFamily);
  const radius = kit.shape === "sharp" ? 0 : kit.shape === "rounded" ? 40 : 14;
  const els: string[] = [];
  const grp = (opacity: number, dy: number, inside: string) =>
    opacity <= 0.001
      ? ""
      : `<g opacity="${opacity.toFixed(3)}" transform="translate(0 ${dy.toFixed(1)})">${inside}</g>`;
  const txt = (
    x: number,
    y: number,
    size: number,
    fam: string,
    weight: number,
    fill: string,
    lines: string[],
    lh = 1.12,
  ) =>
    lines
      .map(
        (l, i) =>
          `<text x="${x}" y="${Math.round(y + i * size * lh)}" font-family="${xml(fam)}" font-size="${size}" font-weight="${weight}" fill="${fill}">${xml(l)}</text>`,
      )
      .join("");

  els.push(`<rect width="${W}" height="${H}" fill="${p.bg}"/>`);
  const sweep = easeOut(prog(t, 0, 0.9));
  els.push(
    `<circle cx="${(W * (1.1 - 0.25 * sweep)).toFixed(1)}" cy="${(H * 0.12).toFixed(1)}" r="${(W * 0.38 * sweep).toFixed(1)}" fill="${p.accent}" opacity="0.22"/>`,
  );
  els.push(
    `<rect x="${pad}" y="${pad + 60}" width="${(W * 0.14 * easeOut(prog(t, 0.2, 0.7))).toFixed(1)}" height="10" rx="5" fill="${p.accent}"/>`,
  );
  const wm = fit(
    business,
    inner,
    1,
    Math.round(W * 0.036),
    Math.round(W * 0.026),
  );
  els.push(
    grp(
      easeOut(prog(t, 0.1, 0.5)),
      0,
      txt(pad, pad + 30, wm.size, body, 700, p.fg, wm.lines),
    ),
  );

  // The same stack engine as stills: nothing overlaps or leaves the frame at any format.
  const unit = W;
  const k = Math.round(W * 0.032);
  const cs = Math.round(W * 0.038);
  const base = H - pad;
  const footerH =
    (spec.cta ? Math.round(cs * 2.2) : 0) +
    (spec.contact ? Math.round(k * 1.7) : 0);
  const footerTop = base - footerH;
  const itemBlocks: StackBlock[] = spec.items.map((it, n) => ({
    text: it,
    start: Math.round(unit * 0.044),
    min: Math.round(unit * 0.03),
    maxLines: 1,
    weight: 700,
    family: body,
    lh: 1.2,
    gap: n === spec.items.length - 1 ? 0 : 0.7,
  }));
  const blocks: StackBlock[] = [
    {
      text: spec.headline,
      start: Math.round(unit * (tall ? 0.115 : 0.095)),
      min: Math.round(unit * 0.045),
      maxLines: tall ? 5 : 3,
      weight: 700,
      family: display,
      lh: 1.08,
      gap: 0.5,
    },
    ...(spec.subline
      ? [
          {
            text: spec.subline,
            start: Math.round(unit * 0.04),
            min: Math.round(unit * 0.028),
            maxLines: tall ? 4 : 2,
            weight: 400,
            family: body,
            lh: 1.3,
            gap: 0.7,
          },
        ]
      : []),
    ...itemBlocks,
  ];
  const bodyTop = pad + 60 + Math.round(W * 0.05);
  const placed = layoutStack(
    blocks,
    inner - Math.round(W * 0.05),
    bodyTop,
    footerTop - Math.round(W * 0.03),
  );
  const firstItem = spec.subline ? 2 : 1;
  placed.forEach((pb, n) => {
    const isItem = n >= firstItem;
    const at = n === 0 ? 0.4 : !isItem ? 1.3 : 1.9 + (n - firstItem) * 0.5;
    const pr = easeOut(prog(t, at, n === 0 ? 0.8 : 0.6));
    const bullet = isItem
      ? `<circle cx="${pad + Math.round(pb.size * 0.25)}" cy="${pb.y - Math.round(pb.size * 0.3)}" r="${Math.round(pb.size * 0.2)}" fill="${p.accent}"/>`
      : "";
    const x = isItem ? pad + Math.round(pb.size * 0.9) : pad;
    els.push(
      grp(pr, (1 - pr) * (n === 0 ? 60 : 30), bullet + textEls(x, pb, p.fg)),
    );
  });
  let fy = footerTop;
  if (spec.cta) {
    const bw = Math.min(inner, Math.round(spec.cta.length * cs * 0.6 + cs * 2));
    const cp = easeBack(prog(t, 3.0, 0.6));
    const scale = 0.85 + 0.15 * clamp(cp, 0, 1.15);
    els.push(
      grp(
        clamp(cp * 1.5),
        0,
        `<g transform="translate(${pad} ${fy}) scale(${scale.toFixed(3)})"><rect width="${bw}" height="${Math.round(cs * 2.2)}" rx="${Math.min(radius, cs)}" fill="${p.accent}"/>${txt(Math.round(cs), Math.round(cs * 1.5), cs, body, 700, p.accentFg, [spec.cta.slice(0, 28)])}</g>`,
      ),
    );
    fy += Math.round(cs * 2.2);
  }
  if (spec.contact)
    els.push(
      grp(
        easeOut(prog(t, 3.4, 0.6)),
        0,
        txt(pad, fy + Math.round(k * 1.3), k, body, 400, p.fg, [
          spec.contact.slice(0, 60),
        ]),
      ),
    );
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${els.join("")}</svg>`,
    width: W,
    height: H,
  };
}

/** Times (seconds) of three poster frames used for the instant preview before any video is rendered. */
export const previewTimes = (spec: MotionSpec) => [
  1.2,
  spec.durationSec * 0.55,
  spec.durationSec - 0.1,
];
export const frameCount = (spec: MotionSpec) =>
  Math.round(spec.durationSec * FPS);
