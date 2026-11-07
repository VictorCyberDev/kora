import {
  ProviderError,
  type MediaCandidate,
  type MediaProvider,
  type SearchRequest,
} from "./types.js";
import { HOUR_MS, InMemoryQuota, type QuotaStore } from "./quota.js";

/**
 * Deployment configuration contract. Names only; values are set by whoever operates the deployment (backend-only, never
 * shipped to a browser, never logged, never written into a site):
 *
 *   KORA_MEDIA_UNSPLASH       "on" to enable the provider (default off)
 *   UNSPLASH_ACCESS_KEY       the application's Access Key (sent as `Authorization: Client-ID <key>`)
 *   UNSPLASH_APP_NAME         the registered application name, used as utm_source in every attribution link
 *   UNSPLASH_RATE_LIMIT       requests per hour allowed to the application (default 50, the demo-mode limit)
 *   UNSPLASH_RESERVE          requests always kept unspent (default 10) so interactive owners are never starved
 *   UNSPLASH_API_BASE         override for tests only (default https://api.unsplash.com)
 */
export interface UnsplashConfig {
  enabled: boolean;
  accessKey: string;
  appName: string;
  limitPerHour: number;
  reserve: number;
  apiBase: string;
}

export function loadUnsplashConfig(env: Record<string, string | undefined>): {
  config: UnsplashConfig;
  problems: string[];
} {
  const problems: string[] = [];
  const enabled = env.KORA_MEDIA_UNSPLASH === "on";
  const accessKey = env.UNSPLASH_ACCESS_KEY?.trim() ?? "";
  const appName = env.UNSPLASH_APP_NAME?.trim() ?? "";
  const num = (name: string, dflt: number, min: number, max: number) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return dflt;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} must be an integer from ${min} to ${max}`);
      return dflt;
    }
    return n;
  };
  const limitPerHour = num("UNSPLASH_RATE_LIMIT", 50, 1, 100_000);
  const reserve = num("UNSPLASH_RESERVE", 10, 0, 1000);
  if (reserve >= limitPerHour)
    problems.push("UNSPLASH_RESERVE must be lower than UNSPLASH_RATE_LIMIT");
  const apiBase = (
    env.UNSPLASH_API_BASE?.trim() || "https://api.unsplash.com"
  ).replace(/\/+$/, "");
  if (enabled) {
    if (!accessKey)
      problems.push(
        "UNSPLASH_ACCESS_KEY is required when KORA_MEDIA_UNSPLASH=on",
      );
    if (!/^[A-Za-z0-9._ -]{2,60}$/.test(appName))
      problems.push(
        "UNSPLASH_APP_NAME is required (2-60 plain characters) when KORA_MEDIA_UNSPLASH=on",
      );
    if (
      !/^https:\/\//.test(apiBase) &&
      !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(apiBase)
    )
      problems.push(
        "UNSPLASH_API_BASE must be https (or a loopback address in tests)",
      );
  }
  return {
    config: { enabled, accessKey, appName, limitPerHour, reserve, apiBase },
    problems,
  };
}

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color?: string | null;
  description?: string | null;
  alt_description?: string | null;
  urls: { raw: string; regular: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

const addUtm = (url: string, appName: string) => {
  const u = new URL(url);
  u.searchParams.set("utm_source", appName);
  u.searchParams.set("utm_medium", "referral");
  return u.toString();
};
const orient = (w: number, h: number): MediaCandidate["orientation"] =>
  w / h > 1.15 ? "landscape" : w / h < 0.87 ? "portrait" : "squarish";

/** Builds the hotlink URL: the provider's own URL with sizing parameters added and every existing parameter (ixid) kept. */
export function displayUrl(raw: string, width: number): string {
  const u = new URL(raw);
  u.searchParams.set("w", String(width));
  u.searchParams.set("fm", "webp");
  u.searchParams.set("q", "75");
  u.searchParams.set("fit", "crop");
  return u.toString();
}

export interface UnsplashDeps {
  config: UnsplashConfig;
  quota?: QuotaStore;
  fetch?: typeof fetch;
  now?: () => number;
}

export class UnsplashProvider implements MediaProvider {
  readonly id = "unsplash";
  private readonly quota: QuotaStore;
  private readonly f: typeof fetch;
  private readonly now: () => number;
  /** Counters for the acceptance report: what this process asked the provider, and what it did not need to. */
  readonly stats = {
    requests: 0,
    refusedByQuota: 0,
    rateLimited: 0,
    downloadsTracked: 0,
  };
  constructor(private readonly d: UnsplashDeps) {
    this.quota = d.quota ?? new InMemoryQuota();
    this.f = d.fetch ?? fetch;
    this.now = d.now ?? Date.now;
  }
  available() {
    return (
      this.d.config.enabled &&
      !!this.d.config.accessKey &&
      !!this.d.config.appName
    );
  }
  private async call(path: string, signal?: AbortSignal): Promise<Response> {
    const c = this.d.config;
    if (!this.available())
      throw new ProviderError("not_configured", "Unsplash is not configured");
    const decision = await this.quota.tryConsume(
      this.id,
      c.limitPerHour,
      c.reserve,
      this.now(),
    );
    if (!decision.allowed) {
      this.stats.refusedByQuota++;
      throw new ProviderError(
        "quota_reserved",
        "The hourly image-search allowance is used up; try again later",
        Math.max(0, decision.resetsAt - this.now()),
      );
    }
    this.stats.requests++;
    let res: Response;
    try {
      res = await this.f(`${c.apiBase}${path}`, {
        headers: {
          authorization: `Client-ID ${c.accessKey}`,
          "accept-version": "v1",
        },
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      throw new ProviderError(
        "upstream",
        `Unsplash could not be reached: ${(e as Error).name}`,
      );
    }
    const rawRemaining = res.headers.get("x-ratelimit-remaining");
    const remaining = Number(rawRemaining);
    if (rawRemaining !== null && Number.isFinite(remaining)) {
      // A hostile or buggy header must not break accounting: clamp, and never let a counter failure fail a search.
      const safe = Math.min(c.limitPerHour, Math.max(0, Math.trunc(remaining)));
      try {
        await this.quota.observe(this.id, safe, c.limitPerHour, this.now());
      } catch {
        /* the provider answered; accounting is best-effort here */
      }
    }
    if (res.status === 429) {
      this.stats.rateLimited++;
      await this.quota.exhaust(this.id, this.now());
      const ra = Number(res.headers.get("retry-after"));
      throw new ProviderError(
        "rate_limited",
        "Unsplash rate limit reached",
        Number.isFinite(ra) && ra > 0 ? ra * 1000 : HOUR_MS,
      );
    }
    if (res.status === 401 || res.status === 403)
      throw new ProviderError(
        "unauthorized",
        "Unsplash rejected the access key",
      );
    if (!res.ok)
      throw new ProviderError("upstream", `Unsplash answered ${res.status}`);
    return res;
  }

  async search(
    req: SearchRequest,
    signal?: AbortSignal,
  ): Promise<MediaCandidate[]> {
    const q = new URLSearchParams({
      query: req.query.slice(0, 120),
      per_page: String(Math.min(30, Math.max(1, req.perPage ?? 12))),
      content_filter: "high",
      ...(req.orientation ? { orientation: req.orientation } : {}),
    });
    const res = await this.call(`/search/photos?${q.toString()}`, signal);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ProviderError(
        "invalid_response",
        "Unsplash returned something that is not JSON",
      );
    }
    const results = (body as { results?: unknown }).results;
    if (!Array.isArray(results))
      throw new ProviderError(
        "invalid_response",
        "Unsplash returned an unexpected shape",
      );
    const out: MediaCandidate[] = [];
    for (const p of results as UnsplashPhoto[]) {
      const ok =
        p &&
        typeof p.id === "string" &&
        p.urls?.raw &&
        p.links?.html &&
        p.links.download_location &&
        p.user?.name &&
        p.user.links?.html &&
        Number.isFinite(p.width) &&
        Number.isFinite(p.height) &&
        p.height > 0;
      if (!ok) continue;
      try {
        for (const u of [
          p.urls.raw,
          p.links.html,
          p.user.links.html,
          p.links.download_location,
        ]) {
          const url = new URL(u);
          if (
            url.protocol !== "https:" ||
            !/(^|\.)unsplash\.com$/.test(url.hostname)
          )
            throw new Error("foreign host");
        }
      } catch {
        continue; // never trust a URL from a provider response that points anywhere else
      }
      const name = p.user.name.replace(/[\p{Cc}<>"]/gu, "").slice(0, 80);
      out.push({
        id: p.id,
        provider: this.id,
        description: (p.alt_description || p.description || "")
          .replace(/[\p{Cc}<>]/gu, "")
          .slice(0, 200),
        displayUrl: displayUrl(p.urls.raw, 1600),
        width: p.width,
        height: p.height,
        orientation: orient(p.width, p.height),
        creator: {
          name,
          profileUrl: addUtm(p.user.links.html, this.d.config.appName),
        },
        sourceUrl: addUtm(p.links.html, this.d.config.appName),
        attribution: `Photo by ${name} on Unsplash`,
        licence: "Unsplash License",
        licenceUrl: "https://unsplash.com/license",
        rights: "provider-licence",
        // Unsplash's API is for non-automated use and asks for download tracking when a person picks a photo, so these are
        // proposals for the owner, never silent placements.
        placement: "owner-approval",
        downloadLocation: p.links.download_location,
        ...(p.color ? { colour: p.color } : {}),
        fetchedAt: new Date(this.now()).toISOString(),
      });
    }
    return out;
  }

  /** Must be called when a person chooses a picture. The endpoint is for tracking only; the returned URL is not used. */
  async recordSelection(
    c: MediaCandidate,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!c.downloadLocation)
      throw new ProviderError(
        "invalid_response",
        "This picture has no download location",
      );
    const u = new URL(c.downloadLocation);
    if (
      u.protocol !== "https:" ||
      !/(^|\.)unsplash\.com$/.test(u.hostname) ||
      !/^\/photos\/[A-Za-z0-9_-]+\/download$/.test(u.pathname)
    )
      throw new ProviderError(
        "invalid_response",
        "Unexpected download location",
      );
    await this.call(`${u.pathname}${u.search}`, signal);
    this.stats.downloadsTracked++;
  }
}
