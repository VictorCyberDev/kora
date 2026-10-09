export const PROVIDER_CAPABILITIES = [
  "RESOURCE_DISCOVERY",
  "RESOURCE_STATUS",
  "HEALTH_OBSERVATION",
  "LOG_ACCESS",
  "METRIC_ACCESS",
  "DEPLOYMENT_METADATA",
  "RESTART",
  "REDEPLOY",
  "ROLLBACK",
  "SCALING",
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];
export type ProviderResourceType = "virtual_machine" | "deployment" | "database" | "volume" | "bucket" | "unknown";
export type ProviderStatus = "running" | "stopped" | "provisioning" | "failed" | "unknown";
export interface ProviderResourceIdentity {
  provider: string;
  account: string;
  region: string;
  resourceType: ProviderResourceType;
  providerResourceId: string;
}
export interface ProviderResource {
  identity: ProviderResourceIdentity;
  displayName: string | null;
  status: ProviderStatus;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}
export type ProviderErrorCode = "AUTHENTICATION" | "RATE_LIMITED" | "TIMEOUT" | "UNAVAILABLE" | "MALFORMED_RESPONSE" | "NOT_FOUND" | "NETWORK" | "UNKNOWN";
export class ProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode, message: string, public readonly retryable: boolean, public readonly statusCode?: number) {
    super(message);
    this.name = "ProviderError";
  }
}
export interface CloudProvider {
  readonly id: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  discoverResources(): Promise<readonly ProviderResource[]>;
  getResource(identity: ProviderResourceIdentity): Promise<ProviderResource>;
}
export function resourceIdentityKey(identity: ProviderResourceIdentity): string {
  return [identity.provider, identity.account, identity.region, identity.resourceType, identity.providerResourceId].map(encodeURIComponent).join(":");
}
export function redactSecret(value: string, secrets: readonly (string | undefined)[]): string {
  return secrets.reduce((out, secret) => secret ? out.split(secret).join("[REDACTED]") : out, value);
}
