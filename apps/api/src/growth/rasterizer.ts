import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ttfPaths } from "@kora/site-fonts";
import {
  frameCount,
  FPS,
  motionFrameSvg,
  type BrandKit,
  type MotionSpec,
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
