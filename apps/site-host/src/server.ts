import postgres from "postgres";
import { z } from "zod";
import { buildSiteHost } from "./app.js";
import { SiteHostStore } from "./store.js";

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SITE_HOST_HOST: z.string().default("0.0.0.0"),
    SITE_HOST_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    // Optional: only used for absolute sitemap/robots URLs; derived from the request when unset.
    SITE_HOST_PUBLIC_URL: z.string().url().optional(),
    SITE_HOST_FAULT_DELAY_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30_000)
      .default(10_000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .parse(process.env);

const sql = postgres(env.DATABASE_URL, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
});
const app = buildSiteHost({
  store: new SiteHostStore(sql),
  publicUrl: env.SITE_HOST_PUBLIC_URL,
  faultDelayMs: env.SITE_HOST_FAULT_DELAY_MS,
  logger: { level: env.LOG_LEVEL },
});
app.addHook("onClose", async () => {
  await sql.end();
});
await app.listen({
  host: env.SITE_HOST_HOST,
  port: env.SITE_HOST_PORT ?? env.PORT ?? 3300,
});
