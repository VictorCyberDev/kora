import { MotionSpecSchema, BrandKitSchema } from "@kora/growth";
import type { GrowthStore } from "./store.js";
import { ffmpegAvailable, renderMp4, type Rasterizer } from "./rasterizer.js";
import type { StudioStore } from "./studio-store.js";

/** In-process queue worker for video exports. Postgres is the queue (SKIP LOCKED), so several instances are safe. */
export class StudioWorker {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  constructor(
    private readonly d: {
      studio: StudioStore;
      growth: GrowthStore;
      raster: () => Promise<Rasterizer>;
      bin: string;
      log?: { warn: (o: object, m: string) => void };
      meter?: (
        orgId: string,
        siteId: string,
        dimension: string,
        quantity: number,
      ) => Promise<void>;
    },
  ) {}
  /** Renders at most one job. Returns whether a job was processed. */
  async tick(): Promise<boolean> {
    const job = await this.d.studio.claim();
    if (!job) return false;
    try {
      if (!(await ffmpegAvailable(this.d.bin)))
        throw new Error("Video encoding is not available on this server.");
      const spec = MotionSpecSchema.parse(job.spec);
      const kitRec = await this.d.growth.getBrandKit(
        job.siteId,
        job.brandVersion,
      );
      if (!kitRec)
        throw new Error(
          "The Brand Kit version for this render no longer exists.",
        );
      const kit = BrandKitSchema.parse(kitRec.kit);
      const out = await renderMp4({
        spec,
        kit,
        business: job.businessName,
        raster: await this.d.raster(),
        bin: this.d.bin,
      });
      const asset = await this.d.studio.saveAsset({
        siteId: job.siteId,
        orgId: job.orgId,
        kind: "VIDEO",
        format: spec.format,
        category: spec.template,
        spec,
        brandVersion: job.brandVersion,
        mime: "video/mp4",
        bytes: out.mp4,
        svg: null,
        width: out.width,
        height: out.height,
        durationMs: out.durationMs,
        userId: null,
      });
      await this.d.studio.finish(job.id, asset.id);
      await this.d.meter?.(job.orgId, job.siteId, "VIDEO_RENDER", 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "render failed";
      this.d.log?.warn(
        { jobId: job.id, attempt: job.attempts },
        `motion render failed: ${msg}`,
      );
      await this.d.studio.fail(job.id, job.attempts, msg);
    }
    return true;
  }
  start(everyMs = 2000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.busy) return;
      this.busy = true;
      void this.tick()
        .catch(() => undefined)
        .finally(() => (this.busy = false));
    }, everyMs);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
