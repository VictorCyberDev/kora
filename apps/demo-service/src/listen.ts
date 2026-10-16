import { z } from "zod";

const listenSchema = z.object({
  DEMO_HOST: z.string().default("0.0.0.0"),
  DEMO_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
});

/**
 * Listen address: DEMO_PORT, then the platform-injected PORT, then 3100.
 * Empty values count as unset. Binds 0.0.0.0 unless DEMO_HOST says otherwise.
 */
export function resolveListen(env: Record<string, string | undefined>) {
  const port = env.DEMO_PORT || env.PORT || undefined;
  const parsed = listenSchema.parse({
    DEMO_HOST: env.DEMO_HOST,
    DEMO_PORT: port,
  });
  return { host: parsed.DEMO_HOST, port: parsed.DEMO_PORT };
}
