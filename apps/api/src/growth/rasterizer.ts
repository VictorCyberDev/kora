import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ttfPaths } from "@kora/site-fonts";
import {
  frameCount,
  FPS,
  motionFrameSvg,
  motionTimelineFrameSvg,
  type BrandKit,
  type MotionTimeline,
  type MotionSpec,
  type ResolvedTimelineAsset,
} from "@kora/growth";

/** SVG → PNG with the bundled brand fonts only. System fonts are never used, so renders match on every machine. */
export class Rasterizer {
  private constructor(private readonly fontFiles: string[]) {}
  static async create() {
    return new Rasterizer(await ttfPaths());
  }
  png(svg: string, width: number): Buffer {
    return new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      font: {
        fontFiles: this.fontFiles,
        loadSystemFonts: false,
        defaultFontFamily: "Inter",
      },
    })
      .render()
      .asPng();
  }
  get fontCount() {
    return this.fontFiles.length;
  }
}

export const ffmpegBin = (env: Record<string, string | undefined>) =>
  env.KORA_FFMPEG_PATH || "ffmpeg";

/** Whether this host can encode video. Probed, not assumed. */
export function ffmpegAvailable(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (c) => resolve(c === 0));
  });
}

/** Fully decodes the first second so magic-byte polyglots and corrupt audio are rejected before storage. */
export function validateAudioBytes(
  bytes: Buffer,
  bin: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn(
      bin,
      [
        "-hide_banner",
        "-v",
        "error",
        "-i",
        "pipe:0",
        "-t",
        "1",
        "-f",
        "null",
        "-",
      ],
      { stdio: ["pipe", "ignore", "ignore"] },
    );
    const timer = setTimeout(() => {
      process.kill("SIGKILL");
      resolve(false);
    }, 10_000);
    process.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    process.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    process.stdin.end(bytes);
  });
}

/** Renders every frame of a motion spec and encodes H.264/MP4. Pure function of its inputs; safe to retry. */
export async function renderMp4(opts: {
  spec: MotionSpec;
  kit: BrandKit;
  business: string;
  raster: Rasterizer;
  bin: string;
}): Promise<{
  mp4: Buffer;
  width: number;
  height: number;
  durationMs: number;
}> {
  const dir = await mkdtemp(join(tmpdir(), "kora-motion-"));
  const out = join(dir, "out.mp4");
  try {
    const first = motionFrameSvg(opts.spec, opts.kit, opts.business, 0);
    const ff = spawn(
      opts.bin,
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS),
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "24",
        "-preset",
        "veryfast",
        "-movflags",
        "+faststart",
        out,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let err = "";
    ff.stderr.on("data", (d: Buffer) => (err += d.toString().slice(0, 500)));
    const done = new Promise<void>((resolve, reject) => {
      ff.on("error", reject);
      ff.on("exit", (c) =>
        c === 0
          ? resolve()
          : reject(new Error(`ffmpeg exited ${c}: ${err.slice(0, 200)}`)),
      );
    });
    const n = frameCount(opts.spec);
    for (let i = 0; i < n; i++) {
      const f = motionFrameSvg(opts.spec, opts.kit, opts.business, i / FPS);
      const png = opts.raster.png(f.svg, f.width);
      if (!ff.stdin.write(png))
        await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await done;
    return {
      mp4: await readFile(out),
      width: first.width,
      height: first.height,
      durationMs: Math.round(opts.spec.durationSec * 1000),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Timeline-aware H.264 renderer. Legacy MotionSpec jobs continue through renderMp4 above. */
export async function renderTimelineMp4(opts: {
  timeline: MotionTimeline;
  kit: BrandKit;
  business: string;
  assets: ReadonlyMap<string, ResolvedTimelineAsset>;
  audio?: { bytes: Buffer; mime: string; volume: number } | null;
  raster: Rasterizer;
  bin: string;
}): Promise<{
  mp4: Buffer;
  width: number;
  height: number;
  durationMs: number;
}> {
  const dir = await mkdtemp(join(tmpdir(), "kora-motion-timeline-"));
  const silent = join(dir, "silent.mp4");
  const out = join(dir, "out.mp4");
  try {
    const first = motionTimelineFrameSvg(
      opts.timeline,
      opts.kit,
      opts.business,
      0,
      opts.assets,
    );
    const ff = spawn(
      opts.bin,
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS),
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "24",
        "-preset",
        "veryfast",
        "-movflags",
        "+faststart",
        silent,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let err = "";
    ff.stderr.on("data", (data: Buffer) => {
      err += data.toString().slice(0, 500);
    });
    const done = new Promise<void>((resolve, reject) => {
      ff.on("error", reject);
      ff.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg exited ${code}: ${err.slice(0, 200)}`)),
      );
    });
    const count = Math.round(opts.timeline.durationSec * FPS);
    for (let index = 0; index < count; index++) {
      const frame = motionTimelineFrameSvg(
        opts.timeline,
        opts.kit,
        opts.business,
        index / FPS,
        opts.assets,
      );
      const png = opts.raster.png(frame.svg, frame.width);
      if (!ff.stdin.write(png))
        await new Promise((resolve) => ff.stdin.once("drain", resolve));
    }
    ff.stdin.end();
    await done;
    if (opts.audio) {
      const extension =
        opts.audio.mime === "audio/wav"
          ? "wav"
          : opts.audio.mime === "audio/ogg"
            ? "ogg"
            : "mp3";
      const audioFile = join(dir, `audio.${extension}`);
      await writeFile(audioFile, opts.audio.bytes);
      const mux = spawn(
        opts.bin,
        [
          "-y",
          "-loglevel",
          "error",
          "-i",
          silent,
          "-stream_loop",
          "-1",
          "-i",
          audioFile,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-t",
          String(opts.timeline.durationSec),
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-filter:a",
          `volume=${opts.audio.volume.toFixed(3)}`,
          "-movflags",
          "+faststart",
          out,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let muxError = "";
      mux.stderr.on(
        "data",
        (data: Buffer) => (muxError += data.toString().slice(0, 500)),
      );
      await new Promise<void>((resolve, reject) => {
        mux.on("error", reject);
        mux.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `ffmpeg audio mux exited ${code}: ${muxError.slice(0, 200)}`,
                ),
              ),
        );
      });
    } else {
      await writeFile(out, await readFile(silent));
    }
    return {
      mp4: await readFile(out),
      width: first.width,
      height: first.height,
      durationMs: Math.round(opts.timeline.durationSec * 1000),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
