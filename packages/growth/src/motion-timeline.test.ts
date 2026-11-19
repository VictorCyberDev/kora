import { describe, expect, it } from "vitest";
import {
  MotionTimelineSchema,
  recalculateTimeline,
  timelineDimensions,
  type MotionTimeline,
} from "./motion-timeline.js";

const timeline: MotionTimeline = {
  version: 1,
  format: "landscape",
  durationSec: 7,
  brandVersionId: "brand-v4",
  scenes: [
    {
      id: "opening",
      startSec: 0,
      durationSec: 3,
      transition: { type: "fade", durationSec: 0.25 },
      motion: {
        preset: "editorial-reveal",
        easing: "ease-out",
        travel: 0.15,
        scaleFrom: 1,
      },
      backgroundToken: "background",
      layers: [
        {
          id: "headline",
          type: "text",
          x: 0.1,
          y: 0.2,
          width: 0.8,
          height: 0.3,
          opacity: 1,
          text: "Christmas orders are open",
          role: "headline",
          align: "left",
        },
      ],
    },
    {
      id: "close",
      startSec: 3,
      durationSec: 4,
      transition: { type: "cut", durationSec: 0 },
      motion: {
        preset: "brand-motif",
        easing: "ease-in-out",
        travel: 0.1,
        scaleFrom: 1,
      },
      backgroundToken: "accent",
      layers: [],
    },
  ],
  captions: [
    { id: "caption-1", startSec: 0, endSec: 3, text: "Orders are open" },
  ],
  audio: null,
};

describe("Creative M5 motion timeline", () => {
  it("accepts a bounded editable timeline and exposes landscape dimensions", () => {
    expect(MotionTimelineSchema.parse(timeline)).toEqual(timeline);
    expect(timelineDimensions("landscape")).toEqual({
      label: "16:9 Landscape",
      width: 1920,
      height: 1080,
    });
  });

  it("recalculates stable contiguous start times after scene edits", () => {
    const changed = recalculateTimeline({
      ...timeline,
      scenes: timeline.scenes.map((scene, index) =>
        index === 0 ? { ...scene, durationSec: 2.5 } : scene,
      ),
    });
    expect(changed.scenes.map((scene) => scene.startSec)).toEqual([0, 2.5]);
    expect(changed.durationSec).toBe(6.5);
  });

  it("rejects overlap, duplicate IDs, unsafe bounds and unlicensed audio", () => {
    expect(() =>
      MotionTimelineSchema.parse({
        ...timeline,
        scenes: [timeline.scenes[0], { ...timeline.scenes[1], id: "opening" }],
      }),
    ).toThrow();
    expect(() =>
      MotionTimelineSchema.parse({
        ...timeline,
        scenes: [timeline.scenes[0], { ...timeline.scenes[1], startSec: 4 }],
      }),
    ).toThrow();
    expect(() =>
      MotionTimelineSchema.parse({
        ...timeline,
        audio: { assetId: "audio-1", license: "unknown", volume: 1 },
      }),
    ).toThrow();
  });
});
