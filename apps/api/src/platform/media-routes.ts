import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { buildBlueprint } from "@kora/creative";
import {
  buildImageManifest,
  manifestReplacements,
  type SiteSpecV3,
} from "@kora/site-schema";
import {
  InMemoryPoolCache,
  ProviderError,
  UnsplashProvider,
  buildCandidatePool,
  loadUnsplashConfig,
  type MediaCandidate,
  type MediaProvider,
} from "@kora/site-media";
import { HttpError, requireUser } from "./http.js";
import { PostgresQuota } from "./media-quota.js";
import type { PlatformConfig } from "./config.js";
import type { PlatformStore } from "./store.js";

type SiteForFn = (
  req: FastifyRequest,
  id: string,
  min?: "VIEWER" | "MEMBER" | "ADMIN" | "OWNER",
) => Promise<{
  site: { id: string; orgId: string; name: string; description: string };
}>;

/**
 * Stock-photo candidates for the owner to choose from. Nothing here places a picture: a candidate becomes part of a site
 * only when a person selects it (which is when the provider's download event is recorded) and then applies it with an
 * ordinary structured edit, which passes the same validation as everything else.
 */
export function registerMediaRoutes(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    config: PlatformConfig;
    siteFor: SiteForFn;
    providers?: MediaProvider[];
  },
) {
  const { problems, config: ucfg } = loadUnsplashConfig(
    d.config as unknown as Record<string, string | undefined>,
  );
  const unsplash = new UnsplashProvider({
    config: ucfg,
    quota: new PostgresQuota(d.platform.sql),
  });
  const providers: MediaProvider[] = d.providers ?? [unsplash];
  const cache = new InMemoryPoolCache();
  // What was last offered, so a selection refers to a server-held candidate and never to client-supplied URLs.
  const offered = new Map<string, { at: number; c: MediaCandidate }>();
  const key = (orgId: string, p: string, id: string) => `${orgId}:${p}:${id}`;
  // Sliding-window limiter: `max` hits per `windowMs` for one key. Empty keys are dropped so the map stays small.
  const windows = new Map<string, number[]>();
  const limited = (key: string, max: number, windowMs: number) => {
    const now = Date.now();
    const arr = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      windows.set(key, arr);
      return true;
    }
    arr.push(now);
    windows.set(key, arr);
    if (windows.size > 5000)
      for (const [k, v] of windows)
        if (!v.some((t) => now - t < windowMs)) windows.delete(k);
    return false;
  };
  const OFFER_TTL = 30 * 60_000;
  const recorded = new Set<string>();

  app.get("/api/media/providers", (req) => {
    const a = requireUser(req);
    const isAdmin = [...a.memberships.values()].some(
      (r) => r === "ADMIN" || r === "OWNER",
    );
    return {
      data: {
        providers: providers.map((p) => ({
          id: p.id,
          status: p.available() ? "AVAILABLE" : "NOT_CONFIGURED",
        })),
        // Configuration detail is for administrators only.
        ...(isAdmin ? { configurationProblems: problems } : {}),
      },
    };
  });

  app.post("/api/sites/:id/media/candidates", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { site } = await d.siteFor(req, id, "MEMBER");
    // One account must not be able to spend the application-wide hourly allowance for everyone: searches are limited
    // per user per minute and per organisation per hour, and only the server-derived intents are used when none given.
    if (
      limited(`u:${requireUser(req).userId}`, 10, 60_000) ||
      limited(`o:${site.orgId}`, 6, 3_600_000)
    )
      throw new HttpError(
        429,
        "rate_limited",
        "Too many image searches. Try again later.",
      );
    const body = z
      .object({
        intents: z
          .array(z.string().trim().min(2).max(60))
          .min(1)
          .max(4)
          .optional(),
      })
      .parse(req.body ?? {});
    const bp = buildBlueprint({
      name: site.name,
      description: site.description || site.name,
    });
    const intents = body.intents ?? bp.imagePlan.searchIntents;
    const pool = await buildCandidatePool({
      intents,
      providers,
      cache,
      budget: 4,
    });
    for (const c of pool.candidates)
      offered.set(key(site.orgId, c.provider, c.id), { at: Date.now(), c });
    for (const [k, v] of offered)
      if (Date.now() - v.at > OFFER_TTL) offered.delete(k);
    while (offered.size > 2000) offered.delete(offered.keys().next().value!);
    return {
      data: {
        intents,
        candidates: pool.candidates.map((c) => ({
          id: c.id,
          provider: c.provider,
          description: c.description,
          previewUrl: c.displayUrl,
          orientation: c.orientation,
          attribution: c.attribution,
          requiresOwnerApproval: c.placement === "owner-approval",
        })),
        report: pool.report,
        providers: providers.map((p) => ({
          id: p.id,
          status: p.available() ? "AVAILABLE" : "NOT_CONFIGURED",
        })),
      },
    };
  });

  app.post("/api/sites/:id/media/select", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { site } = await d.siteFor(req, id, "MEMBER");
    const body = z
      .object({
        provider: z.string().max(40),
        id: z.string().max(80),
        alt: z.string().trim().max(200).optional(),
      })
      .parse(req.body);
    if (limited(`s:${requireUser(req).userId}`, 20, 60_000))
      throw new HttpError(
        429,
        "rate_limited",
        "Too many selections. Slow down.",
      );
    const hit = offered.get(key(site.orgId, body.provider, body.id));
    if (!hit || Date.now() - hit.at > OFFER_TTL)
      throw new HttpError(
        410,
        "candidate_expired",
        "That picture is no longer on offer. Search again.",
      );
    const provider = providers.find((p) => p.id === hit.c.provider);
    if (!provider) throw new HttpError(404, "provider_not_found");
    try {
      // The person has chosen this picture: this is the moment the provider requires a download event.
      // One download event per organisation and picture, however often the selection is repeated.
      const once = key(site.orgId, hit.c.provider, hit.c.id);
      if (hit.c.placement === "owner-approval" && !recorded.has(once)) {
        await provider.recordSelection?.(hit.c);
        recorded.add(once);
        if (recorded.size > 5000)
          recorded.delete(recorded.keys().next().value!);
      }
    } catch (e) {
      if (e instanceof ProviderError)
        throw new HttpError(
          e.code === "rate_limited" || e.code === "quota_reserved" ? 429 : 502,
          e.code,
          e.message,
        );
      throw e;
    }
    const c = hit.c;
    return {
      data: {
        media: {
          url: c.displayUrl,
          alt: (body.alt || c.description || `${site.name} photo`).slice(
            0,
            200,
          ),
          width: c.width,
          height: c.height,
          role: "feature",
          treatment: "none",
          provenance: {
            sourceType: "licensed-stock",
            provider: "Unsplash",
            license: c.licence,
            attribution: c.attribution,
            creatorName: c.creator.name,
            creatorUrl: c.creator.profileUrl,
            providerUrl: `https://unsplash.com/?utm_source=${encodeURIComponent(ucfg.appName || "kora")}&utm_medium=referral`,
            providerImageId: c.id,
            reviewStatus: "owner-approved",
          },
        },
        applyWith: {
          kind: "replace-media",
          note: "Send this media object in a replace-media edit to place it.",
        },
      },
    };
  });

  // The manifest is derived from the stored spec, with the replacement history read from the version chain.
  app.get("/api/sites/:id/versions/:versionId/media-manifest", async (req) => {
    const { id, versionId } = z
      .object({ id: z.string().uuid(), versionId: z.string().uuid() })
      .parse(req.params);
    const { site } = await d.siteFor(req, id, "VIEWER");
    const row = await d.platform.getVersionRow(site.id, versionId);
    if (!row) throw new HttpError(404, "not_found");
    const spec = row.spec as { version?: number };
    if (spec.version !== 3) return { data: { supported: false } };
    const manifest = buildImageManifest(spec as SiteSpecV3);
    const history: Array<{
      versionId: string;
      replacements: ReturnType<typeof manifestReplacements>;
    }> = [];
    let cur = row;
    for (let i = 0; i < 25 && (cur.parent_version_id as string | null); i++) {
      const parent = await d.platform.getVersionRow(
        site.id,
        String(cur.parent_version_id as string | null),
      );
      if (!parent || (parent.spec as { version?: number }).version !== 3) break;
      const r = manifestReplacements(
        buildImageManifest(parent.spec as SiteSpecV3),
        buildImageManifest(cur.spec as SiteSpecV3),
      );
      if (r.length)
        history.push({ versionId: String(cur.id), replacements: r });
      cur = parent;
    }
    return { data: { supported: true, manifest, replacementHistory: history } };
  });
}
