import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  artifactHash,
  hashSpec,
  lintArtifact,
  parseAnySiteSpec,
  renderAnySite,
  type AnySiteSpec,
} from "@kora/site-schema";
import {
  BrandKitSchema,
  BusinessFactsSchema,
  FEATURES,
  applyFactsToSpec,
  brandKitIssues,
  buildPresenceGraph,
  deriveBrandKit,
  evaluatePresenceHealth,
  factsFromSpec,
  summarizeHealth,
} from "@kora/growth";
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
import type { PlatformConfig } from "../platform/config.js";
import { formEndpointFor } from "../platform/routes.js";
import { RevisionConflict, type GrowthStore } from "./store.js";
import type { ChannelsStore } from "./channels-store.js";
import type { CustomersStore } from "./customers-store.js";
import { orgFeatures, requireFeature } from "./entitlements.js";
import { createGatherer } from "./gather.js";

export interface GrowthDeps {
  platform: PlatformStore;
  ops: OpsStore;
  billing: BillingService;
  growth: GrowthStore;
  channels: ChannelsStore;
  customers: CustomersStore;
  config: PlatformConfig;
  now?: () => Date;
}

const idParam = z.object({ id: z.string().uuid() });

export function registerGrowthRoutes(app: FastifyInstance, d: GrowthDeps) {
  const { platform, ops, billing, growth, channels, customers, config } = d;
  const now = d.now ?? (() => new Date());
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await platform.getSite(idParam.parse(req.params).id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };

  const gather = createGatherer({
    platform,
    ops,
    growth,
    channels,
    customers,
    now,
  });

  const importFromSite = async (site: {
    id: string;
    currentVersionId: string | null;
    publishedVersionId: string | null;
  }) => {
    const id = site.publishedVersionId ?? site.currentVersionId;
    const row = id ? await platform.getVersionRow(site.id, id) : null;
    if (!row) return null;
    return factsFromSpec(parseAnySiteSpec(row.spec));
  };

  app.get("/api/orgs/:id/features", async (req) => {
    const { id } = idParam.parse(req.params);
    requireOrgRole(req, id, "VIEWER");
    const f = await orgFeatures(billing, id);
    return {
      data: {
        tier: f.tier,
        restricted: f.restricted,
        reason: f.reason,
        features: Object.fromEntries(FEATURES.map((k) => [k, f.can(k)])),
      },
    };
  });

  app.get("/api/sites/:id/presence", async (req) => {
    const site = await siteFor(req);
    const { profile, kit, inputs } = await gather(site);
    if (!inputs || !profile)
      return {
        data: {
          profile: null,
          graph: null,
          health: null,
          brandKit: kit,
          importable: Boolean(await importFromSite(site)),
        },
      };
    const checks = evaluatePresenceHealth(inputs);
    return {
      data: {
        profile: {
          revision: profile.revision,
          facts: profile.facts,
          updatedAt: profile.updatedAt,
        },
        graph: buildPresenceGraph(inputs),
        health: { ...summarizeHealth(checks), checks },
        brandKit: kit,
        importable: true,
      },
    };
  });

  app.post("/api/sites/:id/presence/import", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "presence.graph");
    const facts = await importFromSite(site);
    if (!facts)
      throw new HttpError(
        409,
        "nothing_to_import",
        "Create a website first; Kora reads your details from it.",
      );
    const existing = await growth.getProfile(site.id);
    if (existing)
      throw new HttpError(
        409,
        "profile_exists",
        "A profile already exists. Edit it instead.",
      );
    const a = requireUser(req);
    const rec = await growth.saveProfile({
      siteId: site.id,
      orgId: site.orgId,
      facts,
      source: "SITE_IMPORT",
      userId: a.userId,
      expectedRevision: 0,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "presence.profile_imported",
      objectType: "business_profile",
      objectId: site.id,
      requestId: req.id,
    });
    return reply
      .code(201)
      .send({ data: { revision: rec.revision, facts: rec.facts } });
  });

  app.put("/api/sites/:id/presence/profile", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "presence.graph");
    const body = z
      .object({
        facts: BusinessFactsSchema,
        expectedRevision: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    const a = requireUser(req);
    try {
      const rec = await growth.saveProfile({
        siteId: site.id,
        orgId: site.orgId,
        facts: body.facts,
        source: "OWNER",
        userId: a.userId,
        expectedRevision: body.expectedRevision,
      });
      await platform.audit({
        orgId: site.orgId,
        actorUserId: a.userId,
        action: "presence.profile_updated",
        objectType: "business_profile",
        objectId: site.id,
        requestId: req.id,
        metadata: { revision: rec.revision },
      });
      return { data: { revision: rec.revision, facts: rec.facts } };
    } catch (e) {
      if (e instanceof RevisionConflict)
        throw new HttpError(
          409,
          "revision_conflict",
          `Someone changed this profile (now revision ${e.current}). Reload and try again.`,
        );
      throw e;
    }
  });

  app.post("/api/sites/:id/presence/check", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "presence.health");
    const { profile, kit, inputs } = await gather(site);
    if (!inputs || !profile)
      throw new HttpError(
        409,
        "no_profile",
        "Add your business details first.",
      );
    const checks = evaluatePresenceHealth(inputs);
    const s = summarizeHealth(checks);
    const a = requireUser(req);
    const id = await growth.recordChecks({
      siteId: site.id,
      orgId: site.orgId,
      profileRevision: profile.revision,
      brandVersion: kit?.version ?? null,
      counts: s.counts,
      headline: s.headline,
      checks,
      userId: a.userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "presence.checked",
      objectType: "presence_check",
      objectId: id,
      requestId: req.id,
      metadata: s.counts,
    });
    return { data: { id, ...s, checks } };
  });

  /** Creates a new DRAFT version carrying the profile's facts. It never publishes. */
  app.post("/api/sites/:id/presence/apply", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    const { entitlements } = await billing.entitlements(site.orgId);
    if (!entitlements.canGenerate)
      throw new HttpError(
        402,
        "plan_restriction",
        entitlements.restrictedReason ?? "Choose a plan to make changes.",
      );
    const profile = await growth.getProfile(site.id);
    if (!profile)
      throw new HttpError(
        409,
        "no_profile",
        "Add your business details first.",
      );
    const baseId = site.currentVersionId;
    const base = baseId ? await platform.getVersionRow(site.id, baseId) : null;
    if (!base)
      throw new HttpError(
        409,
        "nothing_to_edit",
        "Create a first version before applying your profile.",
      );
    const spec: AnySiteSpec = parseAnySiteSpec(
      applyFactsToSpec(parseAnySiteSpec(base.spec), profile.facts),
    );
    const endpoint = formEndpointFor(config, site.id);
    const files = renderAnySite(spec, {
      siteId: site.id,
      ...(endpoint ? { formEndpoint: endpoint } : {}),
    });
    const problems = lintArtifact(files);
    if (problems.length)
      throw new HttpError(422, "artifact_rejected", problems[0]);
    const a = requireUser(req);
    const version = await platform.createVersion({
      siteId: site.id,
      orgId: site.orgId,
      spec,
      specHash: hashSpec(spec),
      files,
      artifactHash: artifactHash(files),
      source: "EDIT_STRUCTURED",
      createdBy: a.userId,
      parentId: String(base.id),
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "presence.applied_to_site",
      objectType: "site_version",
      objectId: version.id,
      requestId: req.id,
      metadata: { profileRevision: profile.revision, parent: String(base.id) },
    });
    return reply.code(201).send({ data: { version } });
  });

  // ---- brand kit ----------------------------------------------------------
  app.get("/api/sites/:id/brand-kit", async (req) => {
    const site = await siteFor(req);
    const versions = await growth.brandKitVersions(site.id);
    let suggestion = null;
    if (!versions.length) {
      const id = site.publishedVersionId ?? site.currentVersionId;
      const row = id ? await platform.getVersionRow(site.id, id) : null;
      if (row) suggestion = deriveBrandKit(parseAnySiteSpec(row.spec));
    }
    return { data: { current: versions[0] ?? null, versions, suggestion } };
  });

  app.post("/api/sites/:id/brand-kit", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.kit");
    const body = z
      .union([
        z.object({ from: z.literal("site") }).strict(),
        z.object({ kit: BrandKitSchema }).strict(),
      ])
      .parse(req.body);
    let kit;
    let origin: "DERIVED" | "OWNER";
    if ("kit" in body) {
      kit = body.kit;
      origin = "OWNER";
      const issues = brandKitIssues(kit);
      if (issues.length)
        throw new HttpError(
          422,
          "brand_not_legible",
          issues.map((i) => i.message).join("; "),
        );
    } else {
      const id = site.publishedVersionId ?? site.currentVersionId;
      const row = id ? await platform.getVersionRow(site.id, id) : null;
      if (!row)
        throw new HttpError(
          409,
          "nothing_to_derive",
          "Create a website first.",
        );
      kit = deriveBrandKit(parseAnySiteSpec(row.spec));
      origin = "DERIVED";
    }
    const a = requireUser(req);
    const rec = await growth.saveBrandKit({
      siteId: site.id,
      orgId: site.orgId,
      kit,
      origin,
      userId: a.userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "brand_kit.saved",
      objectType: "brand_kit",
      objectId: rec.id,
      requestId: req.id,
      metadata: { version: rec.version, origin },
    });
    return reply.code(201).send({ data: rec });
  });
}
