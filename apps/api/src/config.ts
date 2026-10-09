import { z } from "zod";

export const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be PostgreSQL",
    ),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONITOR_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  MONITOR_SERVICE_NAME: z.string().min(1).default("demo-service"),
  MONITOR_HEALTH_URL: z.string().url().default("http://localhost:3100/health"),
  MONITOR_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
  MONITOR_TIMEOUT_MS: z.coerce.number().int().min(50).default(2000),
  MONITOR_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  MONITOR_RECOVERY_THRESHOLD: z.coerce.number().int().min(1).default(3),
});
export type KoraConfig = z.infer<typeof configSchema>;
export const loadConfig = (
  env: Record<string, string | undefined> = process.env,
) => configSchema.parse(env);
