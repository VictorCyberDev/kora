import type { FastifyInstance, FastifyRequest } from "fastify";
import type postgres from "postgres";
import sharp from "sharp";
import { z } from "zod";
import {
  ARTIFACT_FORMATS,
  COMPOSITIONS,
  ArtifactSpecSchema,
  type RenderOpts,
  ARTIFACT_FORMAT_IDS,
  OBJECTIVES,
  artifactIssues,
  composeArtifact,
  renderArtifactSvg,
  type ArtifactIssue,
  type ArtifactSpec,
} from "@kora/creative";
import { parseAnySiteSpec } from "@kora/site-schema";
import { proposeCampaign } from "@kora/growth";
import {
  HttpError,
  notFound,
  requireOrgRole,
  requireUser,
  type Role,
} from "../platform/http.js";
import type { PlatformStore } from "../platform/store.js";
import type { BillingService } from "../platform/billing.js";
import { BrandOsStore } from "../platform/brand-os-store.js";
import type { StudioStore } from "./studio-store.js";
import type { Rasterizer } from "./rasterizer.js";
import { requireFeature } from "./entitlements.js";

const idParam = z.object({ id: z.string().uuid() });
const line = (n: number) => z.string().trim().max(n);
export const artifactRequestSchema = z
  .object({
    format: z.enum(ARTIFACT_FORMAT_IDS),
    objective: z.enum(OBJECTIVES).default("announcement"),
    headline: line(80).min(1),
    eyebrow: line(40).default(""),
    subline: line(160).default(""),
    detail: line(90).default(""),
    bullets: z.array(line(50).min(1)).max(6).default([]),
    cta: line(30).default(""),
    offer: line(40).default(""),
    /** An APPROVED generated picture of this site. Unreviewed or rejected pictures are refused. */
    mediaId: z.string().uuid().optional(),
    /** One of the owner's own pictures from the media library. */
    photoId: z.string().uuid().optional(),
    /** Layout override (Try another design); otherwise Kora chooses from the format and the brand. */
    composition: z.enum(COMPOSITIONS).optional(),
    campaignId: line(60).optional(),
    /** false = Kora composed the wording: numbers must trace back to the owner's facts. */
    ownerWritten: z.boolean().default(true),
  })
  .strict();
export type ArtifactRequest = z.infer<typeof artifactRequestSchema>;

/** Geometry gates: text must stay on the canvas and out of the platform's chrome on stories. */
function layoutIssues(
  spec: ArtifactSpec,
  boxes: Array<{ role: string; x: number; y: number; w: number; h: number }>,
): ArtifactIssue[] {
  const f = ARTIFACT_FORMATS[spec.format];
  const out: ArtifactIssue[] = [];
  for (const b of boxes) {
    if (b.role === "ticker" || b.role === "cta-box") continue;
    if (b.x < -2 || b.x + b.w > f.width + 2 || b.y + b.h > f.height + 2)
      out.push({
        code: "TEXT_OFF_CANVAS",
        severity: "block",
        message: `The ${b.role} does not fit this format. Shorten it.`,
      });
    if (
      f.kind === "story" &&
      ["headline", "subline", "contact"].includes(b.role) &&
      (b.y < f.safe.t - 6 || b.y + b.h > f.height - f.safe.b + 10)
    )
      out.push({
        code: "OUTSIDE_SAFE_ZONE",
        severity: "warn",
        message: `The ${b.role} sits where the platform's own buttons will cover it.`,
      });
  }
  return out;
}

export function registerArtifactRoutes(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    billing: BillingService;
    studio: StudioStore;
    raster: () => Promise<Rasterizer>;
    sql: postgres.Sql;
  },
) {
  const { platform, billing, studio, sql } = d;
  const brandOs = new BrandOsStore(sql);
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await platform.getSite(idParam.parse(req.params).id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };

  type SiteRow = NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>;

  /**
   * Resolves what the spec REFERENCES (the brand's logo, the picture) into bytes for the renderer. The logo comes from
   * the Brand OS version the artifact was made with, so a later logo change never restyles an earlier artifact.
   */
  const resolveAssets = async (site: SiteRow, spec: ArtifactSpec) => {
    const opts: RenderOpts = {};
    if (spec.brand.logoAssetId) {
      const l = (
        await sql`SELECT logo_png, width, height FROM owner_media WHERE id=${spec.brand.logoAssetId} AND site_id=${site.id} AND kind='logo'`
      )[0];
      if (l?.logo_png) {
        const meta = await sharp(l.logo_png as Buffer).metadata();
        opts.logoDataUri = `data:image/png;base64,${(l.logo_png as Buffer).toString("base64")}`;
        opts.logoSize = {
          width: meta.width ?? Number(l.width),
          height: meta.height ?? Number(l.height),
        };
      }
    }
    const m = spec.media;
    if (m.kind === "owner-supplied" && m.assetId) {
      const r = (
        await sql`SELECT v1280, v1920, focal_x, focal_y FROM owner_media WHERE id=${m.assetId} AND site_id=${site.id} AND kind='photo'`
      )[0];
      if (!r) throw notFound();
      const bytes = (r.v1920 ?? r.v1280) as Buffer;
      const meta = await sharp(bytes).metadata();
      opts.imageDataUri = `data:image/webp;base64,${bytes.toString("base64")}`;
      opts.imageSize = {
        width: meta.width ?? 1280,
        height: meta.height ?? 853,
      };
      opts.focal = m.focal ?? { x: Number(r.focal_x), y: Number(r.focal_y) };
    } else if (m.kind === "ai-generated" && m.assetId) {
      const g = (
        await sql`SELECT mime, bytes, review, width, height FROM generated_media WHERE id=${m.assetId} AND site_id=${site.id} AND kind='image'`
      )[0];
      if (!g) throw notFound();
      if (g.review !== "APPROVED")
        throw new HttpError(
          422,
          "media_not_approved",
          "Approve this picture first. Kora never uses a generated picture you have not reviewed.",
        );
      const mime = String(g.mime);
      if (!/^image\/(png|jpeg|webp)$/.test(mime))
        throw new HttpError(
          422,
          "unsupported_media",
          "That picture format cannot be used.",
        );
      opts.imageDataUri = `data:${mime};base64,${(g.bytes as Buffer).toString("base64")}`;
      opts.imageSize = {
        width: Number(g.width ?? 1024),
        height: Number(g.height ?? 1024),
      };
      if (m.focal) opts.focal = m.focal;
    }
    return opts;
  };

  const finish = async (
    site: SiteRow,
    spec: ArtifactSpec,
    ownerWritten: boolean,
    bizFacts: string,
  ) => {
    const opts = await resolveAssets(site, spec);
    const rendered = renderArtifactSvg(spec, opts);
    const issues = [
      ...artifactIssues(spec, ownerWritten ? {} : { suppliedText: bizFacts }),
      ...layoutIssues(spec, rendered.boxes),
    ];
    return { spec, rendered, issues };
  };

  /** Builds the spec from the site's current Brand OS. The renderer is the only thing that draws. */
  const build = async (site: SiteRow, body: ArtifactRequest) => {
    const latest = await brandOs.latest(site.id);
    if (!latest)
      throw new HttpError(
        409,
        "needs_brand_os",
        "Create a new Kora design for this business first, so every creative can share one brand.",
      );
    const row = site.currentVersionId
      ? await platform.getVersionRow(site.id, site.currentVersionId)
      : null;
    const spec3 = row ? parseAnySiteSpec(row.spec) : null;
    const biz = spec3 && spec3.version === 3 ? spec3.business : null;
    const contact = biz?.whatsapp
      ? `WhatsApp ${biz.whatsapp}`
      : (biz?.phone ?? biz?.email ?? "");
    let focal: { x: number; y: number } | undefined;
    if (body.photoId) {
      const p = (
        await sql`SELECT focal_x, focal_y FROM owner_media WHERE id=${body.photoId} AND site_id=${site.id} AND kind='photo' AND removed_at IS NULL`
      )[0];
      if (!p) throw notFound();
      focal = { x: Number(p.focal_x), y: Number(p.focal_y) };
    }
    const imageId = body.photoId ?? body.mediaId;
    const spec = composeArtifact({
      format: body.format,
      brand: {
        name: latest.brandOs.name,
        version: latest.version,
        hash: latest.hash,
        mode: latest.brandOs.visual.mode,
        palette: latest.brandOs.visual.palette,
        genome: latest.brandOs.genome,
        logoAssetId: latest.brandOs.visual.logoAssetId,
      },
      objective: body.objective,
      ...(body.campaignId ? { campaignId: body.campaignId } : {}),
      content: {
        headline: body.headline,
        eyebrow: body.eyebrow,
        subline: body.subline,
        detail: body.detail,
        bullets: body.bullets,
        cta: body.cta,
        offer: body.offer,
        contact,
      },
      hasImage: !!imageId,
      ...(imageId
        ? {
            imageKind: body.photoId
              ? ("owner-supplied" as const)
              : ("ai-generated" as const),
            imageReview: "owner-approved" as const,
            assetId: imageId,
          }
        : {}),
      ...(focal ? { focal } : {}),
      ...(body.composition ? { composition: body.composition } : {}),
      seed: 7,
    });
    const f = await finish(
      site,
      spec,
      body.ownerWritten,
      JSON.stringify(biz ?? {}),
    );
    return { ...f, brandOs: latest };
  };

  app.get("/api/artifact-formats", (req) => {
    requireUser(req);
    return {
      data: Object.entries(ARTIFACT_FORMATS).map(([id, f]) => ({
        id,
        label: f.label,
        width: f.width,
        height: f.height,
        kind: f.kind,
      })),
    };
  });

  app.post("/api/sites/:id/artifacts/preview", async (req) => {
    const site = await siteFor(req);
    await requireFeature(billing, site.orgId, "brand.studio");
    const body = artifactRequestSchema.parse(req.body);
    const b = await build(site, body);
    return {
      data: {
        svg: b.rendered.svg,
        width: b.rendered.width,
        height: b.rendered.height,
        composition: b.spec.composition,
        issues: b.issues,
        brandOs: { version: b.brandOs.version, hash: b.brandOs.hash },
      },
    };
  });

  const create = async (
    req: FastifyRequest,
    site: NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>,
    body: ArtifactRequest,
  ) => {
    const b = await build(site, body);
    const block = b.issues.find((i) => i.severity === "block");
    if (block) throw new HttpError(422, "artifact_rejected", block.message);
    const png = (await d.raster()).png(
      b.rendered.svg,
      Math.min(b.rendered.width, 1920),
    );
    const user = requireUser(req);
    const asset = await studio.saveAsset({
      siteId: site.id,
      orgId: site.orgId,
      kind: "IMAGE",
      format: b.spec.format,
      category: body.objective,
      spec: b.spec,
      brandVersion: b.brandOs.version,
      mime: "image/png",
      bytes: png,
      svg: b.rendered.svg,
      width: b.rendered.width,
      height: b.rendered.height,
      userId: user.userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: user.userId,
      action: "artifact.created",
      objectType: "media_asset",
      objectId: asset.id,
      requestId: req.id,
      metadata: {
        format: b.spec.format,
        composition: b.spec.composition,
        brandOsVersion: b.brandOs.version,
      },
    });
    await platform.recordUsage(site.orgId, site.id, "IMAGE_RENDER", 1, {
      format: b.spec.format,
    });
    return { asset, issues: b.issues, composition: b.spec.composition };
  };

  /**
   * Edit one finished artifact without rebuilding the campaign: headline, wording, button, layout, emphasis, picture.
   * The edit re-renders from the artifact's OWN stored brand (palette, type, version), so it stays consistent with the
   * rest of its campaign; it creates a NEW asset and never changes the original.
   */
  app.post("/api/sites/:id/artifacts/:assetId/edit", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.studio");
    const { assetId } = z
      .object({ assetId: z.string().uuid() })
      .parse(req.params);
    const edit = z
      .object({
        headline: line(80).min(1).optional(),
        eyebrow: line(40).optional(),
        subline: line(160).optional(),
        detail: line(90).optional(),
        offer: line(40).optional(),
        cta: line(30).optional(),
        bullets: z.array(line(50).min(1)).max(6).optional(),
        composition: z.enum(COMPOSITIONS).optional(),
        /** An owner picture from the library, or null to remove the picture. */
        photoId: z.string().uuid().nullable().optional(),
      })
      .strict()
      .parse(req.body ?? {});
    const row = (
      await sql`SELECT spec FROM media_assets WHERE id=${assetId} AND site_id=${site.id} AND kind='IMAGE'`
    )[0];
    if (!row) throw notFound();
    const parsed = ArtifactSpecSchema.safeParse(row.spec);
    if (!parsed.success)
      throw new HttpError(
        422,
        "legacy_asset",
        "This image was made with the older studio. Create a new one to edit it.",
      );
    const spec = structuredClone(parsed.data);
    const { photoId, composition, ...text } = edit;
    for (const [k, v] of Object.entries(text))
      if (v !== undefined) (spec.content as Record<string, unknown>)[k] = v;
    if (composition) spec.composition = composition;
    if (photoId === null)
      spec.media = { kind: "plate", alt: "", reviewStatus: "n/a" };
    else if (photoId) {
      const p = (
        await sql`SELECT focal_x, focal_y FROM owner_media WHERE id=${photoId} AND site_id=${site.id} AND kind='photo' AND removed_at IS NULL`
      )[0];
      if (!p) throw notFound();
      spec.media = {
        kind: "owner-supplied",
        assetId: photoId,
        alt: "",
        reviewStatus: "owner-approved",
        focal: { x: Number(p.focal_x), y: Number(p.focal_y) },
      };
    }
    const fin = await finish(site, ArtifactSpecSchema.parse(spec), true, "");
    const block = fin.issues.find((i) => i.severity === "block");
    if (block) throw new HttpError(422, "artifact_rejected", block.message);
    const png = (await d.raster()).png(
      fin.rendered.svg,
      Math.min(fin.rendered.width, 1920),
    );
    const user = requireUser(req);
    const asset = await studio.saveAsset({
      siteId: site.id,
      orgId: site.orgId,
      kind: "IMAGE",
      format: spec.format,
      category: spec.campaign.objective,
      spec: fin.spec,
      brandVersion: spec.brand.osVersion,
      mime: "image/png",
      bytes: png,
      svg: fin.rendered.svg,
      width: fin.rendered.width,
      height: fin.rendered.height,
      userId: user.userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: user.userId,
      action: "artifact.edited",
      objectType: "media_asset",
      objectId: asset.id,
      requestId: req.id,
      metadata: { from: assetId, composition: spec.composition },
    });
    return reply.code(201).send({
      data: {
        asset,
        issues: fin.issues,
        composition: spec.composition,
        editedFrom: assetId,
      },
    });
  });

  app.post("/api/sites/:id/artifacts", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.studio");
    const body = artifactRequestSchema.parse(req.body);
    return reply.code(201).send({ data: await create(req, site, body) });
  });

  /** One message, several formats: a coordinated set that shares wording, brand version and campaign id. */
  app.post("/api/sites/:id/artifacts/bundle", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.studio");
    const { formats, ...rest } = z
      .object({ formats: z.array(z.enum(ARTIFACT_FORMAT_IDS)).min(1).max(6) })
      .passthrough()
      .parse(req.body);
    const campaignId =
      (rest as { campaignId?: string }).campaignId ??
      `c-${Date.now().toString(36)}`;
    const results: Array<
      Awaited<ReturnType<typeof create>> | { format: string; error: string }
    > = [];
    for (const format of [...new Set(formats)]) {
      const body = artifactRequestSchema.parse({ ...rest, format, campaignId });
      try {
        results.push(await create(req, site, body));
      } catch (e) {
        if (e instanceof HttpError) results.push({ format, error: e.message });
        else throw e;
      }
    }
    return reply.code(201).send({ data: { campaignId, results } });
  });

  // "I need more birthday cake orders next week": a coordinated PROPOSAL, never an action. Nothing is created, posted,
  // scheduled or spent here; each piece is a draft the owner later submits to the artifacts endpoints and approves.
  app.post("/api/sites/:id/campaign-proposal", async (req) => {
    const site = await siteFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "brand.studio");
    const { request } = z
      .object({ request: z.string().trim().min(3).max(400) })
      .strict()
      .parse(req.body);
    const row = site.currentVersionId
      ? await platform.getVersionRow(site.id, site.currentVersionId)
      : null;
    const spec = row ? parseAnySiteSpec(row.spec) : null;
    const offerings: string[] = [];
    const add = (t: unknown) => {
      if (typeof t === "string" && t.trim() && !offerings.includes(t.trim()))
        offerings.push(t.trim());
    };
    if (spec)
      for (const p of spec.pages)
        for (const sec of p.sections as Array<Record<string, unknown>>) {
          if (
            ["services", "offer", "products"].includes(String(sec.type)) &&
            Array.isArray(sec.items)
          )
            for (const it of sec.items as Array<Record<string, unknown>>)
              add(it.title ?? it.name);
          if (sec.type === "ticker" && Array.isArray(sec.items))
            for (const t of sec.items) add(t);
          if (sec.type === "hero" && Array.isArray(sec.highlights))
            for (const t of sec.highlights) add(t);
        }
    const biz = spec?.business;
    const result = proposeCampaign(request, {
      businessName: biz?.name ?? site.name,
      offerings,
      whatsapp: Boolean(biz?.whatsapp),
      phone: Boolean(biz?.phone),
      today: new Date(),
    });
    if ("error" in result)
      throw new HttpError(422, result.error, result.message);
    const latest = await brandOs.latest(site.id);
    return {
      data: {
        ...result,
        // the brand every piece would be made in; older sites without a Brand OS are told how to get one
        brand: latest
          ? { version: latest.version, name: latest.brandOs.name }
          : null,
        ...(latest
          ? {}
          : {
              needsFromOwner: [
                ...result.needsFromOwner,
                "Create your brand system first (Brand page: Work out my brand from my website), so every piece uses the same brand.",
              ],
            }),
      },
    };
  });
}
