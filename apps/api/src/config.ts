import { z } from "zod";

export const configSchema = z
  .object({
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
    MONITOR_HEALTH_URL: z
      .string()
      .url()
      .default("http://localhost:3100/health"),
    MONITOR_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
    MONITOR_TIMEOUT_MS: z.coerce.number().int().min(50).default(2000),
    MONITOR_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
    MONITOR_RECOVERY_THRESHOLD: z.coerce.number().int().min(1).default(3),
    RUMPTY_WORKSPACE: z.string().min(1).optional(),
    RUMPTY_REGION: z.string().min(1).optional(),
    RUMPTY_RESOURCE_TYPE: z.enum(["virtual_machine", "deployment"]).optional(),
    RUMPTY_RESOURCE_ID: z.string().min(1).optional(),
    RUMPTY_RESOURCE_NAME: z.string().min(1).optional(),
    KORA_ENVIRONMENT: z.string().min(1).default("development"),
    // Deployment Verification (not cryptographic). All optional: without
    // GITHUB_REPO no verification runs.
    GITHUB_REPO: z
      .string()
      .regex(
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
        "GITHUB_REPO must be owner/name",
      )
      .optional(),
    // Defaults ("main", "https://api.github.com") are applied by loadConfig.
    GITHUB_BRANCH: z
      .string()
      .regex(/^[A-Za-z0-9_./-]+$/, "GITHUB_BRANCH has unsupported characters")
      .optional(),
    GITHUB_API_URL: z.string().url().optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
    MONITOR_CLAIM_URL: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    const fields = [
      value.RUMPTY_WORKSPACE,
      value.RUMPTY_REGION,
      value.RUMPTY_RESOURCE_TYPE,
      value.RUMPTY_RESOURCE_ID,
    ];
    const configured = fields.filter(Boolean).length;
    if (configured !== 0 && configured !== fields.length)
      ctx.addIssue({
        code: "custom",
        message:
          "RumptyCloud binding requires workspace, region, resource type, and resource ID together",
      });
  });
export type KoraConfig = z.infer<typeof configSchema>;
/**
 * Listen port: API_PORT, then the platform-injected PORT, then 3000. Empty
 * values count as unset. Everything else is read from `env` unchanged.
 *
 * GITHUB_TOKEN is kept readable but non-enumerable, so spreading, logging or
 * serialising the config can never emit it.
 */
export const loadConfig = (
  env: Record<string, string | undefined> = process.env,
): KoraConfig => {
  // An empty value counts as unset for the optional settings below.
  const cleaned: Record<string, string | undefined> = { ...env };
  for (const key of [
    "GITHUB_REPO",
    "GITHUB_BRANCH",
    "GITHUB_API_URL",
    "GITHUB_TOKEN",
    "MONITOR_CLAIM_URL",
  ])
    if (cleaned[key] === "") cleaned[key] = undefined;
  const { GITHUB_TOKEN, ...rest } = configSchema.parse({
    ...cleaned,
    API_PORT: env.API_PORT || env.PORT || undefined,
  });
  return Object.defineProperty(
    {
      ...rest,
      GITHUB_BRANCH: rest.GITHUB_BRANCH ?? "main",
      GITHUB_API_URL: rest.GITHUB_API_URL ?? "https://api.github.com",
    },
    "GITHUB_TOKEN",
    { value: GITHUB_TOKEN, enumerable: false },
  );
};

/** Where the workload's runtime claim is read: MONITOR_CLAIM_URL, else the
 * health URL's origin plus /__kora. */
export const resolveClaimUrl = (
  config: Pick<KoraConfig, "MONITOR_CLAIM_URL" | "MONITOR_HEALTH_URL">,
): string =>
  config.MONITOR_CLAIM_URL ??
  new URL("/__kora", new URL(config.MONITOR_HEALTH_URL).origin).toString();
