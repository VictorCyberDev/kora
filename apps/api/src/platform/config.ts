import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));
const optionalString = z.string().min(1).optional();

export const platformConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /** Public base URL of this Kora deployment (used for hosted sites, form endpoints, checkout callbacks). */
  KORA_PUBLIC_URL: z.string().url().optional(),
  /** Where monitors fetch Kora-hosted sites from; defaults to the public URL, else loopback. */
  KORA_MONITOR_BASE_URL: z.string().url().optional(),
  KORA_COOKIE_SECURE: bool,
  /** Legacy unauthenticated evidence routes (/incidents, /ui, ...). Default: off in production. */
  KORA_LEGACY_PUBLIC_API: bool,
  /** Controlled-test fault injection for Kora-hosted sites. Never on by default. */
  KORA_CHAOS_ENABLED: bool,
  KORA_TRUST_PROXY: bool,
  /** Creative engine for NEW designs. v2 keeps the previous designer; v3 is the Brand OS / SiteSpec v3 engine. Existing sites are never converted. */
  KORA_CREATIVE_ENGINE: z.enum(["v2", "v3"]).optional(),
  /** Let a configured model propose the opening headline for v3 sites. Proposals are validated against the owner's facts; failures fall back to deterministic copy. Off by default. */
  KORA_COPY_ASSIST: bool,
  /** Let a configured model rewrite page copy field by field for NEW v3 sites. Every edit is validated against the owner's facts; the deterministic site is the fallback. Off by default. */
  KORA_MODEL_COMPOSE: bool,
  /** Public https origin that serves owner pictures to published sites. Defaults to KORA_PUBLIC_URL; owner pictures are only embedded in designs when this is https. */
  KORA_MEDIA_PUBLIC_URL: z.string().url().optional(),
  KORA_SIGNUP_ENABLED: bool,
  // Unsplash (optional stock-photo provider). Backend-only; see packages/site-media/src/providers/unsplash.ts for the contract.
  KORA_MEDIA_UNSPLASH: z.enum(["on", "off"]).optional(),
  UNSPLASH_ACCESS_KEY: optionalString,
  UNSPLASH_APP_NAME: optionalString,
  UNSPLASH_RATE_LIMIT: optionalString,
  UNSPLASH_RESERVE: optionalString,
  UNSPLASH_API_BASE: optionalString,
  ACTION_VERIFICATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(180_000),
  ACTION_VERIFICATION_TICK_MS: z.coerce.number().int().min(250).default(3000),
  // Inference (provider-neutral, OpenAI-compatible).
  INFERENCE_BASE_URL: z.string().url().optional(),
  INFERENCE_API_KEY: optionalString,
  INFERENCE_MODEL: optionalString,
  INFERENCE_TIMEOUT_MS: z.string().optional(),
  INFERENCE_MAX_OUTPUT_TOKENS: z.string().optional(),
  // Provider-neutral AI (wins over INFERENCE_*). Any OpenAI-compatible endpoint, plus ordered fallbacks.
  AI_PROVIDER: optionalString,
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: optionalString,
  AI_MODEL: optionalString,
  AI_TIMEOUT_MS: z.string().optional(),
  AI_MAX_OUTPUT_TOKENS: z.string().optional(),
  AI_FALLBACK_1_PROVIDER: optionalString,
  AI_FALLBACK_1_BASE_URL: z.string().url().optional(),
  AI_FALLBACK_1_API_KEY: optionalString,
  AI_FALLBACK_1_MODEL: optionalString,
  AI_FALLBACK_2_PROVIDER: optionalString,
  AI_FALLBACK_2_BASE_URL: z.string().url().optional(),
  AI_FALLBACK_2_API_KEY: optionalString,
  AI_FALLBACK_2_MODEL: optionalString,
  AI_FALLBACK_3_PROVIDER: optionalString,
  AI_FALLBACK_3_BASE_URL: z.string().url().optional(),
  AI_FALLBACK_3_API_KEY: optionalString,
  AI_FALLBACK_3_MODEL: optionalString,
  // Independent Site Host (the production customer-site runtime).
  SITE_HOST_PUBLIC_URL: z.string().url().optional(),
  SITE_HOST_PROVIDER: z.string().min(1).optional(),
  SITE_HOST_RESOURCE_ID: z.string().min(1).optional(),
  // Rumpty static publishing (documented `rumpty sync` to a public bucket).
  RUMPTY_API_KEY: optionalString,
  /** The bucket publisher needs the `rumpty` CLI, which the stock image does not contain. */
  KORA_EXPERIMENTAL_RUMPTY_BUCKET: bool,
  RUMPTY_SITE_BUCKET: optionalString,
  RUMPTY_SITE_PUBLIC_BASE_URL: z.string().url().optional(),
  RUMPTY_SITE_REGION: optionalString,
  // Billing / domains / email (all optional; features report NOT_CONFIGURED).
  PAYSTACK_SECRET_KEY: optionalString,
  ENTRI_APPLICATION_ID: optionalString,
  OPENPROVIDER_USERNAME: optionalString,
  OPENPROVIDER_PASSWORD: optionalString,
  SMTP_URL: optionalString,
  // Marketing channels (all optional; each provider reports NOT_CONFIGURED until its credentials exist).
  /** 32 random bytes, base64. Encrypts provider tokens at rest. Without it no live provider can be connected. */
  KORA_SECRETS_KEY: optionalString,
  /** Fake providers for tests and demos. Ignored in production. */
  KORA_SANDBOX_CHANNELS: bool,
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  TIKTOK_CLIENT_KEY: optionalString,
  TIKTOK_CLIENT_SECRET: optionalString,
  LINKEDIN_CLIENT_ID: optionalString,
  LINKEDIN_CLIENT_SECRET: optionalString,
});
export type PlatformConfig = Omit<
  z.infer<typeof platformConfigSchema>,
  | "KORA_COOKIE_SECURE"
  | "KORA_LEGACY_PUBLIC_API"
  | "KORA_CHAOS_ENABLED"
  | "KORA_TRUST_PROXY"
  | "KORA_SIGNUP_ENABLED"
  | "KORA_EXPERIMENTAL_RUMPTY_BUCKET"
  | "KORA_SANDBOX_CHANNELS"
> & {
  KORA_CREATIVE_ENGINE: "v2" | "v3";
  KORA_COPY_ASSIST: boolean;
  KORA_MODEL_COMPOSE: boolean;
  KORA_COOKIE_SECURE: boolean;
  KORA_LEGACY_PUBLIC_API: boolean;
  KORA_CHAOS_ENABLED: boolean;
  KORA_TRUST_PROXY: boolean;
  KORA_SIGNUP_ENABLED: boolean;
  KORA_EXPERIMENTAL_RUMPTY_BUCKET: boolean;
  KORA_SANDBOX_CHANNELS: boolean;
};

/**
 * What each feature flag accepts, written once so the parser, the error messages and the documentation cannot drift.
 * `KORA_*` boolean flags take exactly `true` or `false`; the Unsplash switch takes exactly `on` or `off`; the creative
 * engine takes exactly `v2` or `v3`. Nothing else is guessed at: "on", "1", "yes" or "TRUE" for a boolean flag is rejected
 * at startup with a message naming the variable, never silently read as off.
 */
export const FLAG_SYNTAX = {
  KORA_CREATIVE_ENGINE: ["v2", "v3"],
  KORA_MEDIA_UNSPLASH: ["on", "off"],
  KORA_MODEL_COMPOSE: ["true", "false"],
  KORA_COPY_ASSIST: ["true", "false"],
} as const;

/** One or more invalid variables. The message names them and the accepted values; it never repeats the offending value. */
export class ConfigError extends Error {
  readonly issues: Array<{ variable: string; problem: string }>;
  constructor(issues: Array<{ variable: string; problem: string }>) {
    super(
      "Invalid Kora configuration:\n" +
        issues.map((i) => `  - ${i.variable}: ${i.problem}`).join("\n"),
    );
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export function loadPlatformConfig(
  env: Record<string, string | undefined> = process.env,
): PlatformConfig {
  // Surrounding whitespace (a common paste or dashboard artefact) is not part of a value; an empty value means "unset".
  const cleaned = Object.fromEntries(
    Object.entries(env).map(([k, v]) => {
      const t = typeof v === "string" ? v.trim() : v;
      return [k, t === "" ? undefined : t];
    }),
  );
  const parsed = platformConfigSchema.safeParse(cleaned);
  if (!parsed.success)
    throw new ConfigError(
      parsed.error.issues.map((i) => {
        const variable = String(i.path[0] ?? "(unknown)");
        const flag = FLAG_SYNTAX[variable as keyof typeof FLAG_SYNTAX];
        return {
          variable,
          problem: flag
            ? `must be exactly ${flag.map((f) => `"${f}"`).join(" or ")} (or unset)`
            : i.code === "invalid_format" || i.code === "invalid_type"
              ? "has an invalid format"
              : "has an invalid value",
        };
      }),
    );
  const c = parsed.data;
  const prod = c.NODE_ENV === "production";
  return {
    ...c,
    KORA_COOKIE_SECURE: c.KORA_COOKIE_SECURE ?? prod,
    KORA_LEGACY_PUBLIC_API: c.KORA_LEGACY_PUBLIC_API ?? !prod,
    KORA_CHAOS_ENABLED: c.KORA_CHAOS_ENABLED ?? false,
    KORA_CREATIVE_ENGINE: c.KORA_CREATIVE_ENGINE ?? "v2",
    KORA_COPY_ASSIST: c.KORA_COPY_ASSIST ?? false,
    KORA_MODEL_COMPOSE: c.KORA_MODEL_COMPOSE ?? false,
    KORA_TRUST_PROXY: c.KORA_TRUST_PROXY ?? prod,
    KORA_SIGNUP_ENABLED: c.KORA_SIGNUP_ENABLED ?? true,
    KORA_EXPERIMENTAL_RUMPTY_BUCKET: c.KORA_EXPERIMENTAL_RUMPTY_BUCKET ?? false,
    // Fake providers must never exist in production.
    KORA_SANDBOX_CHANNELS: prod ? false : (c.KORA_SANDBOX_CHANNELS ?? false),
  };
}

/**
 * Problems that do not stop the API from starting (the feature simply reports NOT_CONFIGURED or does nothing) but that an
 * operator must see at startup, because the flag says one thing and the environment another. Values are never included.
 */
export function releaseWarnings(
  env: Record<string, string | undefined>,
  c: PlatformConfig,
  o: { llmConfigured: boolean },
): string[] {
  const w: string[] = [];
  const has = (k: string) => !!env[k]?.trim();
  if (c.KORA_MEDIA_UNSPLASH === "on") {
    if (!has("UNSPLASH_ACCESS_KEY"))
      w.push(
        "KORA_MEDIA_UNSPLASH=on but UNSPLASH_ACCESS_KEY is not set: stock search will report NOT_CONFIGURED",
      );
    if (!has("UNSPLASH_APP_NAME"))
      w.push(
        "KORA_MEDIA_UNSPLASH=on but UNSPLASH_APP_NAME is not set: stock search will report NOT_CONFIGURED",
      );
    if (!c.KORA_SECRETS_KEY)
      w.push(
        "KORA_MEDIA_UNSPLASH=on but KORA_SECRETS_KEY is not set: selection tokens cannot be signed, so stock pictures cannot be applied",
      );
  }
  if (c.KORA_MODEL_COMPOSE && !o.llmConfigured)
    w.push(
      "KORA_MODEL_COMPOSE=true but no AI provider is configured (AI_* or INFERENCE_*): composition is skipped and the deterministic copy is used",
    );
  if (c.KORA_COPY_ASSIST && !o.llmConfigured)
    w.push(
      "KORA_COPY_ASSIST=true but no AI provider is configured (AI_* or INFERENCE_*): the headline assist is skipped",
    );
  if (c.KORA_CREATIVE_ENGINE === "v3" && !c.KORA_SECRETS_KEY)
    w.push(
      "KORA_CREATIVE_ENGINE=v3 without KORA_SECRETS_KEY: Unsplash selection and provider connections are unavailable (bundled photos still work)",
    );
  if (
    c.KORA_CREATIVE_ENGINE === "v3" &&
    !(c.KORA_MEDIA_PUBLIC_URL ?? c.KORA_PUBLIC_URL)?.startsWith("https://")
  )
    w.push(
      "KORA_MEDIA_PUBLIC_URL (or KORA_PUBLIC_URL) is not https: owner pictures are not embedded in new designs",
    );
  return w;
}
