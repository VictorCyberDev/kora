import { z } from "zod";
import { MOTION_FORMATS } from "./motion.js";

export const MOTION_TIMELINE_VERSION = 2 as const;
export const MOTION_TIMELINE_LIMITS = {
  maxDurationSec: 60,
  maxScenes: 20,
  maxLayersPerScene: 24,
  maxLayersTotal: 160,
  maxCaptions: 80,
  maxAudioBytes: 20 * 1024 * 1024,
  maxRenderPixels: 1920 * 1920,
  maxRenderFrames: 60 * 24,
} as const;

const unit = z.number().finite().min(0).max(1);
const seconds = z
  .number()
  .finite()
  .min(0)
  .max(MOTION_TIMELINE_LIMITS.maxDurationSec);
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const assetId = z.string().uuid();
const boundedPosition = z.number().finite().min(-0.25).max(1.25);

const placement = {
  x: boundedPosition,
  y: boundedPosition,
  width: z.number().finite().gt(0).max(1.5),
  height: z.number().finite().gt(0).max(1.5),
  opacity: unit.default(1),
  overflow: z.enum(["clip", "allow"]).default("clip"),
};

const placementPolicy = (
  layer: {
    overflow: "clip" | "allow";
    x: number;
    y: number;
    width: number;
    height: number;
  },
  ctx: z.RefinementCtx,
) => {
  if (
    layer.overflow === "clip" &&
    (layer.x < 0 ||
      layer.y < 0 ||
      layer.x + layer.width > 1 ||
      layer.y + layer.height > 1)
  )
    ctx.addIssue({
      code: "custom",
      path: ["overflow"],
      message:
        "A clipped layer must remain inside the canvas. Choose deliberate overflow to extend beyond it.",
    });
};

const TextLayerSchema = z
  .object({
    id: identifier,
    type: z.literal("text"),
    ...placement,
    text: z.string().trim().min(1).max(240),
    role: z.enum(["headline", "body", "caption", "cta"]),
    align: z.enum(["left", "center", "right"]).default("left"),
  })
  .strict()
  .superRefine(placementPolicy);
const ImageLayerSchema = z
  .object({
    id: identifier,
    type: z.literal("image"),
    ...placement,
    assetId,
    alt: z.string().trim().min(1).max(200),
    fit: z.enum(["cover", "contain"]).default("cover"),
    focalX: unit.default(0.5),
    focalY: unit.default(0.5),
    missingAsset: z.enum(["fail", "placeholder"]).default("placeholder"),
  })
  .strict()
  .superRefine(placementPolicy);
const GraphicLayerSchema = z
  .object({
    id: identifier,
    type: z.literal("graphic"),
    ...placement,
    motif: z.enum(["line", "frame", "shape", "logo"]),
    colorToken: z.enum(["background", "foreground", "accent"]),
  })
  .strict()
  .superRefine(placementPolicy);

export const TimelineLayerSchema = z.union([
  TextLayerSchema,
  ImageLayerSchema,
  GraphicLayerSchema,
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
    layers: z
      .array(TimelineLayerSchema)
      .max(MOTION_TIMELINE_LIMITS.maxLayersPerScene),
  })
  .strict()
  .superRefine((scene, ctx) => {
    if (scene.transition.type === "cut" && scene.transition.durationSec !== 0)
      ctx.addIssue({
        code: "custom",
        path: ["transition", "durationSec"],
        message: "A cut has zero transition duration.",
      });
    if (scene.transition.type !== "cut" && scene.transition.durationSec <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["transition", "durationSec"],
        message: "An animated transition must have a positive duration.",
      });
    if (scene.transition.durationSec > scene.durationSec / 2)
      ctx.addIssue({
        code: "custom",
        path: ["transition", "durationSec"],
        message: "A transition cannot consume more than half its scene.",
      });
    const layerIds = new Set<string>();
    for (const [index, layer] of scene.layers.entries()) {
      if (layerIds.has(layer.id))
        ctx.addIssue({
          code: "custom",
          path: ["layers", index, "id"],
          message: "Layer IDs must be unique within a scene.",
        });
      layerIds.add(layer.id);
    }
  });
export type TimelineScene = z.infer<typeof TimelineSceneSchema>;

export const CaptionCueSchema = z
  .object({
    id: identifier,
    sceneId: identifier,
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
    version: z.literal(MOTION_TIMELINE_VERSION),
    format: z.enum(["story", "square", "portrait", "landscape"]),
    durationSec: z
      .number()
      .finite()
      .min(4)
      .max(MOTION_TIMELINE_LIMITS.maxDurationSec),
    brand: z
      .object({
        kitVersion: z.number().int().positive(),
        brandOsVersion: z.number().int().positive().nullable(),
        brandOsHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
      })
      .strict(),
    scenes: z
      .array(TimelineSceneSchema)
      .min(1)
      .max(MOTION_TIMELINE_LIMITS.maxScenes),
    captions: z.array(CaptionCueSchema).max(MOTION_TIMELINE_LIMITS.maxCaptions),
    audio: z
      .object({
        assetId,
        license: z
          .object({
            kind: z.enum(["user-supplied", "licensed"]),
            rightsConfirmedAt: z.string().datetime({ offset: true }),
            source: z.string().trim().min(1).max(120),
          })
          .strict(),
        volume: unit.default(1),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((timeline, ctx) => {
    let cursor = 0;
    let layerCount = 0;
    const sceneIds = new Set<string>();
    for (const [index, scene] of timeline.scenes.entries()) {
      if (sceneIds.has(scene.id))
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index, "id"],
          message: "Scene IDs must be unique.",
        });
      sceneIds.add(scene.id);
      layerCount += scene.layers.length;
      if (Math.abs(scene.startSec - cursor) > 0.001)
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index, "startSec"],
          message: "Scenes must form a contiguous deterministic timeline.",
        });
      cursor += scene.durationSec;
    }
    if (layerCount > MOTION_TIMELINE_LIMITS.maxLayersTotal)
      ctx.addIssue({
        code: "custom",
        path: ["scenes"],
        message: `A timeline can contain at most ${MOTION_TIMELINE_LIMITS.maxLayersTotal} layers.`,
      });
    if (Math.abs(cursor - timeline.durationSec) > 0.001)
      ctx.addIssue({
        code: "custom",
        path: ["durationSec"],
        message: "Timeline duration must equal the sum of scene durations.",
      });
    const cueIds = new Set<string>();
    for (const [index, cue] of timeline.captions.entries()) {
      if (cueIds.has(cue.id))
        ctx.addIssue({
          code: "custom",
          path: ["captions", index, "id"],
          message: "Caption IDs must be unique.",
        });
      cueIds.add(cue.id);
      const scene = timeline.scenes.find(
        (candidate) => candidate.id === cue.sceneId,
      );
      if (!scene) {
        ctx.addIssue({
          code: "custom",
          path: ["captions", index, "sceneId"],
          message: "Caption must reference an existing scene.",
        });
        continue;
      }
      const sceneEnd = scene.startSec + scene.durationSec;
      if (cue.startSec < scene.startSec || cue.endSec > sceneEnd + 0.001)
        ctx.addIssue({
          code: "custom",
          path: ["captions", index],
          message: "Caption timing must remain inside its scene.",
        });
    }
  });
export type MotionTimeline = z.infer<typeof MotionTimelineSchema>;

const LegacyTimelineSchema = z
  .object({
    version: z.literal(1),
    format: z.enum(["story", "square", "portrait", "landscape"]),
    durationSec: z.number(),
    brandVersionId: identifier,
    scenes: z.array(z.unknown()),
    captions: z.array(z.unknown()),
    audio: z.unknown().nullable(),
  })
  .passthrough();

/** Parses the current contract or upgrades a persisted v1 timeline without mutating its source. */
export function migrateMotionTimeline(
  input: unknown,
  brand: MotionTimeline["brand"],
): MotionTimeline {
  const current = MotionTimelineSchema.safeParse(input);
  if (current.success) return current.data;
  const legacy = LegacyTimelineSchema.parse(input);
  const legacyScenes = z.array(TimelineSceneSchema).parse(
    legacy.scenes.map((scene) => {
      const value = scene as Record<string, unknown>;
      return {
        ...value,
        layers: Array.isArray(value.layers)
          ? value.layers.map((layer) => ({
              ...(layer as Record<string, unknown>),
              overflow: "clip",
              ...((layer as Record<string, unknown>).type === "image"
                ? { missingAsset: "placeholder" }
                : {}),
            }))
          : [],
      };
    }),
  );
  const captions = z
    .array(
      z.object({
        id: identifier,
        startSec: seconds,
        endSec: seconds,
        text: z.string().trim().min(1).max(160),
      }),
    )
    .parse(legacy.captions)
    .map((cue) => {
      const scene =
        legacyScenes.find(
          (candidate) =>
            cue.startSec >= candidate.startSec &&
            cue.endSec <= candidate.startSec + candidate.durationSec + 0.001,
        ) ?? legacyScenes[0]!;
      return { ...cue, sceneId: scene.id };
    });
  const audio = legacy.audio
    ? (() => {
        const old = z
          .object({
            assetId,
            license: z.enum(["user-supplied", "licensed"]),
            volume: unit.default(1),
          })
          .parse(legacy.audio);
        return {
          assetId: old.assetId,
          volume: old.volume,
          license: {
            kind: old.license,
            rightsConfirmedAt: new Date(0).toISOString(),
            source: "legacy-confirmation",
          },
        };
      })()
    : null;
  return MotionTimelineSchema.parse({
    version: MOTION_TIMELINE_VERSION,
    format: legacy.format,
    durationSec: legacy.durationSec,
    brand,
    scenes: legacyScenes,
    captions,
    audio,
  });
}

export function recalculateTimeline(
  timeline: Omit<MotionTimeline, "durationSec"> & { durationSec?: number },
): MotionTimeline {
  const previous = new Map(timeline.scenes.map((scene) => [scene.id, scene]));
  let startSec = 0;
  const scenes = timeline.scenes.map((scene) => {
    const next = { ...scene, startSec: +startSec.toFixed(3) };
    startSec += scene.durationSec;
    return next;
  });
  const nextById = new Map(scenes.map((scene) => [scene.id, scene]));
  const captions = timeline.captions
    .filter((cue) => nextById.has(cue.sceneId))
    .map((cue) => {
      const before = previous.get(cue.sceneId)!;
      const after = nextById.get(cue.sceneId)!;
      const scale = after.durationSec / before.durationSec;
      const sceneEnd = after.startSec + after.durationSec;
      const nextStart = Math.max(
        after.startSec,
        Math.min(
          sceneEnd - 0.05,
          after.startSec + (cue.startSec - before.startSec) * scale,
        ),
      );
      const nextEnd = Math.max(
        nextStart + 0.05,
        Math.min(
          sceneEnd,
          after.startSec + (cue.endSec - before.startSec) * scale,
        ),
      );
      return {
        ...cue,
        startSec: +nextStart.toFixed(3),
        endSec: +nextEnd.toFixed(3),
      };
    });
  return MotionTimelineSchema.parse({
    ...timeline,
    scenes,
    captions,
    durationSec: +startSec.toFixed(3),
  });
}

export function serializeMotionTimeline(timeline: MotionTimeline): string {
  return JSON.stringify(MotionTimelineSchema.parse(timeline));
}

export function deserializeMotionTimeline(
  source: string,
  brand: MotionTimeline["brand"],
): MotionTimeline {
  if (source.length > 512_000)
    throw new Error("Motion timeline source is too large.");
  return migrateMotionTimeline(JSON.parse(source) as unknown, brand);
}

export function timelineDimensions(format: MotionTimeline["format"]) {
  return MOTION_FORMATS[format];
}
