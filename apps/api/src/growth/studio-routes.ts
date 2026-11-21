import { createHash } from "node:crypto";
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
  MotionTimelineSchema,
  MotionSpecSchema,
  NotEnoughFacts,
  buildContentContext,
  buildPresenceGraph,
  generateContent,
  motionFrameSvg,
  motionDirectionsFor,
  motionTimelineCaptionsSrt,
  motionTimelineFrameSvg,
  motionStyleFromGenome,
  previewTimes,
  renderAssetSvg,
  staticAssetQuality,
  validateAssetSpec,
  validateDraft,
  type ContentModel,
  type MotionTimeline,
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
import { BrandOsStore } from "../platform/brand-os-store.js";
import {
  ffmpegBin,
  validateAudioBytes,
  type Rasterizer,
} from "./rasterizer.js";
import { requireFeature } from "./entitlements.js";
import type { createGatherer } from "./gather.js";
import { MotionProjectStore } from "./motion-project-store.js";

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
const usageKey = (req: FastifyRequest, fallback: string) => {
  const supplied =
    req.headers["idempotency-key"] ?? req.headers["x-idempotency-key"];
  if (Array.isArray(supplied))
    throw new HttpError(400, "invalid_idempotency_key");
  return z
    .string()
    .min(8)
    .max(200)
    .regex(/^[A-Za-z0-9_.:-]+$/)
    .parse(supplied ?? fallback);
};
const MAX_MOTION_AUDIO_BYTES = 20 * 1024 * 1024;
const audioMime = (bytes: Buffer) => {
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WAVE"
  )
    return "audio/wav" as const;
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("latin1") === "OggS")
    return "audio/ogg" as const;
  if (
    (bytes.length >= 3 && bytes.subarray(0, 3).toString("latin1") === "ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  )
    return "audio/mpeg" as const;
  return null;
};

/** The static-asset gate reads the brand as a genome-shaped object; a kit is enough to build one. */
const gateFor = (
  svg: string,
  kit: {
    colors: Record<string, string>;
    typography: Record<string, string>;
    voice: { avoid: string[] };
  },
  size: { width: number; height: number },
) =>
  staticAssetQuality(
    svg,
    {
      visual: {
        ink: kit.colors.ink!,
        canvas: kit.colors.canvas!,
        primary: kit.colors.primary!,
        accent: kit.colors.accent!,
        displayFamily: kit.typography.displayFamily!,
        bodyFamily: kit.typography.bodyFamily!,
        shape: "soft",
        imageryStyle: "abstract",
      },
      verbal: {
        tone: "warm",
        use: [],
        avoid: kit.voice.avoid,
        language: "en",
        sentenceRules: [],
      },
    },
    size,
  ).map((f) => ({ severity: f.severity, message: f.message }));

export function registerStudioRoutes(app: FastifyInstance, d: StudioDeps) {
  const { platform, billing, growth, studio, gather } = d;
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const brandOs = new BrandOsStore(platform.sql);
  const motionProjects = new MotionProjectStore(platform.sql);
  /** How this brand moves, from its Brand OS genome. Absent for sites that have no Brand OS (older designs). */
  const brandMotion = async (siteId: string) => {
    const latest = await brandOs.latest(siteId);
    return latest
      ? {
          style: motionStyleFromGenome(latest.brandOs.genome),
          brandOs: { version: latest.version, hash: latest.hash },
        }
      : null;
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
  const validateTimeline = async (
    site: Awaited<ReturnType<typeof siteFor>>,
    input: unknown,
  ): Promise<MotionTimeline> => {
    const timeline = MotionTimelineSchema.parse(input);
    await base(site);
    const kit = await growth.getBrandKit(site.id, timeline.brand.kitVersion);
    const referencedBrandOs = timeline.brand.brandOsVersion
      ? await brandOs.get(site.id, timeline.brand.brandOsVersion)
      : null;
    if (!kit)
      throw new HttpError(
        409,
        "motion_brand_missing",
        "The Brand Kit version referenced by this motion project is unavailable.",
      );
    if (
      (timeline.brand.brandOsVersion === null) !==
        (timeline.brand.brandOsHash === null) ||
      (timeline.brand.brandOsVersion !== null &&
        referencedBrandOs?.hash !== timeline.brand.brandOsHash)
    )
      throw new HttpError(
        409,
        "motion_brand_os_missing",
        "The BrandOS version referenced by this motion project is unavailable.",
      );
    const imageLayers = timeline.scenes.flatMap((scene) =>
      scene.layers.filter((layer) => layer.type === "image"),
    );
    const ids = [...new Set(imageLayers.map((layer) => layer.assetId))];
    if (ids.length) {
      const owned = await platform.sql`
        SELECT id, removed_at FROM owner_media
        WHERE site_id=${site.id} AND id = ANY(${ids}::uuid[])`;
      const found = new Map(
        owned.map((row) => [
          String(row.id),
          row.removed_at === null ? "active" : "removed",
        ]),
      );
      for (const layer of imageLayers) {
        const state = found.get(layer.assetId);
        if (!state && layer.missingAsset === "fail")
          throw new HttpError(
            422,
            "motion_asset_missing",
            "A required image is unavailable in this business's media library.",
          );
        if (state === "removed" && layer.missingAsset === "fail")
          throw new HttpError(
            422,
            "motion_asset_removed",
            "A required image was removed. Replace it before saving.",
          );
      }
    }
    if (timeline.audio) {
      const audio = (
        await platform.sql`
          SELECT license_kind,rights_confirmed_at,source
          FROM motion_audio
          WHERE id=${timeline.audio.assetId} AND site_id=${site.id}
            AND removed_at IS NULL`
      )[0];
      if (!audio)
        throw new HttpError(
          422,
          "motion_audio_missing",
          "The selected audio is unavailable in this business's audio library.",
        );
      if (
        String(audio.license_kind) !== timeline.audio.license.kind ||
        String(audio.source) !== timeline.audio.license.source ||
        new Date(audio.rights_confirmed_at as string).toISOString() !==
          new Date(timeline.audio.license.rightsConfirmedAt).toISOString()
      )
        throw new HttpError(
          422,
          "motion_audio_license_mismatch",
          "The audio license confirmation does not match the stored provenance.",
        );
    }
    return timeline;
  };

  app.get("/api/sites/:id/studio/options", async (req) => {
    const site = await siteFor(req);
    const [kit, motionBrand] = await Promise.all([
      growth.latestBrandKit(site.id),
      brandMotion(site.id),
    ]);
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
          brand: kit
            ? {
                kitVersion: kit.version,
                brandOsVersion: motionBrand?.brandOs.version ?? null,
                brandOsHash: motionBrand?.brandOs.hash ?? null,
              }
            : null,
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
    const gate = gateFor(r.svg, kit.kit, r);
    const gateBlock = gate.find((i) => i.severity === "block");
    if (gateBlock)
      throw new HttpError(422, "asset_rejected", gateBlock.message);
    issues.push(...gate);
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
    const rendered = renderAssetSvg(
      spec,
      kit.kit,
      graph.identity.name,
      kit.version,
    );
    return {
      data: {
        svg: rendered.svg,
        issues: [
          ...check(site, spec, kit, graph),
          ...gateFor(rendered.svg, kit.kit, rendered),
        ],
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
          `${q.as === "download" ? "attachment" : "inline"}; filename="krevstudio-${assetId.slice(0, 8)}.${ext}"`,
        )
        .send(f.bytes)
    );
  });

  // ---- Licensed Motion Audio -----------------------------------------------
  void app.register((scope) => {
    scope.addContentTypeParser(
      [
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "application/octet-stream",
      ],
      { parseAs: "buffer", bodyLimit: MAX_MOTION_AUDIO_BYTES + 1024 },
      (
        _request: FastifyRequest,
        body: Buffer,
        done: (error: Error | null, value?: unknown) => void,
      ) => done(null, body),
    );
    scope.post(
      "/api/sites/:id/motion/audio",
      { bodyLimit: MAX_MOTION_AUDIO_BYTES + 1024 },
      async (req, reply) => {
        const site = await siteFor(req, "MEMBER");
        await requireFeature(billing, site.orgId, "motion.studio");
        const query = z
          .object({
            licenseKind: z.enum(["user-supplied", "licensed"]),
            rightsConfirmedAt: z.string().datetime({ offset: true }),
            source: z.string().trim().min(1).max(120),
          })
          .strict()
          .parse(req.query);
        if (!Buffer.isBuffer(req.body))
          throw new HttpError(
            415,
            "motion_audio_type",
            "Upload an MP3, WAV or Ogg audio file.",
          );
        if (!req.body.length || req.body.length > MAX_MOTION_AUDIO_BYTES)
          throw new HttpError(
            413,
            "motion_audio_size",
            "Audio must be between 1 byte and 20 MB.",
          );
        const mime = audioMime(req.body);
        if (!mime)
          throw new HttpError(
            415,
            "motion_audio_type",
            "The file is not a supported MP3, WAV or Ogg audio file.",
          );
        if (
          !(await d.ffmpeg()) ||
          !(await validateAudioBytes(req.body, ffmpegBin(process.env)))
        )
          throw new HttpError(
            422,
            "motion_audio_corrupt",
            "The audio could not be decoded safely. Try a valid MP3, WAV or Ogg file.",
          );
        const confirmed = new Date(query.rightsConfirmedAt);
        if (confirmed.getTime() > Date.now() + 5 * 60_000)
          throw new HttpError(
            422,
            "motion_audio_license_date",
            "License confirmation cannot be in the future.",
          );
        const sha256 = createHash("sha256").update(req.body).digest("hex");
        const duplicate = (
          await platform.sql`
            SELECT id FROM motion_audio
            WHERE site_id=${site.id} AND sha256=${sha256} AND removed_at IS NULL`
        )[0];
        if (duplicate)
          throw new HttpError(
            409,
            "motion_audio_duplicate",
            "That audio file is already in this workspace.",
          );
        const audioId = crypto.randomUUID();
        const user = requireUser(req);
        await platform.sql`
          INSERT INTO motion_audio
            (id,site_id,org_id,mime,bytes,byte_size,sha256,license_kind,
             rights_confirmed_at,source,created_by)
          VALUES
            (${audioId},${site.id},${site.orgId},${mime},${req.body},
             ${req.body.length},${sha256},${query.licenseKind},
             ${confirmed.toISOString()},${query.source},${user.userId})`;
        await platform.audit({
          orgId: site.orgId,
          actorUserId: user.userId,
          action: "motion.audio_uploaded",
          objectType: "motion_audio",
          objectId: audioId,
          requestId: req.id,
          metadata: {
            mime,
            bytes: req.body.length,
            licenseKind: query.licenseKind,
          },
        });
        return reply.code(201).send({
          data: {
            id: audioId,
            mime,
            byteSize: req.body.length,
            license: {
              kind: query.licenseKind,
              rightsConfirmedAt: confirmed.toISOString(),
              source: query.source,
            },
          },
        });
      },
    );
  });

  app.get("/api/sites/:id/motion/audio", async (req) => {
    const site = await siteFor(req);
    const rows = await platform.sql`
      SELECT id,mime,byte_size,license_kind,rights_confirmed_at,source,created_at
      FROM motion_audio WHERE site_id=${site.id} AND removed_at IS NULL
      ORDER BY created_at DESC LIMIT 100`;
    return {
      data: rows.map((row) => ({
        id: String(row.id),
        mime: String(row.mime),
        byteSize: Number(row.byte_size),
        license: {
          kind: String(row.license_kind),
          rightsConfirmedAt: new Date(
            row.rights_confirmed_at as string,
          ).toISOString(),
          source: String(row.source),
        },
        createdAt: new Date(row.created_at as string).toISOString(),
      })),
    };
  });

  app.get("/api/sites/:id/motion/audio/:audioId/file", async (req, reply) => {
    const site = await siteFor(req);
    const { audioId } = z.object({ audioId: uuid }).parse(req.params);
    const row = (
      await platform.sql`
        SELECT mime,bytes FROM motion_audio
        WHERE site_id=${site.id} AND id=${audioId} AND removed_at IS NULL`
    )[0];
    if (!row) throw notFound();
    return reply
      .header("content-type", String(row.mime))
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, max-age=300")
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(row.bytes as Buffer);
  });

  app.delete("/api/sites/:id/motion/audio/:audioId", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { audioId } = z.object({ audioId: uuid }).parse(req.params);
    const removed = await platform.sql`
      UPDATE motion_audio SET removed_at=now()
      WHERE site_id=${site.id} AND id=${audioId} AND removed_at IS NULL
      RETURNING id`;
    if (!removed.length) throw notFound();
    return { data: { deleted: true } };
  });

  // ---- Editable Motion Projects --------------------------------------------
  const projectParams = z.object({ id: uuid, projectId: uuid });
  const projectBody = z
    .object({
      name: z.string().trim().min(1).max(120),
      timeline: z.unknown(),
    })
    .strict();

  app.post("/api/sites/:id/motion/projects", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "motion.studio");
    const body = projectBody.parse(req.body);
    const timeline = await validateTimeline(site, body.timeline);
    const user = requireUser(req);
    const project = await motionProjects.create({
      siteId: site.id,
      orgId: site.orgId,
      ownerId: user.userId,
      name: body.name,
      timeline,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: user.userId,
      action: "motion.project_created",
      objectType: "motion_project",
      objectId: project.id,
      requestId: req.id,
      metadata: { revision: 1, timelineVersion: timeline.version },
    });
    return reply.code(201).send({ data: project });
  });

  app.post("/api/sites/:id/motion/timeline/preview", async (req) => {
    const site = await siteFor(req);
    const timeline = await validateTimeline(site, req.body);
    const [{ kit }, graphData, assets] = await Promise.all([
      growth.getBrandKit(site.id, timeline.brand.kitVersion).then((record) => {
        if (!record) throw notFound();
        return record;
      }),
      base(site),
      studio.timelineAssets(
        site.id,
        timeline.scenes.flatMap((scene) =>
          scene.layers
            .filter((layer) => layer.type === "image")
            .map((layer) => layer.assetId),
        ),
      ),
    ]);
    const times = [
      0,
      Math.max(0, timeline.durationSec / 2),
      Math.max(0, timeline.durationSec - 1 / 24),
    ];
    return {
      data: {
        frames: times.map((time) => ({
          time,
          ...motionTimelineFrameSvg(
            timeline,
            kit,
            graphData.graph.identity.name,
            time,
            assets,
          ),
        })),
      },
    };
  });

  app.post("/api/sites/:id/motion/directions", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "motion.studio");
    const body = z
      .object({
        brief: z.string().trim().min(8).max(240),
        detail: z.string().trim().max(180).default(""),
        cta: z.string().trim().min(1).max(40).default("Learn more"),
        format: z.enum(["story", "square", "portrait", "landscape"]),
      })
      .strict()
      .parse(req.body);
    const [{ graph, kit }, motionBrand] = await Promise.all([
      base(site),
      brandMotion(site.id),
    ]);
    return {
      data: motionDirectionsFor({
        ...body,
        businessName: graph.identity.name,
        brand: {
          kitVersion: kit.version,
          brandOsVersion: motionBrand?.brandOs.version ?? null,
          brandOsHash: motionBrand?.brandOs.hash ?? null,
        },
      }),
    };
  });

  app.get("/api/sites/:id/motion/projects", async (req) => ({
    data: await motionProjects.list((await siteFor(req)).id),
  }));

  app.get("/api/sites/:id/motion/projects/:projectId", async (req) => {
    const site = await siteFor(req);
    const { projectId } = projectParams.parse(req.params);
    const project = await motionProjects.get(site.id, projectId);
    if (!project) throw notFound();
    return { data: project };
  });

  app.put("/api/sites/:id/motion/projects/:projectId", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "motion.studio");
    const { projectId } = projectParams.parse(req.params);
    const body = projectBody
      .extend({ expectedRevision: z.number().int().positive() })
      .parse(req.body);
    const timeline = await validateTimeline(site, body.timeline);
    const user = requireUser(req);
    const saved = await motionProjects.save({
      siteId: site.id,
      id: projectId,
      expectedRevision: body.expectedRevision,
      name: body.name,
      timeline,
      userId: user.userId,
    });
    if (!saved) throw notFound();
    if (saved === "STALE")
      throw new HttpError(
        409,
        "motion_revision_conflict",
        "This project changed in another session. Reload it before saving.",
      );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: user.userId,
      action: "motion.project_saved",
      objectType: "motion_project",
      objectId: saved.id,
      requestId: req.id,
      metadata: { revision: saved.revision },
    });
    return { data: saved };
  });

  app.get(
    "/api/sites/:id/motion/projects/:projectId/revisions",
    async (req) => {
      const site = await siteFor(req);
      const { projectId } = projectParams.parse(req.params);
      if (!(await motionProjects.get(site.id, projectId))) throw notFound();
      return { data: await motionProjects.revisions(site.id, projectId) };
    },
  );

  app.post("/api/sites/:id/motion/projects/:projectId/restore", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "motion.studio");
    const { projectId } = projectParams.parse(req.params);
    const body = z
      .object({
        revision: z.number().int().positive(),
        expectedRevision: z.number().int().positive(),
      })
      .strict()
      .parse(req.body);
    const [project, historical] = await Promise.all([
      motionProjects.get(site.id, projectId),
      motionProjects.revision(site.id, projectId, body.revision),
    ]);
    if (!project || !historical) throw notFound();
    const timeline = await validateTimeline(site, historical.timeline);
    const user = requireUser(req);
    const restored = await motionProjects.save({
      siteId: site.id,
      id: projectId,
      expectedRevision: body.expectedRevision,
      name: project.name,
      timeline,
      userId: user.userId,
    });
    if (!restored) throw notFound();
    if (restored === "STALE")
      throw new HttpError(
        409,
        "motion_revision_conflict",
        "This project changed in another session. Reload it before restoring.",
      );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: user.userId,
      action: "motion.project_restored",
      objectType: "motion_project",
      objectId: projectId,
      requestId: req.id,
      metadata: {
        restoredFrom: body.revision,
        revision: restored.revision,
      },
    });
    return { data: restored };
  });

  app.post(
    "/api/sites/:id/motion/projects/:projectId/duplicate",
    async (req, reply) => {
      const site = await siteFor(req, "MEMBER");
      await requireFeature(billing, site.orgId, "motion.studio");
      const { projectId } = projectParams.parse(req.params);
      const body = z
        .object({ name: z.string().trim().min(1).max(120).optional() })
        .strict()
        .parse(req.body ?? {});
      const copy = await motionProjects.duplicate({
        siteId: site.id,
        id: projectId,
        ownerId: requireUser(req).userId,
        ...(body.name ? { name: body.name } : {}),
      });
      if (!copy) throw notFound();
      return reply.code(201).send({ data: copy });
    },
  );

  app.get(
    "/api/sites/:id/motion/projects/:projectId/cover",
    async (req, reply) => {
      const site = await siteFor(req);
      const { projectId } = projectParams.parse(req.params);
      const project = await motionProjects.get(site.id, projectId);
      if (!project) throw notFound();
      const timeline = await validateTimeline(site, project.timeline);
      const [kitRecord, graphData, assets] = await Promise.all([
        growth.getBrandKit(site.id, timeline.brand.kitVersion),
        base(site),
        studio.timelineAssets(
          site.id,
          timeline.scenes.flatMap((scene) =>
            scene.layers
              .filter((layer) => layer.type === "image")
              .map((layer) => layer.assetId),
          ),
        ),
      ]);
      if (!kitRecord) throw notFound();
      const frame = motionTimelineFrameSvg(
        timeline,
        kitRecord.kit,
        graphData.graph.identity.name,
        0,
        assets,
      );
      const png = (await d.raster()).png(frame.svg, frame.width);
      return reply
        .header("content-type", "image/png")
        .header("x-content-type-options", "nosniff")
        .header(
          "content-disposition",
          `attachment; filename="krevstudio-${projectId.slice(0, 8)}-cover.png"`,
        )
        .send(png);
    },
  );

  app.get(
    "/api/sites/:id/motion/projects/:projectId/captions",
    async (req, reply) => {
      const site = await siteFor(req);
      const { projectId } = projectParams.parse(req.params);
      const project = await motionProjects.get(site.id, projectId);
      if (!project) throw notFound();
      return reply
        .header("content-type", "application/x-subrip; charset=utf-8")
        .header("x-content-type-options", "nosniff")
        .header(
          "content-disposition",
          `attachment; filename="krevstudio-${projectId.slice(0, 8)}-captions.srt"`,
        )
        .send(motionTimelineCaptionsSrt(project.timeline));
    },
  );

  app.post(
    "/api/sites/:id/motion/projects/:projectId/render",
    async (req, reply) => {
      const site = await siteFor(req, "MEMBER");
      await requireFeature(billing, site.orgId, "motion.studio");
      if (!(await d.ffmpeg()))
        throw new HttpError(
          409,
          "not_configured",
          "Video export is not available on this server yet. Timeline preview remains available.",
        );
      const { projectId } = projectParams.parse(req.params);
      const body = z
        .object({ expectedRevision: z.number().int().positive() })
        .strict()
        .parse(req.body);
      const project = await motionProjects.get(site.id, projectId);
      if (!project) throw notFound();
      if (project.revision !== body.expectedRevision)
        throw new HttpError(
          409,
          "motion_revision_conflict",
          "Save or reload the latest project revision before exporting.",
        );
      const timeline = await validateTimeline(site, project.timeline);
      const { graph } = await base(site);
      const user = requireUser(req);
      const idempotencyKey = usageKey(
        req,
        `motion:${projectId}:${project.revision}`,
      );
      const reservation = await billing.reserveUsage({
        orgId: site.orgId,
        siteId: site.id,
        kind: "video_render",
        idempotencyKey,
        metadata: { projectId, projectRevision: project.revision },
      });
      let job;
      try {
        job = await studio.enqueueTimeline({
          siteId: site.id,
          orgId: site.orgId,
          projectId,
          projectRevision: project.revision,
          spec: {
            kind: "timeline-v2",
            projectId,
            projectRevision: project.revision,
            timeline,
          },
          brandVersion: timeline.brand.kitVersion,
          businessName: graph.identity.name,
          userId: user.userId,
          usageReservationId: reservation.id,
          idempotencyKey,
        });
      } catch (error) {
        if (reservation.state === "RESERVED")
          await billing.releaseUsage(reservation.id);
        throw error;
      }
      await platform.audit({
        orgId: site.orgId,
        actorUserId: user.userId,
        action: "motion.timeline_queued",
        objectType: "motion_render",
        objectId: job.id,
        requestId: req.id,
        metadata: {
          projectId,
          projectRevision: project.revision,
          durationSec: timeline.durationSec,
          format: timeline.format,
        },
      });
      return reply.code(202).send({ data: job });
    },
  );

  app.delete("/api/sites/:id/motion/projects/:projectId", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { projectId } = projectParams.parse(req.params);
    if (!(await motionProjects.remove(site.id, projectId))) throw notFound();
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "motion.project_deleted",
      objectType: "motion_project",
      objectId: projectId,
      requestId: req.id,
      metadata: {},
    });
    return { data: { deleted: true } };
  });

  // ---- Motion Studio --------------------------------------------------------
  app.post("/api/sites/:id/motion/preview", async (req) => {
    const site = await siteFor(req);
    const parsed = MotionSpecSchema.parse(req.body);
    const bm = await brandMotion(site.id);
    const spec = bm && !parsed.style ? { ...parsed, style: bm.style } : parsed;
    const { kit, graph } = await base(site);
    return {
      data: {
        brandOs: bm?.brandOs ?? null,
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
    const parsed = MotionSpecSchema.parse(req.body);
    const bm = await brandMotion(site.id);
    const spec = bm && !parsed.style ? { ...parsed, style: bm.style } : parsed;
    if (!(await d.ffmpeg()))
      throw new HttpError(
        409,
        "not_configured",
        "Video export is not available on this server yet. You can still preview and use the still images.",
      );
    const { kit, graph } = await base(site);
    const idempotencyKey = usageKey(req, `motion-request:${req.id}`);
    const reservation = await billing.reserveUsage({
      orgId: site.orgId,
      siteId: site.id,
      kind: "video_render",
      idempotencyKey,
      metadata: { template: spec.template, format: spec.format },
    });
    let job;
    try {
      job = await studio.enqueue({
        siteId: site.id,
        orgId: site.orgId,
        spec,
        brandVersion: kit.version,
        businessName: graph.identity.name,
        userId: requireUser(req).userId,
        usageReservationId: reservation.id,
        idempotencyKey,
      });
    } catch (error) {
      if (reservation.state === "RESERVED")
        await billing.releaseUsage(reservation.id);
      throw error;
    }
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
    const job = await studio.getJob(site.id, renderId);
    if (!job || job.status !== "FAILED")
      throw new HttpError(
        409,
        "not_retryable",
        "Only a failed render can be retried.",
      );
    if (job.usageReservationId && job.idempotencyKey)
      await billing.reserveUsage({
        orgId: site.orgId,
        siteId: site.id,
        kind: "video_render",
        idempotencyKey: job.idempotencyKey,
        metadata: { retryOf: renderId },
      });
    if (!(await studio.retry(site.id, renderId))) {
      if (job.usageReservationId)
        await billing.releaseUsage(job.usageReservationId);
      throw new HttpError(409, "not_retryable");
    }
    return { data: { status: "QUEUED" } };
  });
  void growth;
}
