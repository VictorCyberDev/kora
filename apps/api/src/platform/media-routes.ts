import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { buildBlueprint } from "@kora/creative";
import {
  buildImageManifest,
  catalogExclude,
  catalogMediaPool,
  manifestReplacements,
  recipeForVertical,
  type SiteSpecV3,
} from "@kora/site-schema";
import { resolveVertical } from "@kora/creative";
import {
  ProviderError,
  UnsplashProvider,
  buildCandidatePool,
  deriveMediaKey,
  loadUnsplashConfig,
  mediaFingerprint,
  signToken,
  verifyToken,
  type MediaCandidate,
  type MediaProvider,
} from "@kora/site-media";
import { HttpError, requireUser } from "./http.js";
import { PostgresQuota } from "./media-quota.js";
import {
  PostgresPoolCache,
  claimSelection,
  rateLimited,
  releaseSelection,
} from "./media-state.js";
import type { PlatformConfig } from "./config.js";
import type { PlatformStore } from "./store.js";

type SiteForFn = (
  req: FastifyRequest,
  id: string,
  min?: "VIEWER" | "MEMBER" | "ADMIN" | "OWNER",
) => Promise<{
  site: { id: string; orgId: string; name: string; description: string };
}>;

const CANDIDATE_TTL = 30 * 60_000;
const SELECTION_TTL = 24 * 3_600_000;

interface CandidatePayload {
  k: "cand";
  org: string;
  site: string;
  exp: number;
  c: Pick<
    MediaCandidate,
    | "id"
    | "provider"
    | "description"
    | "displayUrl"
    | "width"
    | "height"
    | "creator"
    | "sourceUrl"
    | "attribution"
    | "licence"
    | "downloadLocation"
    | "placement"
  >;
}
interface SelectionPayload {
  k: "sel";
  org: string;
  site: string;
  exp: number;
  fp: string;
}

/**
 * The verifier handed to edits: true only for a stock picture this deployment offered and a person selected, for this exact
 * organisation and site, and unchanged since. It needs no server memory, so any instance can answer for any other.
 */
export function stockVerifier(
  key: Buffer | null,
  orgId: string,
  siteId: string,
  now = () => Date.now(),
) {
  return (
    media: Parameters<typeof mediaFingerprint>[0],
    token: string | undefined,
  ): boolean => {
    if (!key || !token) return false;
    const r = verifyToken<SelectionPayload>(token, key, now());
    return (
      r.ok &&
      r.payload.k === "sel" &&
      r.payload.org === orgId &&
      r.payload.site === siteId &&
      r.payload.fp === mediaFingerprint(media)
    );
  };
}

/**
 * Stock-photo candidates for the owner to choose from. Nothing here places a picture: a candidate becomes part of a site
 * only when a person selects it (the moment the provider's download event is recorded) and then applies it with an
 * ordinary structured edit carrying the server-signed selection token.
 */
export function registerMediaRoutes(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    config: PlatformConfig;
    siteFor: SiteForFn;
    entitled: (orgId: string, key: "canGenerate") => Promise<void>;
    providers?: MediaProvider[];
    now?: () => number;
  },
) {
  const now = d.now ?? (() => Date.now());
  const { problems, config: ucfg } = loadUnsplashConfig(
    d.config as unknown as Record<string, string | undefined>,
  );
  const unsplash = new UnsplashProvider({
    config: ucfg,
    quota: new PostgresQuota(d.platform.sql),
  });
  const providers: MediaProvider[] = d.providers ?? [unsplash];
  const cache = new PostgresPoolCache(d.platform.sql);
  const key = d.config.KORA_SECRETS_KEY
    ? deriveMediaKey(d.config.KORA_SECRETS_KEY)
    : null;
  const sql = d.platform.sql;
  const status = () =>
    providers.map((p) => ({
      id: p.id,
      status: p.available()
        ? ("AVAILABLE" as const)
        : ("NOT_CONFIGURED" as const),
    }));

  app.get("/api/media/providers", (req) => {
    const a = requireUser(req);
    const isAdmin = [...a.memberships.values()].some(
      (r) => r === "ADMIN" || r === "OWNER",
    );
    return {
      data: {
        providers: status(),
        signing: key ? "CONFIGURED" : "NOT_CONFIGURED",
        // Configuration detail is for administrators only.
        ...(isAdmin
          ? {
              configurationProblems: [
                ...problems,
                ...(key
                  ? []
                  : [
                      "KORA_SECRETS_KEY is required to sign picture selections",
                    ]),
              ],
            }
          : {}),
      },
    };
  });

  // Pictures from Kora's own vetted catalogue that suit this business, for the editor's picker. Nothing external is called.
  app.get("/api/sites/:id/media/catalogue", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { site } = await d.siteFor(req, id, "VIEWER");
    const bp = buildBlueprint({
      name: site.name,
      description: site.description || site.name,
    });
    const topics = bp.confirmedOfferCategories
      .map((c) => c.topicId)
      .filter((t): t is string => !!t);
    const vid = resolveVertical(`${site.name} ${site.description}`).id;
    const recipe = recipeForVertical(vid);
    const ex = catalogExclude(vid);
    return {
      data: catalogMediaPool(recipe, topics, "light", 40)
        .filter((m) => !ex?.test(m.alt))
        .map((m) => ({
          url: m.url,
          alt: m.alt,
          width: m.width,
          height: m.height,
          credit: m.attribution ?? "",
          license: m.license ?? "",
        })),
    };
  });

  // The owner's own uploaded photos, with the public address a published site would use. Without an https media origin the
  // pictures cannot be embedded in a site, and the list says so instead of offering something that would fail.
  app.get("/api/sites/:id/media/owner", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { site } = await d.siteFor(req, id, "VIEWER");
    const raw = (
      d.config.KORA_MEDIA_PUBLIC_URL ??
      d.config.KORA_PUBLIC_URL ??
      ""
    ).replace(/\/+$/, "");
    const base = /^https:\/\//.test(raw) ? raw : null;
    const rows =
      await sql`SELECT id,alt,width,height,role,sha256,quality FROM owner_media WHERE site_id=${site.id} AND kind='photo' AND removed_at IS NULL ORDER BY created_at DESC LIMIT 100`;
    return {
      data: {
        usable: base !== null,
        note: base
          ? null
          : "Your photos can be used on a published site once this deployment has a public https address for pictures.",
        items: rows.map((r) => ({
          id: String(r.id),
          alt: String(r.alt),
          width: Number(r.width),
          height: Number(r.height),
          role: String(r.role),
          url: base
            ? `${base}/api/public/sites/${site.id}/m/${String(r.sha256)}/w1280.webp`
            : null,
          thumbUrl: `/api/sites/${site.id}/media-library/${String(r.id)}/file?v=thumb`,
        })),
      },
    };
  });

  app.post("/api/sites/:id/media/candidates", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { site } = await d.siteFor(req, id, "MEMBER");
    // Plan limits apply here exactly as they do to generation: a lapsed plan cannot spend the shared provider allowance.
    await d.entitled(site.orgId, "canGenerate");
    if (!key)
      throw new HttpError(
        503,
        "media_signing_not_configured",
        "Picture suggestions are not available on this deployment yet.",
      );
    // One account must not be able to spend the application-wide hourly allowance for everyone. Counters are shared by
    // every instance (database), not held in process memory.
    if (
      (await rateLimited(
        sql,
        `cand:u:${requireUser(req).userId}`,
        10,
        60_000,
        now(),
      )) ||
      (await rateLimited(sql, `cand:o:${site.orgId}`, 6, 3_600_000, now()))
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
    const exp = now() + CANDIDATE_TTL;
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
          // Signed and bound to this organisation and site; the selection endpoint trusts nothing else the client sends.
          candidateToken: signToken(
            {
              k: "cand",
              org: site.orgId,
              site: site.id,
              exp,
              c: {
                id: c.id,
                provider: c.provider,
                description: c.description,
                displayUrl: c.displayUrl,
                width: c.width,
                height: c.height,
                creator: c.creator,
                sourceUrl: c.sourceUrl,
                attribution: c.attribution,
                licence: c.licence,
                ...(c.downloadLocation
                  ? { downloadLocation: c.downloadLocation }
                  : {}),
                placement: c.placement,
              },
            } satisfies CandidatePayload,
            key,
          ),
        })),
        report: pool.report,
        providers: status(),
      },
    };
  });

  app.post("/api/sites/:id/media/select", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { site } = await d.siteFor(req, id, "MEMBER");
    await d.entitled(site.orgId, "canGenerate");
    if (!key)
      throw new HttpError(
        503,
        "media_signing_not_configured",
        "Picture suggestions are not available on this deployment yet.",
      );
    const user = requireUser(req).userId;
    if (await rateLimited(sql, `sel:u:${user}`, 20, 60_000, now()))
      throw new HttpError(
        429,
        "rate_limited",
        "Too many selections. Slow down.",
      );
    const body = z
      .object({
        candidateToken: z.string().max(6000),
        alt: z.string().trim().max(200).optional(),
      })
      .parse(req.body);
    const t = verifyToken<CandidatePayload>(body.candidateToken, key, now());
    if (!t.ok || t.payload.k !== "cand")
      throw new HttpError(
        t.ok || t.reason === "expired" ? 410 : 400,
        t.ok
          ? "bad_token"
          : t.reason === "expired"
            ? "candidate_expired"
            : "bad_token",
        "That picture is no longer on offer. Search again.",
      );
    if (t.payload.org !== site.orgId || t.payload.site !== site.id)
      throw new HttpError(
        403,
        "wrong_site",
        "That suggestion was made for a different website.",
      );
    const c = t.payload.c;
    const provider = providers.find((p) => p.id === c.provider);
    if (!provider) throw new HttpError(404, "provider_not_found");
    try {
      // The person has chosen this picture: this is the moment the provider requires a download event, recorded once per
      // organisation and picture on whichever instance handles the request.
      if (
        c.placement === "owner-approval" &&
        (await claimSelection(sql, site.orgId, c.provider, c.id, user))
      ) {
        try {
          await provider.recordSelection?.(c as MediaCandidate);
        } catch (e) {
          await releaseSelection(sql, site.orgId, c.provider, c.id); // not recorded: the next try may record it
          throw e;
        }
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
    const media = {
      url: c.displayUrl,
      alt: (body.alt || c.description || `${site.name} photo`).slice(0, 200),
      width: c.width,
      height: c.height,
      role: "feature" as const,
      treatment: "none" as const,
      provenance: {
        sourceType: "licensed-stock" as const,
        provider: "Unsplash",
        license: c.licence,
        attribution: c.attribution,
        creatorName: c.creator.name,
        creatorUrl: c.creator.profileUrl,
        providerUrl: `https://unsplash.com/?utm_source=${encodeURIComponent(ucfg.appName || "kora")}&utm_medium=referral`,
        providerImageId: c.id,
        reviewStatus: "owner-approved" as const,
      },
    };
    return {
      data: {
        media,
        selectionToken: signToken(
          {
            k: "sel",
            org: site.orgId,
            site: site.id,
            exp: now() + SELECTION_TTL,
            fp: mediaFingerprint(media),
          } satisfies SelectionPayload,
          key,
        ),
        applyWith: {
          kind: "replace-media",
          note: "Send this media object and selectionToken in a replace-media edit to place it.",
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
        String(cur.parent_version_id),
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
