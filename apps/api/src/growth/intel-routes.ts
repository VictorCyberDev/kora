import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ATTRIBUTION_NOTE,
  MEMORY_KINDS,
  TRACK_CODE,
  buildPresenceGraph,
  isLikelyBot,
  isSensitive,
  normalizeMetrics,
  outcomeEntry,
  suggestReply,
  summarizeAttribution,
  summarizeReviews,
  totals,
  trackedUrl,
  type ChannelProvider,
} from "@kora/growth";
import {
  HttpError,
  notFound,
  requireOrgRole,
  requireUser,
  type Role,
} from "../platform/http.js";
import type { PlatformStore } from "../platform/store.js";
import type { BillingService } from "../platform/billing.js";
import { RateLimiter } from "../platform/security.js";
import type { CalendarStore } from "./calendar-store.js";
import type { ChannelsStore } from "./channels-store.js";
import type { createGatherer } from "./gather.js";
import type { IntelStore } from "./intel-store.js";
import type { ProviderRegistry, TokenSet } from "./providers.js";
import type { SecretBox } from "./secrets.js";
import { requireFeature } from "./entitlements.js";

export interface IntelDeps {
  platform: PlatformStore;
  billing: BillingService;
  intel: IntelStore;
  calendar: CalendarStore;
  channels: ChannelsStore;
  providers: ProviderRegistry;
  secrets: SecretBox | null;
  gather: ReturnType<typeof createGatherer>;
  now?: () => Date;
}
const uuid = z.string().uuid();
const DAY = 86_400_000;

export function registerIntelRoutes(app: FastifyInstance, d: IntelDeps) {
  const {
    platform,
    billing,
    intel,
    calendar,
    channels,
    providers,
    secrets,
    gather,
  } = d;
  const now = d.now ?? (() => new Date());
  const eventLimiter = new RateLimiter(120, 60_000);
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };

  // ---- attribution ------------------------------------------------------------
  // Public and unauthenticated by nature (a visitor's browser calls it), so it accepts only a known tracking code for
  // this exact site, stores no personal data, ignores bots, and is rate limited.
  void app.register((scope) => {
    scope.addContentTypeParser(
      "text/plain",
      { parseAs: "string" },
      (
        _r: FastifyRequest,
        body: string,
        done: (e: Error | null, v?: unknown) => void,
      ) => done(null, body),
    );
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (
        _r: FastifyRequest,
        body: string,
        done: (e: Error | null, v?: unknown) => void,
      ) => done(null, body),
    );
    scope.post(
      "/api/public/sites/:id/events",
      { bodyLimit: 1024 },
      async (req, reply) => {
        const { id } = z.object({ id: uuid }).parse(req.params);
        if (!eventLimiter.take(`ev:${req.ip}:${id}`))
          return reply.code(204).send();
        if (isLikelyBot(req.headers["user-agent"]))
          return reply.code(204).send();
        let body: unknown;
        try {
          body = JSON.parse(typeof req.body === "string" ? req.body : "");
        } catch {
          return reply.code(204).send();
        }
        const p = z
          .object({
            k: z.string().regex(TRACK_CODE),
            t: z.enum(["visit", "call", "whatsapp"]),
          })
          .safeParse(body);
        if (!p.success) return reply.code(204).send();
        if ((await intel.siteOfCode(p.data.k)) !== id)
          return reply.code(204).send();
        await intel.record(
          p.data.k,
          id,
          p.data.t === "visit"
            ? "VISIT"
            : p.data.t === "call"
              ? "CALL_TAP"
              : "WHATSAPP_TAP",
        );
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  });

  app.get("/api/sites/:id/attribution", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "attribution");
    const q = z
      .object({ days: z.coerce.number().int().min(1).max(180).default(30) })
      .parse(req.query);
    const end = now();
    const results = await intel.results(
      site.id,
      new Date(end.getTime() - q.days * DAY),
      end,
    );
    return {
      data: {
        days: q.days,
        summary: summarizeAttribution(results),
        links: results,
        note: ATTRIBUTION_NOTE,
      },
    };
  });

  app.post(
    "/api/sites/:id/calendar/items/:itemId/tracked-link",
    async (req) => {
      const site = await siteFor(req, "MEMBER");
      await requireFeature(billing, site.orgId, "attribution");
      const { itemId } = z.object({ itemId: uuid }).parse(req.params);
      const item = await calendar.get(site.id, itemId);
      if (!item) throw notFound();
      if (!site.publicUrl)
        throw new HttpError(
          409,
          "not_published",
          "Publish your website first so the link has somewhere to go.",
        );
      const provider = item.channels[0];
      if (!provider)
        throw new HttpError(
          422,
          "no_channels",
          "Choose where this post goes first.",
        );
      const code = await intel.linkFor({
        siteId: site.id,
        orgId: site.orgId,
        provider,
        itemId: item.id,
        label: item.title,
      });
      return {
        data: {
          url: trackedUrl(site.publicUrl, {
            code,
            provider,
            campaign: item.title,
            content: item.id.slice(0, 8),
          }),
        },
      };
    },
  );

  // ---- social analytics -----------------------------------------------------------
  app.post("/api/sites/:id/analytics/sync", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "analytics");
    const since = new Date(now().getTime() - 7 * DAY).toISOString();
    const out: Array<{
      provider: string;
      synced: number;
      mode?: string;
      unavailable?: string;
    }> = [];
    for (const c of (await channels.list(site.id)).filter(
      (x) => x.state === "CONNECTED",
    )) {
      const adapter = providers.adapter(c.provider);
      const sealed = await channels.sealedToken(site.id, c.provider);
      if (!adapter?.metrics || !sealed || !secrets) {
        out.push({
          provider: c.provider,
          synced: 0,
          unavailable:
            "Results from this channel are not available through Kora yet.",
        });
        continue;
      }
      const raw = await adapter.metrics(secrets.open<TokenSet>(sealed), since);
      out.push({
        provider: c.provider,
        synced: await intel.saveMetrics({
          siteId: site.id,
          orgId: site.orgId,
          provider: c.provider,
          mode: c.mode,
          rows: normalizeMetrics(c.provider, raw),
        }),
        mode: c.mode,
      });
    }
    return { data: out };
  });
  app.get("/api/sites/:id/analytics", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "analytics");
    const since = new Date(now().getTime() - 30 * DAY)
      .toISOString()
      .slice(0, 10);
    const rows = await intel.metrics(site.id, since);
    const providersSeen = [...new Set(rows.map((r) => r.provider))];
    return {
      data: {
        providers: providersSeen.map((p) => {
          const mine = rows.filter((r) => r.provider === p);
          return {
            provider: p,
            mode: mine[0]!.mode,
            totals: totals(mine),
            unmapped: [
              ...new Set(
                mine.filter((r) => r.metric === "unmapped").map((r) => r.name),
              ),
            ],
          };
        }),
        note: "Numbers come straight from each platform and are shown as they report them. Test accounts are labelled and never counted in your brief.",
      },
    };
  });

  // ---- reviews & reputation ---------------------------------------------------------
  const reviewView = async (siteId: string) => {
    const rows = await intel.reviews(siteId);
    return {
      reviews: rows,
      summary: summarizeReviews(rows.filter((r) => r.mode !== "SANDBOX")),
    };
  };
  app.get("/api/sites/:id/reviews", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "reviews");
    return { data: await reviewView(site.id) };
  });
  app.post("/api/sites/:id/reviews", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "reviews");
    const b = z
      .object({
        provider: z.enum([
          "google_business",
          "facebook",
          "instagram",
          "tiktok",
          "whatsapp",
        ]),
        rating: z.number().int().min(1).max(5),
        author: z.string().trim().max(120).default(""),
        body: z.string().trim().max(4000).default(""),
        reviewedAt: z.string().datetime().optional(),
      })
      .strict()
      .parse(req.body);
    const id = await intel.upsertReview({
      siteId: site.id,
      orgId: site.orgId,
      provider: b.provider,
      mode: "MANUAL",
      externalId: `manual-${crypto.randomUUID()}`,
      rating: b.rating,
      author: b.author,
      body: b.body,
      reviewedAt: b.reviewedAt ?? now().toISOString(),
      sensitive: isSensitive(b),
    });
    return reply.code(201).send({ data: { id } });
  });
  app.post("/api/sites/:id/reviews/sync", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "reviews");
    let added = 0;
    for (const c of (await channels.list(site.id)).filter(
      (x) => x.state === "CONNECTED",
    )) {
      const adapter = providers.adapter(c.provider);
      const sealed = await channels.sealedToken(site.id, c.provider);
      if (!adapter?.reviews || !sealed || !secrets) continue;
      for (const r of await adapter.reviews(secrets.open<TokenSet>(sealed))) {
        const id = await intel.upsertReview({
          siteId: site.id,
          orgId: site.orgId,
          provider: c.provider,
          mode: c.mode,
          externalId: r.externalId,
          rating: r.rating,
          author: r.author,
          body: r.body,
          reviewedAt: r.reviewedAt,
          sensitive: isSensitive(r),
        });
        if (id) added++;
      }
    }
    return { data: { added } };
  });
  const reviewFor = async (req: FastifyRequest, min: Role = "MEMBER") => {
    const site = await siteFor(req, min);
    await requireFeature(billing, site.orgId, "reviews");
    const { rid } = z.object({ rid: uuid }).parse(req.params);
    const review = await intel.review(site.id, rid);
    if (!review) throw notFound();
    return { site, review };
  };
  /** A thank-you draft for clearly positive reviews only. Sensitive or negative reviews get nothing: the owner answers them. */
  app.post("/api/sites/:id/reviews/:rid/suggest-reply", async (req) => {
    const { site, review } = await reviewFor(req);
    const g = await gather(site);
    if (!g.inputs || !g.kit)
      throw new HttpError(
        409,
        "no_profile",
        "Add your business details and Brand Kit first.",
      );
    const text = suggestReply(
      review,
      buildPresenceGraph(g.inputs).identity.name,
      g.kit.kit.voice.tone,
    );
    if (!text)
      throw new HttpError(
        422,
        "needs_you",
        "Kora does not write replies to negative or sensitive reviews. Please answer this one yourself.",
      );
    return {
      data: {
        id: await intel.addReply({
          siteId: site.id,
          orgId: site.orgId,
          reviewId: review.id,
          body: text,
          origin: "SUGGESTED",
          userId: requireUser(req).userId,
        }),
        body: text,
      },
    };
  });
  app.post("/api/sites/:id/reviews/:rid/replies", async (req, reply) => {
    const { site, review } = await reviewFor(req);
    const b = z
      .object({ body: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(req.body);
    return reply.code(201).send({
      data: {
        id: await intel.addReply({
          siteId: site.id,
          orgId: site.orgId,
          reviewId: review.id,
          body: b.body,
          origin: "OWNER",
          userId: requireUser(req).userId,
        }),
      },
    });
  });
  /** Kora never posts a reply to a platform. The owner posts it there and records that they did. */
  app.post("/api/sites/:id/reviews/:rid/replied", async (req) => {
    const { site, review } = await reviewFor(req);
    await intel.setReviewStatus(site.id, review.id, "REPLIED");
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "review.marked_replied",
      objectType: "review",
      objectId: review.id,
      requestId: req.id,
    });
    return { data: { status: "REPLIED" } };
  });
  app.post("/api/sites/:id/reviews/:rid/dismiss", async (req) => {
    const { site, review } = await reviewFor(req);
    await intel.setReviewStatus(site.id, review.id, "DISMISSED");
    return { data: { status: "DISMISSED" } };
  });

  // ---- business memory --------------------------------------------------------------
  app.get("/api/sites/:id/memory", async (req) => ({
    data: await intel.memory((await siteFor(req)).id),
  }));
  app.post("/api/sites/:id/memory", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    const b = z
      .object({
        kind: z
          .enum(MEMORY_KINDS)
          .refine((k) => k !== "OUTCOME", "Outcomes are recorded by Kora"),
        key: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(req.body);
    const id = await intel.addMemory({
      siteId: site.id,
      orgId: site.orgId,
      kind: b.kind,
      key: b.key,
      value: b.value,
      source: "OWNER",
      userId: requireUser(req).userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "memory.added",
      objectType: "business_memory",
      objectId: id,
      requestId: req.id,
      metadata: { kind: b.kind, key: b.key },
    });
    return reply.code(201).send({ data: { id } });
  });
  app.delete("/api/sites/:id/memory/:mid", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { mid } = z.object({ mid: uuid }).parse(req.params);
    if (!(await intel.archiveMemory(site.id, mid))) throw notFound();
    return { data: { archived: true } };
  });
}

/** The LEARN step: after a campaign ends, record what its tracked links did. Counts only; never a cause. */
export async function recordCampaignOutcomes(d: {
  intel: IntelStore;
  now: Date;
  siteId: string;
  orgId: string;
}) {
  const today = d.now.toISOString().slice(0, 10);
  let n = 0;
  for (const c of await d.intel.endedCampaignsWithoutOutcome(d.siteId, today)) {
    const res = await d.intel.results(
      d.siteId,
      new Date(`${c.startsOn}T00:00:00Z`),
      new Date(Date.parse(`${c.endsOn}T00:00:00Z`) + 8 * DAY),
      c.id,
    );
    const s = summarizeAttribution(res);
    const e = outcomeEntry({
      campaignId: c.id,
      name: c.name,
      offerTitle: c.offerTitle,
      endedOn: c.endsOn,
      posts: { planned: c.planned, published: c.published },
      tracked: {
        visits: s.visits,
        whatsappTaps: s.whatsappTaps,
        callTaps: s.callTaps,
        enquiries: s.enquiries,
      },
      channels: c.channels,
    });
    if (
      await d.intel.addMemory({
        siteId: d.siteId,
        orgId: d.orgId,
        kind: e.kind,
        key: e.key,
        value: e.value,
        source: "SYSTEM",
        evidence: e.evidence,
        userId: null,
      })
    )
      n++;
  }
  return n;
}
export type { ChannelProvider };
