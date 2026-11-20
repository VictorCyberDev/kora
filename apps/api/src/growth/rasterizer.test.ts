import { describe, expect, it } from "vitest";
import type { BrandKit, MotionTimeline } from "@kora/growth";
import {
  Rasterizer,
  ffmpegAvailable,
  renderTimelineMp4,
} from "./rasterizer.js";

const kit: BrandKit = {
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
};

const timeline: MotionTimeline = {
  version: 2,
  format: "square",
  durationSec: 4,
  brand: {
    kitVersion: 1,
    brandOsVersion: null,
    brandOsHash: null,
  },
  scenes: [
    {
      id: "opening",
      startSec: 0,
      durationSec: 2,
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
      startSec: 2,
      durationSec: 2,
      transition: { type: "cut", durationSec: 0 },
      motion: {
        preset: "brand-motif",
        easing: "ease-in-out",
        travel: 0.1,
        scaleFrom: 1,
      },
      backgroundToken: "accent",
      layers: [
        {
          id: "cta",
          type: "text",
          x: 0.1,
          y: 0.35,
          width: 0.8,
          height: 0.2,
          opacity: 1,
          overflow: "clip",
          text: "Order now",
          role: "cta",
          align: "center",
        },
      ],
    },
  ],
  captions: [
    {
      id: "caption-1",
      sceneId: "opening",
      startSec: 0,
      endSec: 2,
      text: "Christmas orders are open",
    },
  ],
  audio: null,
};

const wavTone = () => {
  const sampleRate = 8_000;
  const samples = sampleRate / 2;
  const dataSize = samples * 2;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index++)
    out.writeInt16LE(
      Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 2_000),
      44 + index * 2,
    );
  return out;
};

describe("timeline MP4 renderer", () => {
  it("encodes a playable H.264 MP4 with exact dimensions and duration metadata", async () => {
    if (!(await ffmpegAvailable("ffmpeg"))) return;
    const rendered = await renderTimelineMp4({
      timeline,
      kit,
      business: "Meridian Bakes",
      assets: new Map(),
      audio: { bytes: wavTone(), mime: "audio/wav", volume: 0.25 },
      raster: await Rasterizer.create(),
      bin: "ffmpeg",
    });
    expect(rendered.mp4.subarray(4, 8).toString()).toBe("ftyp");
    expect(rendered.mp4.length).toBeGreaterThan(10_000);
    expect(rendered.mp4.includes(Buffer.from("mp4a"))).toBe(true);
    expect(rendered).toMatchObject({
      width: 1080,
      height: 1080,
      durationMs: 4000,
    });
  }, 60_000);
});
