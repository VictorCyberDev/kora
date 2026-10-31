import type { FastifyInstance } from "fastify";
import type { PlatformStore } from "../platform/store.js";
import type { OpsStore } from "../platform/ops-store.js";
import type { BillingService } from "../platform/billing.js";
import type { PlatformConfig } from "../platform/config.js";
import { registerGrowthRoutes } from "./routes.js";
import { GrowthStore } from "./store.js";
import { ChannelsStore } from "./channels-store.js";
import { CustomersStore } from "./customers-store.js";
import { registerChannelRoutes } from "./channels-routes.js";
import { registerCustomerRoutes } from "./customers-routes.js";
import { ProviderRegistry } from "./providers.js";
import { SecretBox } from "./secrets.js";
import { createGatherer } from "./gather.js";
import { StudioStore } from "./studio-store.js";
import { StudioWorker } from "./studio-worker.js";
import { CalendarStore } from "./calendar-store.js";
import { PublishWorker } from "./publish-worker.js";
import { registerCalendarRoutes } from "./calendar-routes.js";
import { IntelStore } from "./intel-store.js";
import { registerIntelRoutes } from "./intel-routes.js";
import { MarketingStore } from "./marketing-store.js";
import { registerMarketingRoutes } from "./marketing-routes.js";
import { registerStudioRoutes } from "./studio-routes.js";
import { Rasterizer, ffmpegAvailable, ffmpegBin } from "./rasterizer.js";

export function registerGrowth(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    ops: OpsStore;
    billing: BillingService;
    config: PlatformConfig;
    now?: () => Date;
    providerFetch?: typeof fetch;
  },
) {
  const { platform, ops, billing, config } = d;
  const growth = new GrowthStore(platform.sql);
  const channels = new ChannelsStore(platform.sql);
  const customers = new CustomersStore(platform.sql);
  const providers = new ProviderRegistry(config, d.providerFetch);
  const secrets = SecretBox.fromEnv(
    config.KORA_SECRETS_KEY ??
      (config.KORA_SANDBOX_CHANNELS
        ? Buffer.alloc(32, 7).toString("base64")
        : undefined),
  );
  const now = d.now;
  const studio = new StudioStore(platform.sql);
  const bin = ffmpegBin(process.env);
  let encoder: Promise<boolean> | null = null;
  const ffmpeg = () => (encoder ??= ffmpegAvailable(bin));
  let rasterP: Promise<Rasterizer> | null = null;
  const raster = () => (rasterP ??= Rasterizer.create());
  const intel = new IntelStore(platform.sql);
  const gather = createGatherer({
    platform,
    ops,
    growth,
    channels,
    customers,
    intel,
    now: now ?? (() => new Date()),
  });
  registerStudioRoutes(app, {
    platform,
    billing,
    growth,
    studio,
    gather,
    raster,
    ffmpeg,
    contentModel: null,
  });
  const calendar = new CalendarStore(platform.sql);
  const marketing = new MarketingStore(platform.sql);
  registerIntelRoutes(app, {
    platform,
    billing,
    intel,
    calendar,
    channels,
    providers,
    secrets,
    gather,
    ...(now ? { now } : {}),
  });
  registerMarketingRoutes(app, {
    platform,
    ops,
    billing,
    growth,
    marketing,
    intel,
    calendar,
    channels,
    customers,
    studio,
    providers,
    gather,
    raster,
    ...(now ? { now } : {}),
  });
  registerCalendarRoutes(app, {
    platform,
    billing,
    calendar,
    channels,
    studio,
    providers,
    gather,
    ...(now ? { now } : {}),
  });
  if (config.NODE_ENV !== "test" || process.env.KORA_STUDIO_WORKER === "true") {
    const pw = new PublishWorker({
      platform,
      calendar,
      channels,
      studio,
      providers,
      secrets,
      gather,
      now: now ?? (() => new Date()),
    });
    pw.start(Number(process.env.KORA_PUBLISH_TICK_MS) || 5000);
    app.addHook("onClose", () => pw.stop());

    const w = new StudioWorker({ studio, growth, raster, bin });
    w.start();
    app.addHook("onClose", () => w.stop());
  }
  registerGrowthRoutes(app, {
    platform,
    ops,
    billing,
    growth,
    channels,
    customers,
    config,
    ...(now ? { now } : {}),
  });
  registerChannelRoutes(app, {
    platform,
    billing,
    channels,
    customers,
    providers,
    secrets,
    config,
    ...(now ? { now } : {}),
  });
  registerCustomerRoutes(app, {
    platform,
    billing,
    customers,
    ...(now ? { now } : {}),
  });
}
