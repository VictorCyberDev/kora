import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AssetSpecSchema,
  BundleError,
  CampaignInputSchema,
  NotEnoughFacts,
  buildContentContext,
  buildGrowthBrief,
  interpretIntent,
  summarizeAttribution,
  trackedUrl,
  buildPresenceGraph,
  checkPublishable,
  contentHash,
  decide,
  deriveBrandKit,
  draftContent,
  isBlocked,
  planBundle,
  recommend,
  renderAssetSvg,
  validateDraft,
  type AgentInputs,
  type ChannelProvider,
  type ContentChannel,
} from "@kora/growth";
import { parseAnySiteSpec } from "@kora/site-schema";
import {
  HttpError,
  notFound,
  requireOrgRole,
  requireUser,
  type Role,
} from "../platform/http.js";
import type { PlatformStore } from "../platform/store.js";
import type { OpsStore } from "../platform/ops-store.js";
import type { BillingService } from "../platform/billing.js";
import type { CalendarStore } from "./calendar-store.js";
import { recentItems } from "./calendar-store.js";
import type { ChannelsStore } from "./channels-store.js";
import type { CustomersStore } from "./customers-store.js";
import type { createGatherer } from "./gather.js";
import type { GrowthStore } from "./store.js";
import type { MarketingStore } from "./marketing-store.js";
import type { ProviderRegistry } from "./providers.js";
import type { Rasterizer } from "./rasterizer.js";
import type { StudioStore } from "./studio-store.js";
import { requireFeature } from "./entitlements.js";
import type { IntelStore } from "./intel-store.js";
import { recordCampaignOutcomes } from "./intel-routes.js";

export interface MarketingDeps {
  platform: PlatformStore;
  ops: OpsStore;
  billing: BillingService;
  growth: GrowthStore;
  marketing: MarketingStore;
  intel: IntelStore;
  calendar: CalendarStore;
  channels: ChannelsStore;
  customers: CustomersStore;
  studio: StudioStore;
  providers: ProviderRegistry;
  gather: ReturnType<typeof createGatherer>;
  raster: () => Promise<Rasterizer>;
  now?: () => Date;
}
const uuid = z.string().uuid();
const DAY = 86_400_000;
type Site = NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>;

export function registerMarketingRoutes(
  app: FastifyInstance,
  d: MarketingDeps,
) {
  const {
    platform,
    ops,
    billing,
    growth,
    marketing,
    calendar,
    channels,
    customers,
    studio,
    providers,
    gather,
  } = d;
  const now = d.now ?? (() => new Date());
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const need = async (site: Site) => {
    const g = await gather(site);
    if (!g.profile || !g.inputs)
      throw new HttpError(
        409,
        "no_profile",
        "Add your business details in Presence first.",
      );
    if (!g.kit)
      throw new HttpError(409, "no_brand_kit", "Create your Brand Kit first.");
    const graph = buildPresenceGraph(g.inputs);
    return { g, graph, kit: g.kit, ctx: buildContentContext(graph, g.kit.kit) };
  };

  const agentInputs = async (site: Site): Promise<AgentInputs> => {
    const g = await gather(site);
    if (!g.inputs)
      throw new HttpError(
        409,
        "no_profile",
        "Add your business details in Presence first.",
      );
    const t = now();
    const graph = buildPresenceGraph(g.inputs);
    const c = await customers.counts(site.id, t);
    const stats = await calendar.stats(
      site.id,
      new Date(t.getTime() - 14 * DAY),
    );
    const recent = await recentItems(
      platform.sql,
      site.id,
      new Date(t.getTime() - 60 * DAY),
    );
    const upcoming = recent.filter(
      (r) =>
        ["SCHEDULED", "APPROVED", "APPROVAL_NEEDED"].includes(r.state) &&
        r.at &&
        Date.parse(r.at) >= t.getTime() &&
        Date.parse(r.at) < t.getTime() + 7 * DAY,
    ).length;
    const conns = await channels.list(site.id);
    return {
      now: t,
      graph,
      customers: {
        waiting: c.waiting,
        waitingOverDay: c.waitingOverDay,
        oldestWaitingAt: c.oldestWaitingAt,
      },
      calendar: {
        publishedLast14d: stats.published,
        lastPublishedAt: stats.lastPublishedAt,
        scheduledNext7d: upcoming,
        pending: stats.pending,
      },
      offerCoverage: graph.offer.activeOffers.map((o) => {
        const mentions = recent
          .filter((r) => r.text.includes(o.title.toLowerCase()))
          .map((r) => r.at)
          .filter((x): x is string => Boolean(x))
          .sort();
        return {
          id: o.id,
          title: o.title,
          lastPostAt: mentions.at(-1) ?? null,
          endsOn: o.endsOn ?? null,
        };
      }),
      connectedPostingChannels: conns
        .filter(
          (x) =>
            x.state === "CONNECTED" &&
            ["instagram", "facebook", "google_business"].includes(x.provider),
        )
        .map((x) => x.provider as "instagram" | "facebook" | "google_business"),
      openIncidents: g.inputs.operations.openIncidents,
      hasBrandKit: g.kit !== null,
    };
  };

  // ---- voice-first foundation ------------------------------------------------
  /** Text in, structured intent out. It only routes; it never runs anything. */
  app.post("/api/sites/:id/intent", async (req) => {
    await siteFor(req);
    const b = z
      .object({ text: z.string().trim().max(300) })
      .strict()
      .parse(req.body);
    return { data: interpretIntent(b.text) };
  });

  // ---- recommendations --------------------------------------------------
  app.post("/api/sites/:id/marketing/refresh", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "marketing.agent");
    const recs = recommend(await agentInputs(site));
    await marketing.reconcile(site.id, site.orgId, recs, now());
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "agent.refreshed",
      objectType: "site",
      objectId: site.id,
      requestId: req.id,
      metadata: { count: recs.length, policy: decide("refresh_report") },
    });
    return { data: await marketing.list(site.id) };
  });
  app.get("/api/sites/:id/marketing/recommendations", async (req) => {
    const site = await siteFor(req);
    return { data: await marketing.list(site.id) };
  });

  app.post(
    "/api/sites/:id/marketing/recommendations/:rid/dismiss",
    async (req) => {
      const site = await siteFor(req, "MEMBER");
      const { rid } = z.object({ rid: uuid }).parse(req.params);
      if (
        !(await marketing.decide(
          site.id,
          rid,
          "DISMISSED",
          requireUser(req).userId,
          { dismissed: true },
        ))
      )
        throw new HttpError(
          409,
          "not_open",
          "That suggestion is no longer open.",
        );
      return { data: { dismissed: true } };
    },
  );

  /**
   * Accepting runs the action only if policy allows Kora to do it alone. Today that is: create a draft (nothing public),
   * create a Brand Kit. Everything public or sensitive stays with the owner and is only pointed at.
   */
  app.post(
    "/api/sites/:id/marketing/recommendations/:rid/accept",
    async (req) => {
      const site = await siteFor(req, "MEMBER");
      await requireFeature(billing, site.orgId, "marketing.agent");
      const { rid } = z.object({ rid: uuid }).parse(req.params);
      const r = await marketing.get(site.id, rid);
      if (!r || r.status !== "OPEN")
        throw new HttpError(
          409,
          "not_open",
          "That suggestion is no longer open.",
        );
      const a = requireUser(req);
      const act = r.rec.action;
      let result: Record<string, unknown> = {
        navigate: act.type === "open" ? act.to : null,
      };
      if (act.type === "create_draft") {
        const policy = decide("create_draft");
        if (policy.authority !== "AUTO_SAFE")
          throw new HttpError(403, "policy_denied", policy.reason);
        const { g, ctx, kit } = await need(site);
        try {
          const drafts = draftContent(ctx, {
            goal: act.goal,
            channel: act.channel,
            ...(act.offerId ? { offerId: act.offerId } : {}),
          });
          const first = drafts[0]!;
          const issues = validateDraft(first, ctx, act.channel);
          if (issues.some((i) => i.severity === "block"))
            throw new HttpError(
              422,
              "draft_rejected",
              issues.find((i) => i.severity === "block")!.message,
            );
          const saved = await studio.saveDrafts({
            siteId: site.id,
            orgId: site.orgId,
            channel: act.channel,
            goal: act.goal,
            source: "deterministic",
            profileRevision: g.profile!.revision,
            brandVersion: kit.version,
            userId: a.userId,
            drafts: drafts.map((x) => ({
              draft: x,
              issues: validateDraft(x, ctx, act.channel as ContentChannel),
            })),
          });
          const item = await calendar.create({
            siteId: site.id,
            orgId: site.orgId,
            title: `Suggested: ${first.headline}`.slice(0, 120),
            caption: { ...first, headline: first.headline },
            assetId: null,
            channels: [act.channel],
            scheduledFor: null,
            state: "DRAFT",
            userId: a.userId,
          });
          result = {
            draftIds: saved.map((s) => s.id),
            calendarItemId: item.id,
            navigate: "calendar",
          };
        } catch (e) {
          if (e instanceof NotEnoughFacts)
            throw new HttpError(422, "not_enough_facts", e.message);
          throw e;
        }
      } else if (act.type === "create_brand_kit") {
        const id = site.publishedVersionId ?? site.currentVersionId;
        const row = id ? await platform.getVersionRow(site.id, id) : null;
        if (!row)
          throw new HttpError(
            409,
            "nothing_to_derive",
            "Create a website first.",
          );
        const rec = await growth.saveBrandKit({
          siteId: site.id,
          orgId: site.orgId,
          kit: deriveBrandKit(parseAnySiteSpec(row.spec)),
          origin: "DERIVED",
          userId: a.userId,
        });
        result = { brandKitVersion: rec.version, navigate: "presence" };
      }
      await marketing.decide(site.id, rid, "ACCEPTED", a.userId, result);
      await platform.audit({
        orgId: site.orgId,
        actorUserId: a.userId,
        action: "agent.action_executed",
        objectType: "marketing_recommendation",
        objectId: rid,
        requestId: req.id,
        metadata: {
          rule: r.rec.rule,
          action: act.type,
          policy: r.rec.policy,
          evidence: r.evidence.length,
        },
      });
      return { data: { status: "ACCEPTED", result } };
    },
  );

  // ---- growth brief ---------------------------------------------------------
  const weekNumbers = async (site: Site) => {
    const end = now();
    const start = new Date(end.getTime() - 7 * DAY);
    const prev = new Date(start.getTime() - 7 * DAY);
    const m = await marketing.numbers(site.id, start, end, prev);
    const c = await customers.counts(site.id, end);
    const svc = await ops.serviceForSite(site.id);
    const up = svc
      ? await ops.uptime(svc, 168)
      : { checks: 0, healthy: 0, percent: null };
    const inc = svc
      ? (await ops.incidentsForService(svc, 50)).filter(
          (i) => Date.parse(i.startedAt) >= start.getTime(),
        )
      : [];
    const open = svc
      ? (await ops.incidentsForService(svc, 20)).filter(
          (i) => i.resolvedAt === null,
        ).length
      : 0;
    return {
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      enquiries: m.enquiries,
      waiting: c.waiting,
      followUpsDue: c.followUpsDue,
      posts: m.posts,
      website: {
        uptimePercent: up.checks >= 20 ? up.percent : null,
        checks: up.checks,
        incidents: inc.length,
        recovered: inc.filter((i) => i.resolvedAt).length,
        openIncidents: open,
      },
      presence: m.presence,
      tracked: await (async () => {
        const res = await d.intel.results(site.id, start, end);
        if (!res.length) return null;
        const a = summarizeAttribution(res);
        return {
          links: a.links,
          visits: a.visits,
          whatsapp: a.whatsappTaps,
          calls: a.callTaps,
          enquiries: a.enquiries,
        };
      })(),
    };
  };
  app.get("/api/sites/:id/marketing/brief", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "growth.brief");
    const n = await weekNumbers(site);
    return {
      data: {
        brief: buildGrowthBrief(n),
        numbers: n,
        history: await marketing.briefs(site.id),
      },
    };
  });
  app.post("/api/sites/:id/marketing/brief", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "growth.brief");
    // LEARN: finished campaigns are written to Business Memory before the brief is frozen.
    await recordCampaignOutcomes({
      intel: d.intel,
      now: now(),
      siteId: site.id,
      orgId: site.orgId,
    });
    const n = await weekNumbers(site);
    const brief = buildGrowthBrief(n);
    const saved = await marketing.saveBrief({
      siteId: site.id,
      orgId: site.orgId,
      numbers: n,
      brief,
      userId: requireUser(req).userId,
    });
    return reply.code(saved ? 201 : 200).send({ data: { brief, saved } });
  });

  // ---- campaigns --------------------------------------------------------------
  app.get("/api/sites/:id/campaigns", async (req) => ({
    data: await marketing.campaigns((await siteFor(req)).id),
  }));

  app.post("/api/sites/:id/campaigns", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "campaigns");
    const input = CampaignInputSchema.parse(req.body);
    const { graph, kit, ctx } = await need(site);
    const offer = graph.offer.activeOffers.find((o) => o.id === input.offerId);
    if (!offer)
      throw new HttpError(
        422,
        "offer_not_active",
        "Choose a current offer from your profile. Ended offers cannot be promoted.",
      );
    let slots;
    try {
      slots = planBundle(input, now());
    } catch (e) {
      if (e instanceof BundleError)
        throw new HttpError(422, "bad_dates", e.message);
      throw e;
    }
    const raster = await d.raster();
    const contact = graph.contact.whatsapp ?? graph.contact.phone ?? "";
    const a = requireUser(req);
    // Build and validate everything first so a bad campaign creates nothing.
    const drafts = new Map<string, ReturnType<typeof draftContent>>();
    for (const ch of input.channels) {
      try {
        const ds = draftContent(ctx, {
          goal: "announce_offer",
          channel: ch,
          offerId: offer.id,
        });
        for (const x of ds) {
          const block = validateDraft(x, ctx, ch).find(
            (i) => i.severity === "block",
          );
          if (block) throw new HttpError(422, "draft_rejected", block.message);
        }
        drafts.set(ch, ds);
      } catch (e) {
        if (e instanceof NotEnoughFacts)
          throw new HttpError(422, "not_enough_facts", e.message);
        throw e;
      }
    }
    const assetFor: Record<string, string> = {};
    for (const slot of slots) {
      if (assetFor[slot.channel]) continue;
      const spec = AssetSpecSchema.parse({
        format: slot.format,
        category: "offer",
        layout: "bold",
        colorway: "primary",
        headline: offer.title.slice(0, 60),
        subline: (offer.detail || "").slice(0, 140),
        detail: (offer.price ?? "").slice(0, 80),
        cta: graph.contact.whatsapp ? "Order on WhatsApp" : "Contact us",
        showContact: Boolean(contact),
        contact: contact.slice(0, 60),
      });
      const r = renderAssetSvg(spec, kit.kit, graph.identity.name, kit.version);
      const asset = await studio.saveAsset({
        siteId: site.id,
        orgId: site.orgId,
        kind: "IMAGE",
        format: spec.format,
        category: "offer",
        spec,
        brandVersion: kit.version,
        mime: "image/png",
        bytes: raster.png(r.svg, r.width),
        svg: r.svg,
        width: r.width,
        height: r.height,
        userId: a.userId,
      });
      assetFor[slot.channel] = asset.id;
    }
    const campaignId = await marketing.createCampaign({
      siteId: site.id,
      orgId: site.orgId,
      name: input.name,
      objective: input.objective,
      offerId: offer.id,
      offerTitle: offer.title,
      startsOn: input.startOn,
      endsOn: input.endOn ?? input.startOn,
      brandVersion: kit.version,
      userId: a.userId,
      channels: input.channels.map((c) => ({
        provider: c,
        assetId: assetFor[c]!,
      })),
    });
    // Each channel gets its own tracked link so results can be told apart; the link is part of the approved post.
    const linkFor: Record<string, string> = {};
    if (site.publicUrl)
      for (const ch of input.channels) {
        const code = await d.intel.linkFor({
          siteId: site.id,
          orgId: site.orgId,
          provider: ch,
          campaignId,
          label: input.name,
        });
        linkFor[ch] = trackedUrl(site.publicUrl, {
          code,
          provider: ch,
          campaign: input.name,
        });
      }
    const beatLabel = {
      launch: "Launch",
      reminder: "Reminder",
      last_chance: "Last chance",
    } as const;
    for (const slot of slots) {
      const ds = drafts.get(slot.channel)!;
      const draft = ds[slot.variant % ds.length]!;
      await calendar.create({
        siteId: site.id,
        orgId: site.orgId,
        campaignId,
        title:
          `${input.name} · ${beatLabel[slot.beat]} · ${slot.channel}`.slice(
            0,
            120,
          ),
        caption: linkFor[slot.channel]
          ? {
              ...draft,
              body: `${draft.body}\n\n${linkFor[slot.channel]}`.slice(0, 2200),
            }
          : draft,
        assetId: assetFor[slot.channel]!,
        channels: [slot.channel],
        scheduledFor: slot.at,
        state: "APPROVAL_NEEDED",
        userId: a.userId,
      });
    }
    await platform.recordUsage(
      site.orgId,
      site.id,
      "CAMPAIGN_BUNDLE",
      slots.length,
    );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "campaign.created",
      objectType: "campaign",
      objectId: campaignId,
      requestId: req.id,
      metadata: {
        posts: slots.length,
        channels: input.channels,
        policy: decide("create_draft"),
      },
    });
    return reply
      .code(201)
      .send({ data: { id: campaignId, posts: slots.length } });
  });

  app.get("/api/sites/:id/campaigns/:cid", async (req) => {
    const site = await siteFor(req);
    const { cid } = z.object({ cid: uuid }).parse(req.params);
    const c = (await marketing.campaigns(site.id)).find((x) => x.id === cid);
    if (!c) throw notFound();
    const items = await Promise.all(
      (await marketing.campaignItems(site.id, cid)).map((id) =>
        calendar.get(site.id, id),
      ),
    );
    return { data: { campaign: c, items: items.filter(Boolean) } };
  });

  /** One explicit owner decision approves every post in the bundle; each approval is still recorded per post, bound to its content. */
  app.post("/api/sites/:id/campaigns/:cid/approve-all", async (req) => {
    const site = await siteFor(req, "ADMIN");
    await requireFeature(billing, site.orgId, "publishing");
    const { cid } = z.object({ cid: uuid }).parse(req.params);
    if (!(await marketing.campaigns(site.id)).some((x) => x.id === cid))
      throw notFound();
    const a = requireUser(req);
    const g = await gather(site);
    if (!g.inputs || !g.kit)
      throw new HttpError(
        409,
        "no_profile",
        "Add your business details and Brand Kit first.",
      );
    const ctx = buildContentContext(buildPresenceGraph(g.inputs), g.kit.kit);
    const out = {
      approved: 0,
      scheduled: 0,
      needsYou: [] as Array<{ itemId: string; reason: string }>,
    };
    for (const id of await marketing.campaignItems(site.id, cid)) {
      const item = await calendar.get(site.id, id);
      if (!item || item.state !== "APPROVAL_NEEDED") continue;
      const hash = contentHash({
        caption: item.caption,
        assetId: item.assetId,
        channels: item.channels,
        scheduledFor: item.scheduledFor,
      });
      await calendar.transition(
        site.id,
        id,
        { type: "approve", hashMatches: true },
        undefined,
        { approved: { hash, by: a.userId } },
      );
      await calendar.recordApproval({
        siteId: site.id,
        orgId: site.orgId,
        itemId: id,
        hash,
        decision: "APPROVED",
        userId: a.userId,
        policy: decide("publish_post"),
      });
      out.approved++;
      const ch = item.channels[0] as ChannelProvider;
      const conn = await channels.get(site.id, ch);
      const adapter = providers.adapter(ch);
      const issues = checkPublishable({
        now: now(),
        channel: ch,
        connection: conn ? { state: conn.state, mode: conn.mode } : null,
        adapterCanPublish: typeof adapter?.publish === "function",
        caption: item.caption,
        asset: item.assetId ? { kind: "IMAGE", exists: true } : null,
        ctx,
        approval: { approved: true, hashMatches: true },
        siteHasOpenIncident: g.inputs.operations.openIncidents > 0,
      });
      const due = item.scheduledFor
        ? Date.parse(item.scheduledFor)
        : now().getTime();
      if (isBlocked(issues) || due < now().getTime() - 60_000) {
        out.needsYou.push({
          itemId: id,
          reason:
            issues.find((x) => x.severity === "block")?.message ??
            "The planned time has passed.",
        });
        continue;
      }
      await calendar.transition(
        site.id,
        id,
        { type: "schedule", hashMatches: true },
        async (it, _t, sql) => {
          await calendar.enqueue(sql, {
            itemId: it.id,
            siteId: site.id,
            orgId: site.orgId,
            providers: it.channels,
            hash,
            dueAt: item.scheduledFor ?? now().toISOString(),
          });
        },
      );
      out.scheduled++;
    }
    await marketing.setCampaignStatus(site.id, cid, "ACTIVE");
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "campaign.approved",
      objectType: "campaign",
      objectId: cid,
      requestId: req.id,
      metadata: { ...out, policy: decide("publish_post") },
    });
    return { data: out };
  });

  app.post("/api/sites/:id/campaigns/:cid/cancel", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { cid } = z.object({ cid: uuid }).parse(req.params);
    if (!(await marketing.campaigns(site.id)).some((x) => x.id === cid))
      throw notFound();
    let cancelled = 0;
    for (const id of await marketing.campaignItems(site.id, cid)) {
      const item = await calendar.get(site.id, id);
      if (
        item &&
        ![
          "PUBLISHING",
          "PUBLISHED",
          "PARTIALLY_PUBLISHED",
          "CANCELLED",
        ].includes(item.state)
      ) {
        await calendar.transition(site.id, id, { type: "cancel" });
        cancelled++;
      }
    }
    await marketing.setCampaignStatus(site.id, cid, "CANCELLED");
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "campaign.cancelled",
      objectType: "campaign",
      objectId: cid,
      requestId: req.id,
      metadata: { cancelled },
    });
    return { data: { cancelled } };
  });
}
