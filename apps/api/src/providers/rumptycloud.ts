import { z } from "zod";

export type ProviderCapability =
  | "RESOURCE_DISCOVERY"
  | "RESOURCE_STATUS"
  | "HEALTH_OBSERVATION"
  | "LOG_ACCESS"
  | "METRIC_ACCESS"
  | "DEPLOYMENT_METADATA"
  | "RESTART"
  | "REDEPLOY"
  | "ROLLBACK"
  | "SCALING";

export interface ProviderResource {
  provider: string;
  providerAccount: string;
  region: string;
  resourceType: string;
  providerResourceId: string;
  displayName?: string;
  environment: string;
  status?: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

const SAFE_METADATA_KEYS = new Set(["publicUrl", "healthPath"]);
const SECRET_PATTERN = /token|secret|password|credential|api[_-]?key|authorization/i;

const rumptyResourceSchema = z.object({
  workspace: z.string().min(1),
  region: z.string().min(1),
  resourceType: z.enum(["virtual_machine", "deployment"]),
  resourceId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  environment: z.string().min(1),
  status: z.string().min(1).optional(),
  publicUrl: z.string().url().optional(),
  healthPath: z.string().startsWith("/").optional(),
});

export type RumptyResourceInput = z.infer<typeof rumptyResourceSchema>;

export class ProviderError extends Error {
  constructor(
    readonly code:
      | "AUTHENTICATION_FAILED"
      | "RATE_LIMITED"
      | "PROVIDER_UNAVAILABLE"
      | "MALFORMED_RESPONSE"
      | "UNKNOWN_RESOURCE",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function redactProviderText(value: string): string {
  return value
    .replace(/rmp_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(
      /(token|password|secret|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    );
}

export function normalizeProviderError(error: unknown): ProviderError {
  const message = redactProviderText(
    error instanceof Error ? error.message : String(error),
  );
  if (/401|403|unauthori[sz]ed|forbidden/i.test(message))
    return new ProviderError(
      "AUTHENTICATION_FAILED",
      "RumptyCloud authentication failed",
      false,
    );
  if (/429|rate.?limit/i.test(message))
    return new ProviderError(
      "RATE_LIMITED",
      "RumptyCloud rate limit reached",
      true,
    );
  if (/404|not found|unknown resource/i.test(message))
    return new ProviderError(
      "UNKNOWN_RESOURCE",
      "RumptyCloud resource was not found",
      false,
    );
  if (/timeout|timed out|ECONN|network|unavailable/i.test(message))
    return new ProviderError(
      "PROVIDER_UNAVAILABLE",
      "RumptyCloud is temporarily unavailable",
      true,
    );
  return new ProviderError(
    "MALFORMED_RESPONSE",
    `RumptyCloud response could not be normalized: ${message}`,
    false,
  );
}

export class RumptyCloudProvider {
  readonly name = "rumptycloud";
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set([
    "HEALTH_OBSERVATION",
  ]);

  normalizeResource(input: unknown): ProviderResource {
    const parsed = rumptyResourceSchema.parse(input);
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        SAFE_METADATA_KEYS.has(key) &&
        typeof value === "string" &&
        !SECRET_PATTERN.test(key)
      )
        metadata[key] = value;
    }
    return {
      provider: this.name,
      providerAccount: parsed.workspace,
      region: parsed.region,
      resourceType: parsed.resourceType,
      providerResourceId: parsed.resourceId,
      ...(parsed.displayName ? { displayName: parsed.displayName } : {}),
      environment: parsed.environment,
      ...(parsed.status ? { status: parsed.status } : {}),
      metadata,
    };
  }
}

// Official docs document API-key authentication and VM/deployment CLI operations,
// but not a stable machine-readable discovery response schema. The adapter therefore
// does not advertise RESOURCE_DISCOVERY or RESOURCE_STATUS yet.
