import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CaptionSchema,
  CHANNEL_MATRIX,
  IllegalTransition,
  PUBLISH_CHANNELS,
  buildContentContext,
  buildPresenceGraph,
  checkPublishable,
  contentHash,
  decide,
  isBlocked,
  type ChannelProvider,
  type PublishIssue,
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
import type { CalendarStore, ItemRecord } from "./calendar-store.js";
import type { ChannelsStore } from "./channels-store.js";
import type { createGatherer } from "./gather.js";
import type { ProviderRegistry } from "./providers.js";
import type { StudioStore } from "./studio-store.js";
import { requireFeature } from "./entitlements.js";

export interface CalendarDeps {
  platform: PlatformStore;
  billing: BillingService;
  calendar: CalendarStore;
  channels: ChannelsStore;
  studio: StudioStore;
  providers: ProviderRegistry;
  gather: ReturnType<typeof createGatherer>;
  now?: () => Date;
}
const uuid = z.string().uuid();
const channelEnum = z.enum(PUBLISH_CHANNELS);
const Create = z
  .object({
    title: z.string().trim().min(1).max(120),
    caption: CaptionSchema.optional(),
    assetId: uuid.nullable().optional(),
    channels: z.array(channelEnum).max(5).default([]),
    scheduledFor: z.string().datetime().nullable().optional(),
  })
  .strict();
// Not Create.partial(): that would keep Create's defaults and silently wipe fields the caller did not send.
const Patch = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    caption: CaptionSchema.optional(),
    assetId: uuid.nullable().optional(),
    channels: z.array(channelEnum).max(5).optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  })
  .strict();

export function registerCalendarRoutes(app: FastifyInstance, d: CalendarDeps) {
  const { platform, billing, calendar, channels, studio, providers, gather } =
    d;
  const now = d.now ?? (() => new Date());
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const itemFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await siteFor(req, min);
    const { itemId } = z.object({ itemId: uuid }).parse(req.params);
    const item = await calendar.get(site.id, itemId);
    if (!item) throw notFound();
    return { site, item };
  };
  const hashOf = (i: ItemRecord) =>
    contentHash({
      caption: i.caption,
      assetId: i.assetId,
      channels: i.channels,
      scheduledFor: i.scheduledFor,
    });
  const guard = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof IllegalTransition)
        throw new HttpError(409, "illegal_transition", e.message);
      throw e;
    }
  };
  const ownAsset = async (
    siteId: string,
    assetId: string | null | undefined,
  ) => {
    if (!assetId) return;
    if (!(await studio.listAssets(siteId)).some((a) => a.id === assetId))
      throw new HttpError(
        422,
        "bad_asset",
        "That image does not belong to this business.",
      );
  };
  /** Everything the checks need, evaluated against the business as it is right now. */
  const issuesFor = async (
    site: NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>,
    item: ItemRecord,
  ) => {
    const g = await gather(site);
    if (!g.inputs || !g.kit)
      throw new HttpError(
        409,
        "no_profile",
        "Add your business details and Brand Kit first.",
      );
    const ctx = buildContentContext(buildPresenceGraph(g.inputs), g.kit.kit);
    const assetMeta = item.assetId
      ? (await studio.listAssets(site.id)).find((a) => a.id === item.assetId)
      : null;
    const hash = hashOf(item);
    const out: Record<string, PublishIssue[]> = {};
    for (const ch of item.channels as ChannelProvider[]) {
      const conn = await channels.get(site.id, ch);
      const a = providers.adapter(ch);
      out[ch] = checkPublishable({
        now: now(),
        channel: ch,
        connection: conn ? { state: conn.state, mode: conn.mode } : null,
        adapterCanPublish: typeof a?.publish === "function",
        caption: item.caption,
        asset: assetMeta ? { kind: assetMeta.kind, exists: true } : null,
        ctx,
        approval: {
          approved: item.approvedHash !== null,
          hashMatches: item.approvedHash === hash,
        },
        siteHasOpenIncident: g.inputs.operations.openIncidents > 0,
      });
    }
    return out;
  };

  app.get("/api/sites/:id/calendar", async (req) => {
    const site = await siteFor(req);
    const q = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(req.query);
    const from = q.from
      ? new Date(q.from)
      : new Date(now().getTime() - 7 * 86_400_000);
    const to = q.to
      ? new Date(q.to)
      : new Date(now().getTime() + 60 * 86_400_000);
    if (to.getTime() - from.getTime() > 400 * 86_400_000)
      throw new HttpError(422, "range_too_large", "Pick a shorter range.");
    return {
      data: {
        items: await calendar.list(site.id, from, to),
        stats: await calendar.stats(
          site.id,
          new Date(now().getTime() - 30 * 86_400_000),
        ),
        channels: PUBLISH_CHANNELS.map((c) => ({
          provider: c,
          label: CHANNEL_MATRIX[c].label,
          canPost: CHANNEL_MATRIX[c].capabilities.publish !== "unsupported",
        })),
      },
    };
  });

  app.post("/api/sites/:id/calendar/items", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "calendar");
    const b = Create.parse(req.body);
    await ownAsset(site.id, b.assetId);
    const hasText = Boolean(b.caption?.body);
    const item = await calendar.create({
      siteId: site.id,
      orgId: site.orgId,
      title: b.title,
      caption: b.caption ?? { headline: "", body: "", cta: "", hashtags: [] },
      assetId: b.assetId ?? null,
      channels: b.channels,
      scheduledFor: b.scheduledFor ?? null,
      state: hasText ? "DRAFT" : "IDEA",
      userId: requireUser(req).userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "calendar.item_created",
      objectType: "calendar_item",
      objectId: item.id,
      requestId: req.id,
      metadata: { policy: decide("create_draft") },
    });
    return reply.code(201).send({ data: item });
  });

  app.get("/api/sites/:id/calendar/items/:itemId", async (req) => {
    const { site, item } = await itemFor(req);
    const jobs = await calendar.jobs(site.id, item.id);
    return {
      data: {
        item,
        jobs: await Promise.all(
          jobs.map(async (j) => ({
            ...j,
            attempts: await calendar.attempts(j.id),
            attemptCount: j.attempts,
          })),
        ),
        approvals: await calendar.approvals(site.id, item.id),
        issues: await issuesFor(site, item),
        handoff: item.channels.map((c) => ({
          provider: c,
          label: CHANNEL_MATRIX[c as ChannelProvider]?.label ?? c,
        })),
      },
    };
  });

  app.patch("/api/sites/:id/calendar/items/:itemId", async (req) => {
    const { site, item } = await itemFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "calendar");
    const b = Patch.parse(req.body);
    await ownAsset(site.id, b.assetId);
    const r = await guard(() =>
      calendar.transition(
        site.id,
        item.id,
        {
          type:
            item.state === "IDEA" && b.caption?.body ? "write_content" : "edit",
        },
        undefined,
        {
          ...(b.caption ? { caption: b.caption } : {}),
          ...(b.assetId !== undefined ? { assetId: b.assetId } : {}),
          ...(b.channels ? { channels: b.channels } : {}),
          ...(b.scheduledFor !== undefined
            ? { scheduledFor: b.scheduledFor }
            : {}),
          ...(b.title ? { title: b.title } : {}),
        },
      ),
    );
    if (!r) throw notFound();
    if (item.approvedHash)
      await calendar.recordApproval({
        siteId: site.id,
        orgId: site.orgId,
        itemId: item.id,
        hash: item.approvedHash,
        decision: "REVOKED",
        userId: requireUser(req).userId,
        reason: "The post was edited after approval.",
        policy: decide("publish_post"),
      });
    return { data: r.item };
  });

  app.post("/api/sites/:id/calendar/items/:itemId/submit", async (req) => {
    const { site, item } = await itemFor(req, "MEMBER");
    if (!item.caption.body)
      throw new HttpError(422, "empty_post", "Write the post first.");
    if (!item.channels.length)
      throw new HttpError(
        422,
        "no_channels",
        "Choose where this post should go.",
      );
    const r = await guard(() =>
      calendar.transition(site.id, item.id, { type: "submit" }),
    );
    return { data: r!.item };
  });

  /** Approval is bound to the exact content hash. Only ADMIN or OWNER can approve something that goes public. */
  app.post("/api/sites/:id/calendar/items/:itemId/approve", async (req) => {
    const { site, item } = await itemFor(req, "ADMIN");
    await requireFeature(billing, site.orgId, "publishing");
    const hash = hashOf(item);
    const a = requireUser(req);
    const r = await guard(() =>
      calendar.transition(
        site.id,
        item.id,
        { type: "approve", hashMatches: true },
        undefined,
        { approved: { hash, by: a.userId } },
      ),
    );
    await calendar.recordApproval({
      siteId: site.id,
      orgId: site.orgId,
      itemId: item.id,
      hash,
      decision: "APPROVED",
      userId: a.userId,
      policy: decide("publish_post"),
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "post.approved",
      objectType: "calendar_item",
      objectId: item.id,
      requestId: req.id,
      metadata: { hash, policy: decide("publish_post") },
    });
    return { data: r!.item };
  });

  app.post("/api/sites/:id/calendar/items/:itemId/reject", async (req) => {
    const { site, item } = await itemFor(req, "ADMIN");
    const b = z
      .object({ reason: z.string().trim().max(300).default("") })
      .strict()
      .parse(req.body ?? {});
    if (item.state !== "APPROVAL_NEEDED")
      throw new HttpError(
        409,
        "illegal_transition",
        "Only a post waiting for approval can be rejected.",
      );
    const r = await guard(() =>
      calendar.transition(site.id, item.id, { type: "edit" }),
    );
    await calendar.recordApproval({
      siteId: site.id,
      orgId: site.orgId,
      itemId: item.id,
      hash: hashOf(item),
      decision: "REJECTED",
      userId: requireUser(req).userId,
      reason: b.reason,
      policy: decide("publish_post"),
    });
    return { data: r!.item };
  });

  /** Validates every channel against today's facts and connection health, then queues one job per channel. */
  app.post("/api/sites/:id/calendar/items/:itemId/schedule", async (req) => {
    const { site, item } = await itemFor(req, "ADMIN");
    await requireFeature(billing, site.orgId, "publishing");
    const b = z
      .object({ scheduledFor: z.string().datetime().optional() })
      .strict()
      .parse(req.body ?? {});
    const when = b.scheduledFor ?? item.scheduledFor ?? now().toISOString();
    if (new Date(when).getTime() < now().getTime() - 60_000)
      throw new HttpError(422, "date_in_past", "Pick a time in the future.");
    if (new Date(when).getTime() > now().getTime() + 366 * 86_400_000)
      throw new HttpError(
        422,
        "date_too_far",
        "Pick a date within the next year.",
      );
    if (item.state !== "APPROVED")
      throw new HttpError(
        409,
        "illegal_transition",
        "Approve the post before scheduling it.",
      );
    const candidate = { ...item, scheduledFor: when };
    const issues = await issuesFor(site, candidate);
    const blocked = Object.entries(issues).filter(([, v]) => isBlocked(v));
    if (blocked.length)
      throw new HttpError(
        422,
        "not_publishable",
        blocked
          .map(
            ([c, v]) =>
              `${CHANNEL_MATRIX[c as ChannelProvider].label}: ${v.find((x) => x.severity === "block")!.message}`,
          )
          .join(" "),
      );
    const res = await guard(() =>
      calendar.transition(
        site.id,
        item.id,
        {
          type: "schedule",
          hashMatches: item.approvedHash === hashOf(item),
        },
        async (it, _to, sql) => {
          await calendar.enqueue(sql, {
            itemId: it.id,
            siteId: site.id,
            orgId: site.orgId,
            providers: it.channels,
            hash: it.approvedHash!,
            dueAt: when,
          });
        },
        { scheduledFor: when },
      ),
    );
    return { data: res!.item };
  });

  app.post("/api/sites/:id/calendar/items/:itemId/cancel", async (req) => {
    const { site, item } = await itemFor(req, "MEMBER");
    const r = await guard(() =>
      calendar.transition(site.id, item.id, { type: "cancel" }),
    );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "post.cancelled",
      objectType: "calendar_item",
      objectId: item.id,
      requestId: req.id,
    });
    return { data: r!.item };
  });

  app.post("/api/sites/:id/calendar/items/:itemId/retry", async (req) => {
    const { site, item } = await itemFor(req, "ADMIN");
    const b = z
      .object({ confirmNotPosted: z.boolean().default(false) })
      .strict()
      .parse(req.body ?? {});
    if (item.state !== "FAILED" && item.state !== "PARTIALLY_PUBLISHED")
      throw new HttpError(
        409,
        "illegal_transition",
        "Only a failed post can be retried.",
      );
    const hash = hashOf(item);
    if (item.approvedHash !== hash)
      throw new HttpError(
        409,
        "not_approved",
        "The post changed. Approve it again first.",
      );
    const issues = await issuesFor(site, item);
    if (Object.values(issues).some(isBlocked))
      throw new HttpError(
        422,
        "not_publishable",
        "Fix the problems shown on the post first.",
      );
    const r = await calendar.retry(site.id, item.id, b.confirmNotPosted);
    if (!r.ok)
      throw new HttpError(
        409,
        "uncertain",
        `Kora cannot tell whether ${r.uncertain.join(", ")} was posted. Check the channel; if it is not there, retry with confirmation.`,
      );
    const res = await guard(() =>
      calendar.transition(site.id, item.id, { type: "retry" }),
    );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "post.retried",
      objectType: "calendar_item",
      objectId: item.id,
      requestId: req.id,
      metadata: { confirmNotPosted: b.confirmNotPosted },
    });
    return { data: res!.item };
  });

  /** For channels Kora cannot post to: the owner posts it themselves and tells Kora. */
  app.post("/api/sites/:id/calendar/items/:itemId/mark-posted", async (req) => {
    const { site, item } = await itemFor(req, "ADMIN");
    const b = z
      .object({
        provider: channelEnum,
        url: z.string().url().max(500).optional(),
      })
      .strict()
      .parse(req.body);
    if (!item.channels.includes(b.provider))
      throw new HttpError(
        422,
        "bad_channel",
        "This post is not for that channel.",
      );
    const hash = hashOf(item);
    if (
      item.approvedHash !== hash ||
      ![
        "APPROVED",
        "SCHEDULED",
        "PUBLISHING",
        "PARTIALLY_PUBLISHED",
        "FAILED",
      ].includes(item.state)
    )
      throw new HttpError(409, "not_approved", "Approve the post first.");
    await calendar.recordManual({
      siteId: site.id,
      orgId: site.orgId,
      itemId: item.id,
      provider: b.provider,
      hash,
      url: b.url ?? null,
    });
    let cur = item.state;
    if (cur === "APPROVED")
      cur = (await guard(() =>
        calendar.transition(site.id, item.id, {
          type: "schedule",
          hashMatches: true,
        }),
      ))!.to;
    if (cur === "SCHEDULED")
      cur = (await guard(() =>
        calendar.transition(site.id, item.id, { type: "start_publish" }),
      ))!.to;
    const jobs = await calendar.jobs(site.id, item.id);
    const covered = new Set(jobs.map((j) => j.provider));
    const s = await calendar.settled(item.id);
    if (
      cur === "PUBLISHING" &&
      s.open === 0 &&
      item.channels.every((c) => covered.has(c))
    )
      await guard(() =>
        calendar.transition(site.id, item.id, {
          type: "jobs_settled",
          published: s.published,
          failed: s.failed,
        }),
      );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "post.marked_posted",
      objectType: "calendar_item",
      objectId: item.id,
      requestId: req.id,
      metadata: { provider: b.provider },
    });
    return { data: (await calendar.get(site.id, item.id))! };
  });

  /** Copy-ready package for manual posting. */
  app.get("/api/sites/:id/calendar/items/:itemId/package", async (req) => {
    const { site, item } = await itemFor(req);
    return {
      data: {
        text: [
          item.caption.headline,
          item.caption.body,
          item.caption.hashtags.join(" "),
        ]
          .filter(Boolean)
          .join("\n\n"),
        assetUrl: item.assetId
          ? `/api/sites/${site.id}/assets/${item.assetId}/file?as=download`
          : null,
        channels: item.channels,
      },
    };
  });
}
