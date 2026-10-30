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
  KORA_SIGNUP_ENABLED: bool,
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
});
export type PlatformConfig = Omit<
  z.infer<typeof platformConfigSchema>,
  | "KORA_COOKIE_SECURE"
  | "KORA_LEGACY_PUBLIC_API"
  | "KORA_CHAOS_ENABLED"
  | "KORA_TRUST_PROXY"
  | "KORA_SIGNUP_ENABLED"
  | "KORA_EXPERIMENTAL_RUMPTY_BUCKET"
> & {
  KORA_COOKIE_SECURE: boolean;
  KORA_LEGACY_PUBLIC_API: boolean;
  KORA_CHAOS_ENABLED: boolean;
  KORA_TRUST_PROXY: boolean;
  KORA_SIGNUP_ENABLED: boolean;
  KORA_EXPERIMENTAL_RUMPTY_BUCKET: boolean;
};

export function loadPlatformConfig(
  env: Record<string, string | undefined> = process.env,
): PlatformConfig {
  const cleaned = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const c = platformConfigSchema.parse(cleaned);
  const prod = c.NODE_ENV === "production";
  return {
    ...c,
    KORA_COOKIE_SECURE: c.KORA_COOKIE_SECURE ?? prod,
    KORA_LEGACY_PUBLIC_API: c.KORA_LEGACY_PUBLIC_API ?? !prod,
    KORA_CHAOS_ENABLED: c.KORA_CHAOS_ENABLED ?? false,
    KORA_TRUST_PROXY: c.KORA_TRUST_PROXY ?? prod,
    KORA_SIGNUP_ENABLED: c.KORA_SIGNUP_ENABLED ?? true,
    KORA_EXPERIMENTAL_RUMPTY_BUCKET: c.KORA_EXPERIMENTAL_RUMPTY_BUCKET ?? false,
  };
}
