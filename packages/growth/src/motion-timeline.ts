import { z } from "zod";
import { MOTION_FORMATS } from "./motion.js";

const unit = z.number().finite().min(0).max(1);
const seconds = z.number().finite().min(0).max(60);
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);

const placement = {
  x: unit,
  y: unit,
  width: z.number().finite().gt(0).max(1),
  height: z.number().finite().gt(0).max(1),
  opacity: unit.default(1),
};

export const TimelineLayerSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: identifier,
      type: z.literal("text"),
      ...placement,
      text: z.string().trim().min(1).max(240),
      role: z.enum(["headline", "body", "caption", "cta"]),
      align: z.enum(["left", "center", "right"]).default("left"),
    })
    .strict(),
  z
    .object({
      id: identifier,
      type: z.literal("image"),
      ...placement,
      assetId: identifier,
      alt: z.string().trim().min(1).max(200),
      fit: z.enum(["cover", "contain"]).default("cover"),
      focalX: unit.default(0.5),
      focalY: unit.default(0.5),
    })
    .strict(),
  z
    .object({
      id: identifier,
      type: z.literal("graphic"),
      ...placement,
      motif: z.enum(["line", "frame", "shape", "logo"]),
      colorToken: z.enum(["background", "foreground", "accent"]),
    })
    .strict(),
]);
export type TimelineLayer = z.infer<typeof TimelineLayerSchema>;

export const TimelineSceneSchema = z
  .object({
    id: identifier,
    startSec: seconds,
    durationSec: z.number().finite().min(0.5).max(20),
    transition: z
      .object({
        type: z.enum(["cut", "fade", "wipe", "slide", "zoom"]),
        durationSec: z.number().finite().min(0).max(1).default(0.25),
      })
      .strict(),
    motion: z
      .object({
        preset: z.enum([
          "still",
          "editorial-reveal",
          "kinetic-type",
          "product-highlight",
          "brand-motif",
        ]),
        easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]),
        travel: z.number().finite().min(0).max(1).default(0.15),
        scaleFrom: z.number().finite().min(0.5).max(1.5).default(1),
      })
      .strict(),
    backgroundToken: z.enum(["background", "foreground", "accent"]),
    layers: z.array(TimelineLayerSchema).max(24),
  })
  .strict()
  .superRefine((scene, ctx) => {
    if (scene.transition.durationSec > scene.durationSec / 2)
      ctx.addIssue({
        code: "custom",
        path: ["transition", "durationSec"],
        message: "A transition cannot consume more than half its scene.",
      });
  });
export type TimelineScene = z.infer<typeof TimelineSceneSchema>;

export const CaptionCueSchema = z
  .object({
    id: identifier,
    startSec: seconds,
    endSec: seconds,
    text: z.string().trim().min(1).max(160),
  })
  .strict()
  .refine((cue) => cue.endSec > cue.startSec, {
    message: "Caption end must follow its start.",
    path: ["endSec"],
  });

export const MotionTimelineSchema = z
  .object({
    version: z.literal(1),
    format: z.enum(["story", "square", "portrait", "landscape"]),
    durationSec: z.number().finite().min(4).max(60),
    brandVersionId: identifier,
    scenes: z.array(TimelineSceneSchema).min(1).max(20),
    captions: z.array(CaptionCueSchema).max(80),
    audio: z
      .object({
        assetId: identifier,
        license: z.enum(["user-supplied", "licensed"]),
        volume: unit.default(1),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((timeline, ctx) => {
    let cursor = 0;
    const ids = new Set<string>();
    for (const [index, scene] of timeline.scenes.entries()) {
      if (ids.has(scene.id))
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index, "id"],
          message: "Scene IDs must be unique.",
        });
      ids.add(scene.id);
      if (Math.abs(scene.startSec - cursor) > 0.01)
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index, "startSec"],
          message: "Scenes must form a contiguous deterministic timeline.",
        });
      cursor += scene.durationSec;
    }
    if (Math.abs(cursor - timeline.durationSec) > 0.01)
      ctx.addIssue({
        code: "custom",
        path: ["durationSec"],
        message: "Timeline duration must equal the sum of scene durations.",
      });
    for (const [index, cue] of timeline.captions.entries())
      if (cue.endSec > timeline.durationSec)
        ctx.addIssue({
          code: "custom",
          path: ["captions", index, "endSec"],
          message: "Caption exceeds timeline duration.",
        });
  });
export type MotionTimeline = z.infer<typeof MotionTimelineSchema>;

export function recalculateTimeline(
  timeline: Omit<MotionTimeline, "durationSec"> & { durationSec?: number },
): MotionTimeline {
  let startSec = 0;
  const scenes = timeline.scenes.map((scene) => {
    const next = { ...scene, startSec: +startSec.toFixed(3) };
    startSec += scene.durationSec;
    return next;
  });
  return MotionTimelineSchema.parse({
    ...timeline,
    scenes,
    durationSec: +startSec.toFixed(3),
  });
}

export function timelineDimensions(format: MotionTimeline["format"]) {
  return MOTION_FORMATS[format];
}
