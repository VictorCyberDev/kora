import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ASSET_CATEGORIES,
  ASSET_FORMATS,
  ASSET_LAYOUTS,
  AssetSpecSchema,
  COLORWAYS,
  ContentDraftSchema,
  ContentRequestSchema,
  CHANNEL_LIMITS,
  CONTENT_CHANNELS,
  CONTENT_GOALS,
  MOTION_FORMATS,
  MOTION_TEMPLATES,
  MotionSpecSchema,
  NotEnoughFacts,
  buildContentContext,
  buildPresenceGraph,
  generateContent,
  motionFrameSvg,
  previewTimes,
  renderAssetSvg,
  validateAssetSpec,
  validateDraft,
  type ContentModel,
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
import type { StudioStore } from "./studio-store.js";
import type { Rasterizer } from "./rasterizer.js";
import { requireFeature } from "./entitlements.js";
import type { createGatherer } from "./gather.js";

export interface StudioDeps {
  platform: PlatformStore;
  billing: BillingService;
  growth: GrowthStore;
  studio: StudioStore;
  gather: ReturnType<typeof createGatherer>;
  raster: () => Promise<Rasterizer>;
  ffmpeg: () => Promise<boolean>;
  contentModel: ContentModel | null;
}
const uuid = z.string().uuid();

export function registerStudioRoutes(app: FastifyInstance, d: StudioDeps) {
  const { platform, billing, growth, studio, gather } = d;
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  /** The studios work from the business profile and a saved Brand Kit; without them there is nothing true to write or draw. */
  const base = async (
    site: NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>,
  ) => {
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
    return {
      profile: g.profile,
      kit: g.kit,
      graph,
      ctx: buildContentContext(graph, g.kit.kit),
    };
  };
  const contacts = (c: {
    phone?: string | undefined;
    whatsapp?: string | undefined;
  }) => [c.phone, c.whatsapp].filter((x): x is string => Boolean(x));

  app.get("/api/sites/:id/studio/options", async (req) => {
    await siteFor(req);
    return {
      data: {
        content: {
          goals: CONTENT_GOALS,
          channels: CONTENT_CHANNELS,
          limits: CHANNEL_LIMITS,
          model: d.contentModel !== null,
        },
        assets: {
          formats: Object.entries(ASSET_FORMATS).map(([id, f]) => ({
            id,
            ...f,
          })),
          categories: ASSET_CATEGORIES,
          layouts: ASSET_LAYOUTS,
          colorways: COLORWAYS,
        },
        motion: {
          formats: Object.entries(MOTION_FORMATS).map(([id, f]) => ({
            id,
            ...f,
          })),
          templates: MOTION_TEMPLATES,
          // Video export needs an encoder on this server; previews work regardless.
          exportAvailable: await d.ffmpeg(),
        },
      },
    };
  });

  // ---- Content Studio -------------------------------------------------------
  app.post("/api/sites/:id/content/drafts", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "content.studio");
    const body = ContentRequestSchema.parse(req.body);
    const { profile, kit, ctx } = await base(site);
    try {
      const out = await generateContent(ctx, body, d.contentModel);
      const saved = await studio.saveDrafts({
        siteId: site.id,
        orgId: site.orgId,
        channel: body.channel,
        goal: body.goal,
        source: out.source,
        profileRevision: profile.revision,
        brandVersion: kit.version,
        userId: requireUser(req).userId,
        drafts: out.drafts,
      });
      await platform.audit({
        orgId: site.orgId,
        actorUserId: requireUser(req).userId,
        action: "content.drafted",
        objectType: "content_draft",
        objectId: saved[0]?.id ?? null,
        requestId: req.id,
        metadata: {
          source: out.source,
          count: saved.length,
          rejected: out.rejected.length,
          goal: body.goal,
          channel: body.channel,
        },
      });
      await platform.recordUsage(
        site.orgId,
        site.id,
        "CONTENT_DRAFT",
        saved.length,
        { source: out.source },
      );
      return reply.code(201).send({
        data: {
          drafts: saved,
          source: out.source,
          rejected: out.rejected.length,
        },
      });
    } catch (e) {
      if (e instanceof NotEnoughFacts)
        throw new HttpError(422, "not_enough_facts", e.message);
      throw e;
    }
  });
  app.get("/api/sites/:id/content/drafts", async (req) => ({
    data: await studio.listDrafts((await siteFor(req)).id),
  }));
  app.patch("/api/sites/:id/content/drafts/:draftId", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "content.studio");
    const { draftId } = z.object({ draftId: uuid }).parse(req.params);
    const cur = await studio.getDraft(site.id, draftId);
    if (!cur || cur.status !== "DRAFT") throw notFound();
    const draft = ContentDraftSchema.parse(req.body);
    const { ctx } = await base(site);
    const issues = validateDraft(draft, ctx, cur.channel);
    const block = issues.find((i) => i.severity === "block");
    if (block) throw new HttpError(422, "draft_rejected", block.message);
    const saved = await studio.updateDraft(site.id, draftId, draft, issues);
    if (!saved) throw notFound();
    return { data: saved };
  });
  app.delete("/api/sites/:id/content/drafts/:draftId", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { draftId } = z.object({ draftId: uuid }).parse(req.params);
    if (!(await studio.discardDraft(site.id, draftId))) throw notFound();
    return { data: { discarded: true } };
  });

  // ---- Brand Studio ---------------------------------------------------------
  const check = (
    site: { id: string },
    spec: z.infer<typeof AssetSpecSchema>,
    kit: Awaited<ReturnType<typeof base>>["kit"],
    graph: Awaited<ReturnType<typeof base>>["graph"],
  ) => {
    void site;
    return validateAssetSpec(spec, kit.kit, {
      contacts: contacts(graph.contact),
      expiredTitles: graph.offer.expiredOffers.map((o) => o.title),
    });
  };
  app.post("/api/sites/:id/assets", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.studio");
    const spec = AssetSpecSchema.parse(req.body);
    const { kit, graph } = await base(site);
    const issues = check(site, spec, kit, graph);
    const block = issues.find((i) => i.severity === "block");
    if (block) throw new HttpError(422, "asset_rejected", block.message);
    const r = renderAssetSvg(spec, kit.kit, graph.identity.name, kit.version);
    const png = (await d.raster()).png(r.svg, r.width);
    const asset = await studio.saveAsset({
      siteId: site.id,
      orgId: site.orgId,
      kind: "IMAGE",
      format: spec.format,
      category: spec.category,
      spec,
      brandVersion: kit.version,
      mime: "image/png",
      bytes: png,
      svg: r.svg,
      width: r.width,
      height: r.height,
      userId: requireUser(req).userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "asset.created",
      objectType: "media_asset",
      objectId: asset.id,
      requestId: req.id,
      metadata: { format: spec.format, brandVersion: kit.version },
    });
    await platform.recordUsage(site.orgId, site.id, "IMAGE_RENDER", 1, {
      format: spec.format,
    });
    return reply.code(201).send({ data: { asset, issues } });
  });
  /** Live preview: same renderer, nothing stored. */
  app.post("/api/sites/:id/assets/preview", async (req) => {
    const site = await siteFor(req);
    const spec = AssetSpecSchema.parse(req.body);
    const { kit, graph } = await base(site);
    return {
      data: {
        svg: renderAssetSvg(spec, kit.kit, graph.identity.name, kit.version)
          .svg,
        issues: check(site, spec, kit, graph),
        brandVersion: kit.version,
      },
    };
  });
  app.get("/api/sites/:id/assets", async (req) => ({
    data: await studio.listAssets((await siteFor(req)).id),
  }));
  app.get("/api/sites/:id/assets/:assetId/file", async (req, reply) => {
    const site = await siteFor(req);
    const { assetId } = z.object({ assetId: uuid }).parse(req.params);
    const q = z
      .object({ as: z.enum(["svg", "download"]).optional() })
      .parse(req.query);
    const f = await studio.assetFile(
      site.id,
      assetId,
      q.as === "svg" ? "svg" : "primary",
    );
    if (!f) throw notFound();
    const ext =
      f.mime === "video/mp4"
        ? "mp4"
        : f.mime === "image/svg+xml"
          ? "svg"
          : "png";
    return (
      reply
        .header("content-type", f.mime)
        .header("x-content-type-options", "nosniff")
        // An SVG opened directly must not be able to run script or load anything.
        .header(
          "content-security-policy",
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        )
        .header("cache-control", "private, max-age=3600")
        .header(
          "content-disposition",
          `${q.as === "download" ? "attachment" : "inline"}; filename="kora-${assetId.slice(0, 8)}.${ext}"`,
        )
        .send(f.bytes)
    );
  });

  // ---- Motion Studio --------------------------------------------------------
  app.post("/api/sites/:id/motion/preview", async (req) => {
    const site = await siteFor(req);
    const spec = MotionSpecSchema.parse(req.body);
    const { kit, graph } = await base(site);
    return {
      data: {
        frames: previewTimes(spec).map((t) => ({
          t,
          svg: motionFrameSvg(spec, kit.kit, graph.identity.name, t).svg,
        })),
        brandVersion: kit.version,
      },
    };
  });
  app.post("/api/sites/:id/motion", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "motion.studio");
    const spec = MotionSpecSchema.parse(req.body);
    if (!(await d.ffmpeg()))
      throw new HttpError(
        409,
        "not_configured",
        "Video export is not available on this server yet. You can still preview and use the still images.",
      );
    const { kit, graph } = await base(site);
    const job = await studio.enqueue({
      siteId: site.id,
      orgId: site.orgId,
      spec,
      brandVersion: kit.version,
      businessName: graph.identity.name,
      userId: requireUser(req).userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "motion.queued",
      objectType: "motion_render",
      objectId: job.id,
      requestId: req.id,
      metadata: { template: spec.template, format: spec.format },
    });
    return reply.code(202).send({ data: job });
  });
  app.get("/api/sites/:id/motion", async (req) => ({
    data: await studio.listJobs((await siteFor(req)).id),
  }));
  app.get("/api/sites/:id/motion/:renderId", async (req) => {
    const site = await siteFor(req);
    const { renderId } = z.object({ renderId: uuid }).parse(req.params);
    const j = await studio.getJob(site.id, renderId);
    if (!j) throw notFound();
    return { data: j };
  });
  app.post("/api/sites/:id/motion/:renderId/retry", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { renderId } = z.object({ renderId: uuid }).parse(req.params);
    if (!(await studio.retry(site.id, renderId)))
      throw new HttpError(
        409,
        "not_retryable",
        "Only a failed render can be retried.",
      );
    return { data: { status: "QUEUED" } };
  });
  void growth;
}
