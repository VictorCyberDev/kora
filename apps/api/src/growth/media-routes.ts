import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type postgres from "postgres";
import { z } from "zod";
import {
  MediaGenError,
  buildImagePrompt,
  costGate,
  generateWithChain,
  type MediaProvider,
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
import type { GrowthStore } from "./store.js";
import { requireFeature } from "./entitlements.js";

const idParam = z.object({ id: z.string().uuid() });
const toJson = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as postgres.JSONValue;
const DAILY_LIMIT = 20;

export function registerMediaRoutes(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    billing: BillingService;
    growth: GrowthStore;
    sql: postgres.Sql;
    media: { image: MediaProvider[]; video: MediaProvider[] };
  },
) {
  const { platform, billing, growth, sql, media } = d;
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await platform.getSite(idParam.parse(req.params).id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };

  app.get("/api/sites/:id/media/status", async (req) => {
    await siteFor(req);
    return {
      data: {
        image: {
          configured: media.image.length > 0,
          providers: media.image.map((p) => p.id),
        },
        video: {
          configured: media.video.length > 0,
          providers: media.video.map((p) => p.id),
        },
        note: "Generated media is never used until a person approves it.",
      },
    };
  });

  app.post("/api/sites/:id/media/generate", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.studio");
    const b = z
      .object({
        kind: z.enum(["image", "video"]).default("image"),
        subject: z.string().trim().min(2).max(120),
        style: z.enum(["photo", "illustration"]).default("photo"),
        width: z.number().int().min(256).max(1536).default(1024),
        height: z.number().int().min(256).max(1536).default(1024),
        seed: z.number().int().min(0).max(2_147_483_647).optional(),
      })
      .strict()
      .parse(req.body);
    const chain = b.kind === "image" ? media.image : media.video;
    if (chain.length === 0)
      throw new HttpError(
        503,
        "not_configured",
        `Generated ${b.kind} is not set up on this Kora yet.`,
      );
    // Truth first: only things the owner says they offer may be pictured.
    const profile = await growth.getProfile(site.id);
    if (!profile)
      throw new HttpError(
        409,
        "no_profile",
        "Tell Kora about the business first.",
      );
    const known = [
      ...profile.facts.offer.services,
      ...profile.facts.offer.offers.map((o) => o.title),
    ].map((x) => x.toLowerCase());
    const want = b.subject.toLowerCase();
    if (!known.some((k) => k.includes(want) || want.includes(k)))
      throw new HttpError(
        422,
        "subject_not_stated",
        `Kora only creates pictures of things you have told it you offer. Is "${b.subject}" something you sell?`,
      );
    const used = Number(
      (
        await sql`SELECT COUNT(*)::int AS n FROM generated_media WHERE site_id=${site.id} AND created_at > now() - interval '1 day'`
      )[0]!.n,
    );
    if (used >= DAILY_LIMIT)
      throw new HttpError(
        429,
        "daily_limit",
        `At most ${DAILY_LIMIT} generations a day per website.`,
      );
    const monthly = Number(
      (
        await sql`SELECT COUNT(*)::int AS n FROM generated_media WHERE site_id=${site.id} AND created_at > date_trunc('month', now())`
      )[0]!.n,
    );
    const gate = costGate({
      spentMinor: monthly,
      budgetMinor: Number(process.env.KORA_MEDIA_MONTHLY_LIMIT) || 200,
      estimateMinor: 1,
      perCallCapMinor: 1,
    });
    if (!gate.allow)
      throw new HttpError(
        429,
        "monthly_budget",
        "This website has used its generations for the month.",
      );
    const { prompt, negativePrompt } = buildImagePrompt({
      subject: b.subject,
      style: b.style,
    });
    let out;
    try {
      out = await generateWithChain(chain, {
        prompt,
        negativePrompt,
        width: b.width,
        height: b.height,
        ...(b.seed !== undefined && { seed: b.seed }),
      });
    } catch (e) {
      if (e instanceof MediaGenError)
        throw new HttpError(
          502,
          `generation_${e.code}`,
          "The image provider could not make this picture. Nothing was saved or charged.",
        );
      throw e;
    }
    const id = randomUUID();
    await sql`INSERT INTO generated_media (id, site_id, org_id, kind, subject, mime, bytes, width, height, provenance, created_by)
      VALUES (${id}, ${site.id}, ${site.orgId}, ${b.kind}, ${b.subject}, ${out.mime}, ${out.bytes}, ${b.width}, ${b.height},
        ${sql.json(toJson(out.provenance))}, ${requireUser(req).userId})`;
    await platform.recordUsage(
      site.orgId,
      site.id,
      b.kind === "image" ? "IMAGE_RENDER" : "VIDEO_RENDER",
      1,
      { provider: out.provenance.provider, generated: true },
    );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "media.generated",
      objectType: "generated_media",
      objectId: id,
      requestId: req.id,
      metadata: {
        provider: out.provenance.provider,
        model: out.provenance.model,
      },
    });
    return reply.code(201).send({
      data: {
        id,
        kind: b.kind,
        mime: out.mime,
        provenance: out.provenance,
        review: "UNREVIEWED",
      },
    });
  });

  app.get("/api/sites/:id/media", async (req) => {
    const site = await siteFor(req);
    const rows =
      await sql`SELECT id, kind, subject, mime, width, height, provenance, review, created_at
      FROM generated_media WHERE site_id=${site.id} ORDER BY created_at DESC LIMIT 50`;
    return { data: rows };
  });

  app.get("/api/sites/:id/media/:mid/file", async (req, reply) => {
    const site = await siteFor(req);
    const { mid } = z.object({ mid: z.string().uuid() }).parse(req.params);
    const r = (
      await sql`SELECT mime, bytes, review FROM generated_media WHERE id=${mid} AND site_id=${site.id}`
    )[0];
    if (!r) throw notFound();
    return reply
      .header("content-type", String(r.mime))
      .header("x-kora-generated", "true")
      .header("x-kora-review", String(r.review))
      .header("cache-control", "private, no-store")
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(r.bytes as Buffer);
  });

  app.post("/api/sites/:id/media/:mid/review", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { mid } = z.object({ mid: z.string().uuid() }).parse(req.params);
    const { decision } = z
      .object({ decision: z.enum(["APPROVED", "REJECTED"]) })
      .strict()
      .parse(req.body);
    const u = requireUser(req);
    const r =
      await sql`UPDATE generated_media SET review=${decision}, reviewed_by=${u.userId}, reviewed_at=now()
      WHERE id=${mid} AND site_id=${site.id} AND review='UNREVIEWED' RETURNING id`;
    if (r.length === 0) {
      const exists = (
        await sql`SELECT 1 FROM generated_media WHERE id=${mid} AND site_id=${site.id}`
      ).length;
      if (!exists) throw notFound();
      throw new HttpError(
        409,
        "already_reviewed",
        "This picture has already been reviewed.",
      );
    }
    await platform.audit({
      orgId: site.orgId,
      actorUserId: u.userId,
      action: `media.${decision.toLowerCase()}`,
      objectType: "generated_media",
      objectId: mid,
      requestId: req.id,
      metadata: {},
    });
    return { data: { id: mid, review: decision } };
  });
}
