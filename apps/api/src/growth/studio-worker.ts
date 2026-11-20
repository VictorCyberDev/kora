import {
  BrandKitSchema,
  MotionSpecSchema,
  MotionTimelineSchema,
} from "@kora/growth";
import { z } from "zod";
import type { GrowthStore } from "./store.js";
import {
  ffmpegAvailable,
  renderMp4,
  renderTimelineMp4,
  type Rasterizer,
} from "./rasterizer.js";
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
      const timelineJob = z
        .object({
          kind: z.literal("timeline-v2"),
          projectId: z.string().uuid(),
          projectRevision: z.number().int().positive(),
          timeline: MotionTimelineSchema,
        })
        .strict()
        .safeParse(job.spec);
      const kitRec = await this.d.growth.getBrandKit(
        job.siteId,
        job.brandVersion,
      );
      if (!kitRec)
        throw new Error(
          "The Brand Kit version for this render no longer exists.",
        );
      const kit = BrandKitSchema.parse(kitRec.kit);
      const raster = await this.d.raster();
      const out = timelineJob.success
        ? await (async () => {
            const timeline = timelineJob.data.timeline;
            if (timeline.brand.kitVersion !== job.brandVersion)
              throw new Error(
                "The queued timeline and Brand Kit version do not match.",
              );
            const imageLayers = timeline.scenes.flatMap((scene) =>
              scene.layers.filter((layer) => layer.type === "image"),
            );
            const assets = await this.d.studio.timelineAssets(job.siteId, [
              ...new Set(imageLayers.map((layer) => layer.assetId)),
            ]);
            const missingRequired = imageLayers.find(
              (layer) =>
                layer.missingAsset === "fail" && !assets.has(layer.assetId),
            );
            if (missingRequired)
              throw new Error(
                "A required timeline image is no longer available.",
              );
            return renderTimelineMp4({
              timeline,
              kit,
              business: job.businessName,
              assets,
              raster,
              bin: this.d.bin,
            });
          })()
        : await renderMp4({
            spec: MotionSpecSchema.parse(job.spec),
            kit,
            business: job.businessName,
            raster,
            bin: this.d.bin,
          });
      const asset = await this.d.studio.saveAsset({
        siteId: job.siteId,
        orgId: job.orgId,
        kind: "VIDEO",
        format: timelineJob.success
          ? timelineJob.data.timeline.format
          : MotionSpecSchema.parse(job.spec).format,
        category: timelineJob.success
          ? "timeline"
          : MotionSpecSchema.parse(job.spec).template,
        spec: timelineJob.success ? timelineJob.data : job.spec,
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
