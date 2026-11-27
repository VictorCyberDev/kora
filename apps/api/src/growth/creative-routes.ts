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
  storyboardFor,
  storyboardIssues,
  slaRemainingHours,
  tasteProfile,
  todayActions,
  verifyShare,
  type CreativeDirection,
  type Genome,
  type RequestEvent,
} from "@kora/growth";
import {
  creativeFindings,
  gradeFindings,
  parseAnySiteSpec,
} from "@kora/site-schema";
import { criticV3 } from "@kora/site-schema";
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

const toJson = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as postgres.JSONValue;
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
      VALUES (${id}, ${site.id}, ${site.orgId}, ${sql.json(toJson(body.brief))}, ${sql.json(toJson(feasible))},
        ${sql.json(toJson(blocked))}, ${requireUser(req).userId})`;
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
        "That direction needs facts Krevstudio does not have yet.",
      );
    await sql`UPDATE campaign_briefs SET chosen_angle=${angle} WHERE id=${briefId} AND site_id=${site.id}`;
    return { data: { id: briefId, chosenAngle: angle } };
  });

  app.post(
    "/api/sites/:id/campaign-briefs/:briefId/storyboard",
    async (req) => {
      const site = await siteFor(req, "MEMBER");
      await requireFeature(billing, site.orgId, "campaigns");
      const { briefId } = z.object({ briefId: uuid }).parse(req.params);
      const b = z
        .object({
          cta: z.string().trim().min(2).max(40),
          detail: z.string().trim().max(80).optional(),
          durationSec: z.number().min(4).max(12).optional(),
        })
        .strict()
        .parse(req.body);
      const row = (
        await sql`SELECT directions, chosen_angle FROM campaign_briefs WHERE id=${briefId} AND site_id=${site.id}`
      )[0];
      if (!row) throw notFound();
      if (!row.chosen_angle)
        throw new HttpError(409, "no_direction", "Choose a direction first.");
      const dir = (row.directions as CreativeDirection[]).find(
        (x) => x.angle === row.chosen_angle,
      )!;
      const sb = storyboardFor(dir, {
        cta: b.cta,
        ...(b.detail !== undefined && { detail: b.detail }),
        ...(b.durationSec !== undefined && { durationSec: b.durationSec }),
      });
      return { data: { storyboard: sb, issues: storyboardIssues(sb) } };
    },
  );

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
        else if (spec.version === 3) {
          const issues = criticV3(spec);
          const blocks = issues.filter((i) => i.severity === "block").length;
          const warns = issues.filter((i) => i.severity === "warn").length;
          grade = blocks ? "K1" : warns >= 4 ? "K3" : warns >= 1 ? "K4" : "K5";
        }
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
        "Tell Krevstudio about the business first.",
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
        "Krevstudio could not open that website.",
      );
    }
    const result = auditHtml(page.html, page.finalUrl);
    const id = randomUUID();
    const stored = {
      ...result,
      truncated: page.truncated,
      note: "Checked one public page. Krevstudio read only what the page itself says.",
    };
    await sql`INSERT INTO public_audits (id, url, final_url, result)
      VALUES (${id}, ${withScheme}, ${page.finalUrl}, ${sql.json(toJson(stored))})`;
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

  // ---- Original M15: consented, first-party referral attribution ----------
  app.post("/api/acquisition/claim", async (req, reply) => {
    const actor = requireUser(req);
    const b = z
      .object({
        orgId: uuid,
        token: z.string().min(10).max(1000),
        consent: z.literal(true),
      })
      .strict()
      .parse(req.body);
    requireOrgRole(req, b.orgId, "MEMBER");
    const verified = verifyShare(d.shareSecret, b.token, now().getTime());
    if (!verified.ok || verified.kind !== "audit") throw notFound();
    const audit = (
      await sql`SELECT id, created_at FROM public_audits WHERE id=${verified.id}`
    )[0];
    if (!audit) throw notFound();
    const referral = (
      await sql`INSERT INTO acquisition_referrals
      (id, source_audit_id, org_id, user_id, consent_recorded_at)
      VALUES (${randomUUID()}, ${verified.id}, ${b.orgId}, ${actor.userId}, ${now()})
      ON CONFLICT (source_audit_id, org_id, user_id)
      DO UPDATE SET revoked_at=NULL,
        consent_recorded_at=EXCLUDED.consent_recorded_at
      RETURNING id`
    )[0]!;
    const referralId = uuid.parse(referral.id);
    const claimedAt = now();
    await sql`INSERT INTO acquisition_events
      (id, referral_id, org_id, stage, source_type, source_id, occurred_at)
      VALUES
        (${randomUUID()}, ${referralId}, ${b.orgId}, 'audit_created',
          'public_audit', ${verified.id}, ${audit.created_at as Date}),
        (${randomUUID()}, ${referralId}, ${b.orgId}, 'share_created',
          'signed_audit_share', ${verified.id}, ${audit.created_at as Date}),
        (${randomUUID()}, ${referralId}, ${b.orgId}, 'referral_visit',
          'consented_referral_claim', ${verified.id}, ${claimedAt})
      ON CONFLICT (referral_id, stage) DO NOTHING`;
    // Authentication proves identity, not acquisition. Count signup only from
    // the immutable user creation row, and only when it follows this audit.
    await sql`INSERT INTO acquisition_events
      (id, referral_id, org_id, stage, source_type, source_id, occurred_at)
      SELECT ${randomUUID()}, ${referralId}, ${b.orgId}, 'signup',
        'user_creation', u.id::text, u.created_at
      FROM users u
      WHERE u.id=${actor.userId} AND u.created_at >= ${audit.created_at as Date}
      ON CONFLICT (referral_id, stage) DO NOTHING`;
    await platform.audit({
      orgId: b.orgId,
      actorUserId: actor.userId,
      action: "acquisition.referral_consented",
      objectType: "public_audit",
      objectId: verified.id,
      requestId: req.id,
    });
    return reply.code(201).send({ data: { recorded: true } });
  });

  app.post("/api/acquisition/revoke", async (req) => {
    const actor = requireUser(req);
    const b = z.object({ orgId: uuid }).strict().parse(req.body);
    requireOrgRole(req, b.orgId, "MEMBER");
    const updated = await sql`UPDATE acquisition_referrals
      SET revoked_at=${now()}
      WHERE org_id=${b.orgId} AND user_id=${actor.userId}
        AND revoked_at IS NULL RETURNING id`;
    await platform.audit({
      orgId: b.orgId,
      actorUserId: actor.userId,
      action: "acquisition.referral_consent_revoked",
      objectType: "organization",
      objectId: b.orgId,
      requestId: req.id,
      metadata: { count: updated.length },
    });
    return { data: { revoked: updated.length } };
  });

  // Observe real post-signup milestones from durable platform records.
  // The public report is intentionally null for unobserved referral visits:
  // a signed link by itself does not establish a consenting visitor.
  app.get("/api/acquisition/progress", async (req) => {
    const { orgId } = z.object({ orgId: uuid }).parse(req.query);
    requireOrgRole(req, orgId, "MEMBER");
    const [claims, projects, exports, stages] = await Promise.all([
      sql`SELECT count(*)::int AS n FROM acquisition_referrals
        WHERE org_id=${orgId} AND revoked_at IS NULL`,
      sql`SELECT (
        (SELECT count(*) FROM site_versions WHERE org_id=${orgId}) +
        (SELECT count(*) FROM creative_documents WHERE org_id=${orgId}) +
        (SELECT count(*) FROM motion_projects WHERE org_id=${orgId})
        )::int AS n`,
      sql`SELECT count(*)::int AS n FROM usage_events
        WHERE org_id=${orgId} AND dimension='EXPORT'`,
      sql`SELECT e.stage, count(*)::int AS n
        FROM acquisition_events e
        JOIN acquisition_referrals r ON r.id=e.referral_id AND r.org_id=e.org_id
        WHERE e.org_id=${orgId} AND r.revoked_at IS NULL
        GROUP BY e.stage`,
    ]);
    const consented = Number(claims[0]?.n ?? 0) > 0;
    const durableStages = Object.fromEntries(
      stages.map((row) => [String(row.stage), Number(row.n)]),
    );
    return {
      data: {
        consentedAuditReferrals: Number(claims[0]?.n ?? 0),
        referralVisits: null,
        verifiedSignup: Number(durableStages.signup ?? 0) > 0,
        observedProjectCount: consented ? Number(projects[0]?.n ?? 0) : null,
        observedExports: consented ? Number(exports[0]?.n ?? 0) : null,
        durableStages,
        note: "These are consent-scoped account events from authoritative rows; they do not establish that the shared audit caused creation, export or a sale.",
      },
    };
  });

  // ---- Original M16: opt-in commercial pilot enrollment ------------------
  app.post("/api/pilot/enroll", async (req, reply) => {
    const actor = requireUser(req);
    const body = z
      .object({
        orgId: uuid,
        segment: z.enum([
          "small_business",
          "freelancer",
          "creative_professional",
          "agency",
        ]),
        industry: z.string().trim().min(2).max(120),
        consent: z.literal(true),
      })
      .strict()
      .parse(req.body);
    requireOrgRole(req, body.orgId, "OWNER");
    const record = (
      await sql`INSERT INTO pilot_participants
        (id, org_id, enrolled_by, segment, industry, consented_at)
        VALUES (${randomUUID()}, ${body.orgId}, ${actor.userId},
          ${body.segment}, ${body.industry}, ${now()})
        ON CONFLICT (org_id) DO NOTHING RETURNING id`
    )[0];
    if (!record)
      throw new HttpError(
        409,
        "pilot_enrollment_exists",
        "Pilot enrollment already exists. Contact support to re-enroll after withdrawing.",
      );
    await platform.audit({
      orgId: body.orgId,
      actorUserId: actor.userId,
      action: "pilot.enrolled_with_consent",
      objectType: "pilot_participant",
      objectId: String(record.id),
      requestId: req.id,
    });
    return reply.code(201).send({
      data: { id: String(record.id), consented: true, pilot: "ENROLLED" },
    });
  });

  app.get("/api/pilot/status", async (req) => {
    const { orgId } = z.object({ orgId: uuid }).parse(req.query);
    requireOrgRole(req, orgId, "MEMBER");
    const participation = (
      await sql`SELECT id, segment, industry, enrolled_at, consented_at, revoked_at
        FROM pilot_participants WHERE org_id=${orgId}`
    )[0];
    if (!participation) return { data: { enrolled: false } };
    const participationId = uuid.parse(String(participation.id));
    const enrolledAt = z.coerce.date().parse(participation.enrolled_at);
    const events = await sql`SELECT kind, source_id, observed_at
      FROM pilot_observations WHERE participant_id=${participationId}
      ORDER BY observed_at DESC`;
    // Read actual production tables rather than asking owners to self-assert
    // milestones. Only post-enrollment events qualify for this pilot.
    const [evidence] = await sql`SELECT
      LEAST(
        (SELECT MIN(created_at) FROM site_versions
          WHERE org_id=${orgId} AND created_at>=${enrolledAt}),
        (SELECT MIN(created_at) FROM creative_documents
          WHERE org_id=${orgId} AND created_at>=${enrolledAt}),
        (SELECT MIN(created_at) FROM motion_projects
          WHERE org_id=${orgId} AND created_at>=${enrolledAt})
      ) AS first_project_at,
      (SELECT MIN(occurred_at) FROM usage_events
        WHERE org_id=${orgId} AND dimension='EXPORT'
          AND occurred_at>=${enrolledAt}) AS first_export_at,
      (SELECT MIN(published_at) FROM site_versions
        WHERE org_id=${orgId} AND published_at>=${enrolledAt})
        AS first_publication_at`;
    const payments = await sql`SELECT currency,
        count(*)::int AS verified_count,
        sum(amount_minor)::bigint AS verified_amount_minor,
        min(verified_at) AS first_verified_at
      FROM billing_transactions
      WHERE org_id=${orgId} AND status='VERIFIED'
        AND amount_minor>0 AND verified_at IS NOT NULL
        AND verified_at>=${enrolledAt}
      GROUP BY currency ORDER BY currency`;
    const verifiedPaymentAmountMinorByCurrency = Object.fromEntries(
      payments.map((payment) => [
        String(payment.currency),
        Number(payment.verified_amount_minor),
      ]),
    );
    const verifiedPaymentCount = payments.reduce(
      (total, payment) => total + Number(payment.verified_count),
      0,
    );
    const firstVerifiedPaymentAt = payments
      .map((payment) => z.coerce.date().parse(payment.first_verified_at))
      .sort((left, right) => left.getTime() - right.getTime())[0];
    return {
      data: {
        enrolled: participation.revoked_at === null,
        participant: participation,
        observations: events,
        observedMilestones: {
          firstProjectAt: evidence?.first_project_at
            ? z.coerce.date().parse(evidence.first_project_at).toISOString()
            : null,
          firstExportAt: evidence?.first_export_at
            ? z.coerce.date().parse(evidence.first_export_at).toISOString()
            : null,
          firstPublicationAt: evidence?.first_publication_at
            ? z.coerce.date().parse(evidence.first_publication_at).toISOString()
            : null,
        },
        paymentsVerified: verifiedPaymentCount > 0,
        verifiedPaymentCount,
        verifiedPaymentAmountMinorByCurrency,
        firstVerifiedPaymentAt: firstVerifiedPaymentAt?.toISOString() ?? null,
        note: "Milestones are read from recorded platform events after consent. Payment totals include only provider-verified billing transactions after enrollment; enrollment and owner-stated pricing are not payment evidence.",
      },
    };
  });

  app.post("/api/pilot/feedback", async (req, reply) => {
    const actor = requireUser(req);
    const body = z
      .object({
        orgId: uuid,
        rating: z.number().int().min(1).max(5),
        comments: z.string().trim().max(1000),
        pricing: z
          .object({
            statedMonthlyAmount: z
              .number()
              .nonnegative()
              .finite()
              .max(1_000_000),
            currency: z.string().length(3),
          })
          .optional(),
      })
      .strict()
      .parse(req.body);
    requireOrgRole(req, body.orgId, "OWNER");
    const participant = (
      await sql`SELECT id FROM pilot_participants
        WHERE org_id=${body.orgId} AND revoked_at IS NULL`
    )[0];
    if (!participant)
      throw new HttpError(
        409,
        "pilot_consent_required",
        "Pilot consent must be active before feedback can be recorded.",
      );
    const participantId = uuid.parse(String(participant.id));
    const count = (
      await sql`SELECT count(*)::int AS n FROM pilot_observations
        WHERE participant_id=${participantId} AND kind='feedback'`
    )[0];
    if (Number(count?.n ?? 0) >= 20)
      throw new HttpError(
        429,
        "pilot_feedback_limit",
        "Feedback limit reached for this pilot enrollment.",
      );
    const id = randomUUID();
    await sql`INSERT INTO pilot_observations
      (id, participant_id, kind, source_id, recorded_by, metadata)
      VALUES (${id}, ${participantId}, 'feedback', ${"owner-report:" + id},
        ${actor.userId},
        ${sql.json({
          rating: body.rating,
          comments: body.comments,
          pricing: body.pricing ?? null,
          provenance: "OWNER_REPORTED",
          paymentVerified: false,
        })})`;
    return reply.code(201).send({
      data: { id, recorded: true, paymentVerified: false },
    });
  });

  app.post("/api/pilot/withdraw", async (req) => {
    const actor = requireUser(req);
    const { orgId } = z.object({ orgId: uuid }).strict().parse(req.body);
    requireOrgRole(req, orgId, "OWNER");
    const changed = await sql`UPDATE pilot_participants SET revoked_at=${now()}
      WHERE org_id=${orgId} AND revoked_at IS NULL RETURNING id`;
    if (changed.length)
      await platform.audit({
        orgId,
        actorUserId: actor.userId,
        action: "pilot.consent_withdrawn",
        objectType: "pilot_participant",
        objectId: String(changed[0]!.id),
        requestId: req.id,
      });
    return { data: { withdrawn: changed.length > 0 } };
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
        VALUES (${randomUUID()}, ${rid}, ${b.event}, ${String(r.state)}, ${to}, ${user.userId})`;
      return { data: { id: rid, state: to } };
    });
  });
}
