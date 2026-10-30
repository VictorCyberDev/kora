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
