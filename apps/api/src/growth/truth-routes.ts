import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type postgres from "postgres";
import { z } from "zod";
import {
  CLAIM_KINDS,
  GenomeSchema,
  buildLedger,
  deriveGenome,
  factsFromBusiness,
  genomeGaps,
  type Genome,
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
const claim = z
  .object({
    kind: z.enum(CLAIM_KINDS),
    key: z.string().min(1).max(80),
    text: z.string().max(200).optional(),
  })
  .strict();

export function registerTruthRoutes(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    billing: BillingService;
    growth: GrowthStore;
    sql: postgres.Sql;
    now?: () => Date;
  },
) {
  const { platform, billing, growth, sql } = d;
  const now = d.now ?? (() => new Date());
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await platform.getSite(idParam.parse(req.params).id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };

  app.get("/api/sites/:id/truth", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "presence.graph");
    const profile = await growth.getProfile(site.id);
    const facts = profile
      ? factsFromBusiness(profile.facts, now().toISOString())
      : [];
    const recent = await sql`
      SELECT id, subject, publishable, created_at FROM claim_ledgers
      WHERE site_id=${site.id} ORDER BY created_at DESC LIMIT 10`;
    return { data: { facts, ledgers: recent } };
  });

  app.post("/api/sites/:id/truth/check", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "presence.graph");
    const body = z
      .object({
        subject: z.string().trim().min(1).max(200),
        claims: z.array(claim).min(1).max(50),
      })
      .strict()
      .parse(req.body);
    const profile = await growth.getProfile(site.id);
    if (!profile)
      throw new HttpError(
        409,
        "no_profile",
        "Tell Kora about the business first.",
      );
    const facts = factsFromBusiness(profile.facts, now().toISOString());
    const ledger = buildLedger(
      body.claims.map((c) => ({
        kind: c.kind,
        key: c.key,
        ...(c.text !== undefined && { text: c.text }),
      })),
      facts,
      now(),
    );
    const id = randomUUID();
    await sql`
      INSERT INTO claim_ledgers (id, site_id, org_id, subject, claims, result, publishable, created_by)
      VALUES (${id}, ${site.id}, ${site.orgId}, ${body.subject},
        ${sql.json(body.claims)}, ${sql.json(JSON.parse(JSON.stringify(ledger)))},
        ${ledger.publishable}, ${requireUser(req).userId})`;
    return reply.code(201).send({ data: { id, ...ledger } });
  });

  const latestGenome = async (siteId: string): Promise<Genome | null> => {
    const r = (
      await sql`SELECT genome FROM brand_genomes WHERE site_id=${siteId} ORDER BY version DESC LIMIT 1`
    )[0];
    return r ? GenomeSchema.parse(r.genome) : null;
  };

  app.get("/api/sites/:id/genome", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "brand.kit");
    const current = await latestGenome(site.id);
    return {
      data: {
        current,
        gaps: current ? genomeGaps(current) : [],
      },
    };
  });

  app.post("/api/sites/:id/genome", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.kit");
    const body = z
      .object({
        positioning: z.string().trim().max(240).optional(),
        audience: z.string().trim().max(240).optional(),
        differentiators: z.array(z.string().trim().max(120)).max(5).optional(),
      })
      .strict()
      .parse(req.body ?? {});
    const [profile, kit] = await Promise.all([
      growth.getProfile(site.id),
      growth.latestBrandKit(site.id),
    ]);
    if (!profile || !kit)
      throw new HttpError(
        409,
        "needs_profile_and_brand",
        "Add your business details and brand kit first.",
      );
    const previous = await latestGenome(site.id);
    let g = deriveGenome(kit.kit, profile.facts, previous ? { previous } : {});
    g = GenomeSchema.parse({
      ...g,
      strategic: {
        ...g.strategic,
        ...(body.positioning !== undefined && {
          positioning: body.positioning,
        }),
        ...(body.audience !== undefined && { audience: body.audience }),
        ...(body.differentiators !== undefined && {
          differentiators: body.differentiators,
        }),
      },
    });
    await sql`
      INSERT INTO brand_genomes (id, site_id, org_id, version, genome, created_by)
      VALUES (${randomUUID()}, ${site.id}, ${site.orgId}, ${g.version},
        ${sql.json(JSON.parse(JSON.stringify(g)))}, ${requireUser(req).userId})`;
    return reply.code(201).send({ data: { current: g, gaps: genomeGaps(g) } });
  });
}
