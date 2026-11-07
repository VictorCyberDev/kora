/**
 * Media provider contract. Every picture a site can show comes from exactly one source, in this order of preference:
 * owner-supplied, Kora's curated catalogue, an approved stock provider, AI-generated editorial art (when configured),
 * procedural graphics, then type alone. Providers return CANDIDATES with their rights metadata; whether a candidate may be
 * placed automatically or only after the owner picks it is decided by `placement`, which comes from the provider's own
 * terms and is never overridden by a caller.
 */
export type RightsStatus =
  "owner-supplied" | "kora-licensed" | "provider-licence" | "unknown";

export interface MediaCandidate {
  /** Stable id within the provider. */
  id: string;
  provider: string;
  /** What a search described this picture as (alt text from the provider). Untrusted text. */
  description: string;
  /** Hotlink URL as the provider requires it, with its tracking parameters intact. */
  displayUrl: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "squarish";
  creator: { name: string; profileUrl: string };
  /** The provider's page for the photo (for attribution links). */
  sourceUrl: string;
  /** Pre-built, ready-to-render credit text. */
  attribution: string;
  licence: string;
  licenceUrl: string;
  rights: RightsStatus;
  /** "automatic": may be placed without a person choosing it. "owner-approval": only after the owner selects it. */
  placement: "automatic" | "owner-approval";
  /** Opaque value the provider needs to record that a person chose this picture (Unsplash: links.download_location). */
  downloadLocation?: string;
  colour?: string;
  /** Topic ids the picture honestly depicts, when the provider's catalogue is tagged. */
  topics?: string[];
  fetchedAt: string;
  /** Raw provider relevance, when given. */
  providerScore?: number;
}

export interface SearchRequest {
  query: string;
  orientation?: "landscape" | "portrait" | "squarish";
  perPage?: number;
}

export interface MediaProvider {
  readonly id: string;
  /** False when the provider is switched off or not configured; the engine then skips it without error. */
  available(): boolean;
  search(req: SearchRequest, signal?: AbortSignal): Promise<MediaCandidate[]>;
  /** Records that a person selected this picture, where the provider requires it. Never called for automatic placement. */
  recordSelection?(c: MediaCandidate, signal?: AbortSignal): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "rate_limited"
      | "quota_reserved"
      | "unauthorized"
      | "upstream"
      | "invalid_response",
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
