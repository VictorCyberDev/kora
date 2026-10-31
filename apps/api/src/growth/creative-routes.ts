import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type postgres from "postgres";
import { z } from "zod";
import {
  CampaignBriefSchema,
  GenomeSchema,
  REQUEST_STATES,
  TASTE_LABELS,
  auditHtml,
  creativeDirections,
  deriveGenome,
  directionsDiffer,
  feasibleDirections,
  gbpChecklist,
  genomeGaps,
  localBusinessJsonLd,
  nextRequestState,
  signShare,
  slaRemainingHours,
  tasteProfile,
  todayActions,
  verifyShare,
  type Genome,
  type RequestEvent,
} from "@kora/growth";
import {
  creativeFindings,
  gradeFindings,
  parseAnySiteSpec,
} from "@kora/site-schema";
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
import type { GrowthStore } from "./store.js";
import type { createGatherer } from "./gather.js";
import { recentItems } from "./calendar-store.js";
import { requireFeature } from "./entitlements.js";
import { UnsafeUrl, safeFetchHtml } from "./safe-fetch.js";

const idParam = z.object({ id: z.string().uuid() });
const uuid = z.string().uuid();

export interface CreativeDeps {
  platform: PlatformStore;
  billing: BillingService;
  growth: GrowthStore;
  gather: ReturnType<typeof createGatherer>;
  sql: postgres.Sql;
  shareSecret: string;
  allowPrivateAudit: boolean;
  now?: () => Date;
}

export function registerCreativeRoutes(app: FastifyInstance, d: CreativeDeps) {
  const { platform, billing, growth, gather, sql } = d;
  const now = d.now ?? (() => new Date());
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await platform.getSite(idParam.parse(req.params).id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const genomeFor = async (siteId: string): Promise<Genome | null> => {
    const r = (
      await sql`SELECT genome FROM brand_genomes WHERE site_id=${siteId} ORDER BY version DESC LIMIT 1`
    )[0];
    if (r) return GenomeSchema.parse(r.genome);
    const [p, k] = await Promise.all([
      growth.getProfile(siteId),
      growth.latestBrandKit(siteId),
    ]);
    return p && k ? deriveGenome(k.kit, p.facts) : null;
  };

  // ---- M13: campaign briefs, directions, choice ---------------------------
  app.post("/api/sites/:id/campaign-briefs", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "campaigns");
    const body = z
      .object({
        brief: CampaignBriefSchema,
        hasProductPhoto: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    const g = await genomeFor(site.id);
    if (!g)
      throw new HttpError(
        409,
        "needs_profile_and_brand",
        "Add your business details and brand kit first.",
      );
    const all = creativeDirections(body.brief, g);
    // No store holds verified testimonials or premises yet, so those directions are honestly blocked.
    const { feasible, blocked } = feasibleDirections(all, {
      productPhoto: body.hasProductPhoto,
      verifiedTestimonial: false,
      verifiedPremises: false,
    });
    const id = randomUUID();
    await sql`INSERT INTO campaign_briefs (id, site_id, org_id, brief, directions, blocked, created_by)
      VALUES (${id}, ${site.id}, ${site.orgId}, ${sql.json(body.brief)}, ${sql.json(JSON.parse(JSON.stringify(feasible)))},
        ${sql.json(blocked)}, ${requireUser(req).userId})`;
    return reply.code(201).send({
      data: {
        id,
        directions: feasible,
        blocked,
        different: directionsDiffer(feasible),
      },
    });
  });
  app.get("/api/sites/:id/campaign-briefs", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "campaigns");
    const rows =
      await sql`SELECT id, brief, directions, blocked, chosen_angle, created_at
      FROM campaign_briefs WHERE site_id=${site.id} ORDER BY created_at DESC LIMIT 20`;
    return { data: rows };
  });
  app.post("/api/sites/:id/campaign-briefs/:briefId/choose", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { briefId } = z.object({ briefId: uuid }).parse(req.params);
    const { angle } = z
      .object({ angle: z.enum(["product", "moment", "people", "place"]) })
      .strict()
      .parse(req.body);
    const row = (
      await sql`SELECT directions FROM campaign_briefs WHERE id=${briefId} AND site_id=${site.id}`
    )[0];
    if (!row) throw notFound();
    const ok = (row.directions as Array<{ angle: string }>).some(
      (x) => x.angle === angle,
    );
    if (!ok)
      throw new HttpError(
        422,
        "direction_blocked",
        "That direction needs facts Kora does not have yet.",
      );
    await sql`UPDATE campaign_briefs SET chosen_angle=${angle} WHERE id=${briefId} AND site_id=${site.id}`;
    return { data: { id: briefId, chosenAngle: angle } };
  });

  // ---- M17: what to do today ---------------------------------------------
  app.get("/api/sites/:id/today-actions", async (req) => {
    const site = await siteFor(req);
    const g = await gather(site);
    const t = now();
    const genome = await genomeFor(site.id);
    const items = await recentItems(
      sql,
      site.id,
      new Date(t.getTime() - 14 * 86_400_000),
    );
    let grade: "K0" | "K1" | "K2" | "K3" | "K4" | "K5" | null = null;
    const pub = await platform.getPublishedVersionRow(site.id);
    if (pub) {
      try {
        const spec = parseAnySiteSpec(pub.spec);
        if (spec.version === 2)
          grade = gradeFindings(creativeFindings(spec)).grade;
      } catch {
        grade = null;
      }
    }
    const waiting = g.inputs?.demand.waiting ?? 0;
    const oldest = g.inputs?.demand.oldestWaitingAt;
    const published = items
      .filter((i) => i.state === "PUBLISHED" && i.at)
      .map((i) => new Date(i.at!).getTime());
    const actions = todayActions({
      waitingLeads: waiting,
      oldestWaitingHours: oldest
        ? (t.getTime() - new Date(oldest).getTime()) / 3_600_000
        : 0,
      approvalsPending: items.filter((i) => i.state === "APPROVAL_NEEDED")
        .length,
      staleOffers: g.inputs?.staleness?.websiteMentions ?? [],
      truthQuestions: [],
      genomeGaps: genome ? genomeGaps(genome) : [],
      openIncidents: g.inputs?.operations.openIncidents ?? 0,
      scheduledThisWeek: items.filter(
        (i) =>
          i.state === "SCHEDULED" &&
          i.at &&
          new Date(i.at).getTime() <= t.getTime() + 7 * 86_400_000,
      ).length,
      daysSinceLastPost: published.length
        ? Math.floor((t.getTime() - Math.max(...published)) / 86_400_000)
        : null,
      qualityGrade: grade,
    });
    return { data: { actions } };
  });

  // ---- M18: discovery -----------------------------------------------------
  app.get("/api/sites/:id/discovery", async (req) => {
    const site = await siteFor(req);
    const profile = await growth.getProfile(site.id);
    if (!profile)
      throw new HttpError(
        409,
        "no_profile",
        "Tell Kora about the business first.",
      );
    return {
      data: {
        jsonld: localBusinessJsonLd(profile.facts, site.publicUrl ?? undefined),
        checklist: gbpChecklist(profile.facts),
      },
    };
  });

  // ---- M21: taste feedback ------------------------------------------------
  app.post("/api/sites/:id/feedback", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    const b = z
      .object({
        subject: z.string().trim().min(1).max(120),
        label: z.enum(TASTE_LABELS),
        note: z.string().trim().max(300).optional(),
        traits: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
      })
      .strict()
      .parse(req.body);
    await sql`INSERT INTO taste_feedback (id, site_id, org_id, subject, label, note, traits, created_by)
      VALUES (${randomUUID()}, ${site.id}, ${site.orgId}, ${b.subject}, ${b.label}, ${b.note ?? null}, ${b.traits}, ${requireUser(req).userId})`;
    return reply.code(201).send({ data: { recorded: true } });
  });
  app.get("/api/sites/:id/taste", async (req) => {
    const site = await siteFor(req);
    const rows = await sql`SELECT subject, label, traits FROM taste_feedback
      WHERE site_id=${site.id} ORDER BY created_at DESC LIMIT 200`;
    const history = rows.map((r) => ({
      subject: String(r.subject),
      label: r.label as (typeof TASTE_LABELS)[number],
      traits: r.traits as string[],
    }));
    return { data: { judgements: history.length, ...tasteProfile(history) } };
  });

  // ---- M22/M23: public audit and share links -----------------------------
  const auditLimiter = new RateLimiter(5, 3_600_000);
  const DAY = 86_400_000;
  const auditView = (id: string, r: Record<string, unknown>, url: string) => ({
    id,
    url,
    ...r,
  });
  app.post("/api/public/audit", { bodyLimit: 2048 }, async (req, reply) => {
    if (!auditLimiter.take(`audit:${req.ip}`))
      throw new HttpError(429, "rate_limited", "Try again in an hour.");
    const { url } = z
      .object({ url: z.string().trim().min(4).max(500) })
      .strict()
      .parse(req.body);
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let page;
    try {
      page = await safeFetchHtml(withScheme, {
        allowPrivate: d.allowPrivateAudit,
      });
    } catch (e) {
      if (e instanceof UnsafeUrl)
        throw new HttpError(422, "cannot_audit", e.message);
      throw new HttpError(
        422,
        "cannot_audit",
        "Kora could not open that website.",
      );
    }
    const result = auditHtml(page.html, page.finalUrl);
    const id = randomUUID();
    const stored = {
      ...result,
      truncated: page.truncated,
      note: "Checked one public page. Kora read only what the page itself says.",
    };
    await sql`INSERT INTO public_audits (id, url, final_url, result)
      VALUES (${id}, ${withScheme}, ${page.finalUrl}, ${sql.json(JSON.parse(JSON.stringify(stored)))})`;
    const token = signShare(d.shareSecret, {
      kind: "audit",
      id,
      expiresAt: now().getTime() + 30 * DAY,
    });
    return reply.code(201).send({
      data: { ...auditView(id, stored, page.finalUrl), shareToken: token },
    });
  });
  app.get("/api/public/audit/shared", async (req) => {
    const { t: token } = z
      .object({ t: z.string().min(10).max(1000) })
      .parse(req.query);
    const v = verifyShare(d.shareSecret, token, now().getTime());
    if (!v.ok || v.kind !== "audit") throw notFound();
    const r = (
      await sql`SELECT id, final_url, result FROM public_audits WHERE id=${v.id}`
    )[0];
    if (!r) throw notFound();
    return {
      data: auditView(
        String(r.id),
        r.result as Record<string, unknown>,
        String(r.final_url),
      ),
    };
  });

  // ---- M25: managed requests ---------------------------------------------
  const OWNER_EVENTS = new Set<RequestEvent>([
    "owner_replied",
    "accept",
    "reject",
    "cancel",
  ]);
  app.post("/api/sites/:id/requests", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    const b = z
      .object({
        title: z.string().trim().min(1).max(160),
        detail: z.string().trim().max(2000).default(""),
      })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    await sql`INSERT INTO managed_requests (id, site_id, org_id, title, detail, created_by)
      VALUES (${id}, ${site.id}, ${site.orgId}, ${b.title}, ${b.detail}, ${requireUser(req).userId})`;
    return reply.code(201).send({ data: { id, state: "OPEN" } });
  });
  app.get("/api/sites/:id/requests", async (req) => {
    const site = await siteFor(req);
    const rows =
      await sql`SELECT id, title, detail, state, created_at, updated_at
      FROM managed_requests WHERE site_id=${site.id} ORDER BY created_at DESC LIMIT 50`;
    return {
      data: rows.map((r) => ({
        ...r,
        slaRemainingHours: slaRemainingHours(
          new Date(r.created_at as string),
          now(),
          r.state as (typeof REQUEST_STATES)[number],
        ),
      })),
    };
  });
  app.post("/api/sites/:id/requests/:rid/events", async (req) => {
    const rid = z.object({ rid: uuid }).parse(req.params).rid;
    const b = z
      .object({
        event: z.enum([
          "start",
          "ask_owner",
          "owner_replied",
          "deliver",
          "accept",
          "reject",
          "cancel",
        ]),
      })
      .strict()
      .parse(req.body);
    // Owner-side events need a member; delivery-side events need an admin (the person doing the work).
    const site = await siteFor(
      req,
      OWNER_EVENTS.has(b.event) ? "MEMBER" : "ADMIN",
    );
    const user = requireUser(req);
    return sql.begin(async (tx) => {
      const t = tx as unknown as postgres.Sql;
      const r = (
        await t`SELECT state FROM managed_requests WHERE id=${rid} AND site_id=${site.id} FOR UPDATE`
      )[0];
      if (!r) throw notFound();
      let to;
      try {
        to = nextRequestState(
          r.state as (typeof REQUEST_STATES)[number],
          b.event,
        );
      } catch (e) {
        throw new HttpError(409, "illegal_transition", (e as Error).message);
      }
      await t`UPDATE managed_requests SET state=${to}, updated_at=now() WHERE id=${rid}`;
      await t`INSERT INTO managed_request_events (id, request_id, event, from_state, to_state, actor_user_id)
        VALUES (${randomUUID()}, ${rid}, ${b.event}, ${r.state}, ${to}, ${user.userId})`;
      return { data: { id: rid, state: to } };
    });
  });
}
