import type { FastifyInstance, FastifyRequest } from "fastify";
import type postgres from "postgres";
import { z } from "zod";
import {
  ARTIFACT_FORMATS,
  ARTIFACT_FORMAT_IDS,
  OBJECTIVES,
  artifactIssues,
  composeArtifact,
  renderArtifactSvg,
  type ArtifactIssue,
  type ArtifactSpec,
} from "@kora/creative";
import { parseAnySiteSpec } from "@kora/site-schema";
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

  /** Builds the spec from the site's current Brand OS. The renderer is the only thing that draws. */
  const build = async (
    site: NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>,
    body: ArtifactRequest,
  ) => {
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
    let image: { dataUri: string; width: number; height: number } | undefined;
    if (body.mediaId) {
      const m = (
        await sql`SELECT mime, bytes, review, width, height FROM generated_media WHERE id=${body.mediaId} AND site_id=${site.id} AND kind='image'`
      )[0];
      if (!m) throw notFound();
      if (m.review !== "APPROVED")
        throw new HttpError(
          422,
          "media_not_approved",
          "Approve this picture first. Kora never uses a generated picture you have not reviewed.",
        );
      const mime = String(m.mime);
      if (!/^image\/(png|jpeg|webp)$/.test(mime))
        throw new HttpError(
          422,
          "unsupported_media",
          "That picture format cannot be used.",
        );
      image = {
        dataUri: `data:${mime};base64,${(m.bytes as Buffer).toString("base64")}`,
        width: Number(m.width ?? 1024),
        height: Number(m.height ?? 1024),
      };
    }
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
      hasImage: !!image,
      ...(image
        ? {
            imageKind: "ai-generated" as const,
            imageReview: "owner-approved" as const,
          }
        : {}),
      ...(body.mediaId ? { assetId: body.mediaId } : {}),
      seed: 7,
    });
    const r = renderArtifactSvg(
      spec,
      image
        ? {
            imageDataUri: image.dataUri,
            imageSize: { width: image.width, height: image.height },
          }
        : {},
    );
    const facts = JSON.stringify(biz ?? {});
    const issues = [
      ...artifactIssues(spec, body.ownerWritten ? {} : { suppliedText: facts }),
      ...layoutIssues(spec, r.boxes),
    ];
    return { spec, rendered: r, issues, brandOs: latest };
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
}
