import { z } from "zod";
import {
  MotionTimelineSchema,
  recalculateTimeline,
  type MotionTimeline,
} from "./motion-timeline.js";

export const MotionDirectionRequestSchema = z
  .object({
    brief: z.string().trim().min(8).max(240),
    businessName: z.string().trim().min(1).max(100),
    detail: z.string().trim().max(180).default(""),
    cta: z.string().trim().min(1).max(40).default("Learn more"),
    format: z.enum(["story", "square", "portrait", "landscape"]),
    brand: MotionTimelineSchema.shape.brand,
  })
  .strict();
export type MotionDirectionRequest = z.infer<
  typeof MotionDirectionRequestSchema
>;

const text = (
  id: string,
  value: string,
  role: "headline" | "body" | "cta",
  y: number,
  align: "left" | "center" | "right" = "left",
) => ({
  id,
  type: "text" as const,
  x: 0.08,
  y,
  width: 0.84,
  height: role === "headline" ? 0.32 : 0.2,
  opacity: 1,
  overflow: "clip" as const,
  text: value,
  role,
  align,
});

const variant = (
  input: MotionDirectionRequest,
  index: number,
): MotionTimeline => {
  const detail =
    input.detail ||
    (index === 0
      ? "A clear offer, revealed with deliberate pacing."
      : index === 1
        ? "Fast, confident type built for social attention."
        : "Product-led storytelling with a focused close.");
  const scenes: MotionTimeline["scenes"] = [
    {
      id: "opening",
      startSec: 0,
      durationSec: index === 1 ? 1.75 : 2.25,
      transition: {
        type: index === 0 ? "fade" : index === 1 ? "slide" : "zoom",
        durationSec: 0.3,
      },
      motion: {
        preset: index === 1 ? "kinetic-type" : "editorial-reveal",
        easing: "ease-out",
        travel: index === 1 ? 0.25 : 0.12,
        scaleFrom: index === 2 ? 0.88 : 1,
      },
      backgroundToken: "background",
      layers: [
        text(
          "headline",
          input.brief,
          "headline",
          index === 1 ? 0.22 : 0.16,
          index === 1 ? "center" : "left",
        ),
        {
          id: "opening-motif",
          type: "graphic",
          x: 0.08,
          y: 0.09,
          width: index === 1 ? 0.84 : 0.25,
          height: 0.03,
          opacity: 1,
          overflow: "clip",
          motif: "line",
          colorToken: "accent",
        },
      ],
    },
    {
      id: "detail",
      startSec: 0,
      durationSec: index === 1 ? 2.25 : 2,
      transition: { type: index === 0 ? "wipe" : "slide", durationSec: 0.3 },
      motion: {
        preset: index === 2 ? "product-highlight" : "kinetic-type",
        easing: "ease-in-out",
        travel: 0.15,
        scaleFrom: index === 2 ? 0.94 : 1,
      },
      backgroundToken: index === 2 ? "background" : "accent",
      layers: [text("detail-copy", detail, "body", 0.3, "center")],
    },
    {
      id: "close",
      startSec: 0,
      durationSec: 2,
      transition: { type: "cut", durationSec: 0 },
      motion: {
        preset: "brand-motif",
        easing: "ease-out",
        travel: 0.1,
        scaleFrom: 1,
      },
      backgroundToken: "foreground",
      layers: [
        text("cta", input.cta, "cta", 0.32, "center"),
        {
          id: "brand",
          type: "graphic",
          x: 0.1,
          y: 0.78,
          width: 0.8,
          height: 0.08,
          opacity: 1,
          overflow: "clip",
          motif: "logo",
          colorToken: "accent",
        },
      ],
    },
  ];
  const source = {
    version: 2 as const,
    format: input.format,
    durationSec: 6,
    brand: input.brand,
    scenes,
    captions: scenes.map((scene, sceneIndex) => ({
      id: `caption-${sceneIndex + 1}`,
      sceneId: scene.id,
      startSec: scene.startSec,
      endSec: scene.startSec + scene.durationSec,
      text:
        sceneIndex === 0 ? input.brief : sceneIndex === 1 ? detail : input.cta,
    })),
    audio: null,
  };
  return recalculateTimeline(source);
};

export function motionDirectionsFor(request: MotionDirectionRequest): Array<{
  id: string;
  name: string;
  rationale: string;
  timeline: MotionTimeline;
}> {
  const input = MotionDirectionRequestSchema.parse(request);
  return [
    {
      id: "editorial-reveal",
      name: "Editorial reveal",
      rationale: "Measured pacing and asymmetric hierarchy for a premium read.",
      timeline: variant(input, 0),
    },
    {
      id: "kinetic-campaign",
      name: "Kinetic campaign",
      rationale:
        "Faster type rhythm and centered impact for short-form social.",
      timeline: variant(input, 1),
    },
    {
      id: "product-spotlight",
      name: "Product spotlight",
      rationale: "A focused middle beat and direct branded close.",
      timeline: variant(input, 2),
    },
  ];
}
