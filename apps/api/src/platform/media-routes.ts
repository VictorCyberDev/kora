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
  const perUser = new Map<string, number[]>();
  const limited = (u: string) => {
    const now = Date.now();
    const arr = (perUser.get(u) ?? []).filter((t) => now - t < 60_000);
    if (arr.length >= 10) return true;
    arr.push(now);
    perUser.set(u, arr);
    return false;
  };

  app.get("/api/media/providers", (req) => {
    requireUser(req);
    return {
      data: {
        providers: providers.map((p) => ({
          id: p.id,
          status: p.available() ? "AVAILABLE" : "NOT_CONFIGURED",
        })),
        configurationProblems: problems,
      },
    };
  });

  app.post("/api/sites/:id/media/candidates", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { site } = await d.siteFor(req, id, "MEMBER");
    if (limited(requireUser(req).userId))
      throw new HttpError(
        429,
        "rate_limited",
        "Too many searches. Try again in a minute.",
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
      if (Date.now() - v.at > 30 * 60_000) offered.delete(k);
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
    const hit = offered.get(key(site.orgId, body.provider, body.id));
    if (!hit)
      throw new HttpError(
        410,
        "candidate_expired",
        "That picture is no longer on offer. Search again.",
      );
    const provider = providers.find((p) => p.id === hit.c.provider);
    if (!provider) throw new HttpError(404, "provider_not_found");
    try {
      // The person has chosen this picture: this is the moment the provider requires a download event.
      if (hit.c.placement === "owner-approval")
        await provider.recordSelection?.(hit.c);
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
