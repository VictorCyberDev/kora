import { describe, expect, it } from "vitest";
import {
  deserializeMotionTimeline,
  migrateMotionTimeline,
  MotionTimelineSchema,
  recalculateTimeline,
  serializeMotionTimeline,
  timelineDimensions,
  type MotionTimeline,
} from "./motion-timeline.js";
import {
  motionTimelineCaptionsSrt,
  motionTimelineFrameSvg,
} from "./motion-timeline-renderer.js";

const timeline: MotionTimeline = {
  version: 2,
  format: "landscape",
  durationSec: 7,
  brand: {
    kitVersion: 4,
    brandOsVersion: 2,
    brandOsHash: "a".repeat(64),
  },
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
          overflow: "clip",
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
    {
      id: "caption-1",
      sceneId: "opening",
      startSec: 0,
      endSec: 3,
      text: "Orders are open",
    },
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
    expect(changed.captions[0]).toMatchObject({ startSec: 0, endSec: 2.5 });
  });

  it("rejects overlap, duplicate scene/layer IDs, unsafe bounds and unlicensed audio", () => {
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
        scenes: [
          {
            ...timeline.scenes[0],
            layers: [
              timeline.scenes[0]!.layers[0]!,
              timeline.scenes[0]!.layers[0]!,
            ],
          },
          timeline.scenes[1],
        ],
      }),
    ).toThrow(/Layer IDs/);
    expect(() =>
      MotionTimelineSchema.parse({
        ...timeline,
        scenes: [
          {
            ...timeline.scenes[0],
            layers: [
              {
                ...timeline.scenes[0]!.layers[0]!,
                x: 0.9,
                width: 0.5,
              },
            ],
          },
          timeline.scenes[1],
        ],
      }),
    ).toThrow(/inside the canvas/);
    expect(() =>
      MotionTimelineSchema.parse({
        ...timeline,
        audio: {
          assetId: crypto.randomUUID(),
          license: {
            kind: "unknown",
            rightsConfirmedAt: new Date().toISOString(),
            source: "owner",
          },
          volume: 1,
        },
      }),
    ).toThrow();
  });

  it("round-trips current timelines and upgrades v1 timelines", () => {
    expect(
      deserializeMotionTimeline(
        serializeMotionTimeline(timeline),
        timeline.brand,
      ),
    ).toEqual(timeline);
    const legacy = {
      version: 1,
      format: timeline.format,
      durationSec: timeline.durationSec,
      brandVersionId: "brand-v4",
      scenes: timeline.scenes.map((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) =>
          Object.fromEntries(
            Object.entries(layer).filter(([key]) => key !== "overflow"),
          ),
        ),
      })),
      captions: timeline.captions.map((cue) =>
        Object.fromEntries(
          Object.entries(cue).filter(([key]) => key !== "sceneId"),
        ),
      ),
      audio: null,
    };
    const upgraded = migrateMotionTimeline(legacy, timeline.brand);
    expect(upgraded.version).toBe(2);
    expect(upgraded.captions[0]?.sceneId).toBe("opening");
    expect(upgraded.scenes[0]?.layers[0]).toMatchObject({
      overflow: "clip",
    });
  });

  it("requires captions to remain in their referenced scene", () => {
    expect(() =>
      MotionTimelineSchema.parse({
        ...timeline,
        captions: [
          {
            ...timeline.captions[0],
            sceneId: "close",
          },
        ],
      }),
    ).toThrow(/inside its scene/);
  });

  it("renders deterministic branded frames with timed captions", () => {
    const frame = motionTimelineFrameSvg(
      timeline,
      {
        logoAssetId: null,
        colors: {
          ink: "#17120f",
          canvas: "#fff7ed",
          primary: "#7c2d12",
          primaryText: "#ffffff",
          accent: "#f59e0b",
          accentText: "#17120f",
          muted: "#78716c",
        },
        typography: {
          pairing: "editorial",
          displayFamily: "Playfair Display",
          bodyFamily: "Inter",
        },
        shape: "soft",
        voice: { tone: "warm", use: [], avoid: [], language: "en" },
        imagery: { style: "photo-led", seed: 1 },
      },
      "Meridian Bakes",
      1,
    );
    expect(frame).toMatchObject({ width: 1920, height: 1080 });
    expect(frame.svg).toContain("Christmas orders are");
    expect(frame.svg).toContain(">open</text>");
    expect(frame.svg).toContain("Orders are open");
    expect(frame.svg).toContain("#fff7ed");
    expect(
      motionTimelineFrameSvg(
        timeline,
        {
          logoAssetId: null,
          colors: {
            ink: "#17120f",
            canvas: "#fff7ed",
            primary: "#7c2d12",
            primaryText: "#ffffff",
            accent: "#f59e0b",
            accentText: "#17120f",
            muted: "#78716c",
          },
          typography: {
            pairing: "editorial",
            displayFamily: "Playfair Display",
            bodyFamily: "Inter",
          },
          shape: "soft",
          voice: { tone: "warm", use: [], avoid: [], language: "en" },
          imagery: { style: "photo-led", seed: 1 },
        },
        "Meridian Bakes",
        1,
      ).svg,
    ).toBe(frame.svg);
    expect(motionTimelineCaptionsSrt(timeline)).toContain(
      "00:00:00,000 --> 00:00:03,000",
    );
  });
});
