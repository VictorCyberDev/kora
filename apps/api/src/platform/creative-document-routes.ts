import {
  assessCreativeSource,
  repairCreativeGeometry,
} from "./creative-evaluation.js";
import type { BillingService } from "./billing.js";
import { mediaBase, loadOwnerMedia } from "./owner-media-loader.js";
import {
  brandOsHash,
  recommendGraphicDirection,
  GRAPHIC_STYLES,
  type GraphicJudgement,
} from "@kora/creative";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOrgRole, requireUser, notFound, HttpError } from "./http.js";
import type { PlatformStore } from "./store.js";
import { BrandOsStore } from "./brand-os-store.js";
import {
  createDocumentSchema,
  creativeDocumentSchema,
  editDocumentSchema,
  renderSlideSvg,
  buildCreativeDocument,
} from "./creative-documents.js";

const uuid = z.string().uuid();
const exportUsageKey = (req: FastifyRequest) => {
  const supplied =
    req.headers["idempotency-key"] ?? req.headers["x-idempotency-key"];
  if (Array.isArray(supplied))
    throw new HttpError(400, "invalid_idempotency_key");
  return z
    .string()
    .min(8)
    .max(200)
    .regex(/^[A-Za-z0-9_.:-]+$/)
    .parse(supplied ?? `export-request:${req.id}`);
};
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as import("postgres").JSONValue;
export function registerCreativeDocumentRoutes(
  app: FastifyInstance,
  platform: PlatformStore,
  publicMediaUrl?: string,
  billing?: BillingService,
) {
  const brandStore = new BrandOsStore(platform.sql);
  // Reuse the existing append-only creative_feedback store. This is not a
  // second identity or preference system; facts remain in Business Facts.
  async function graphicMemory(orgId: string) {
    const rows = await platform.sql`SELECT subject, detail, created_at
      FROM creative_feedback
      WHERE org_id=${orgId} AND kind='GRAPHIC_STYLE_FEEDBACK'
      ORDER BY created_at ASC LIMIT 200`;
    const history: GraphicJudgement[] = [];
    for (const row of rows) {
      const style = String(row.subject);
      const detail = row.detail as Record<string, unknown> | null;
      if (
        !GRAPHIC_STYLES.includes(style as GraphicJudgement["style"]) ||
        !detail ||
        (detail.outcome !== "chosen" && detail.outcome !== "rejected")
      )
        continue;
      history.push({
        style: style as GraphicJudgement["style"],
        outcome: detail.outcome,
        locked: detail.locked === true,
        at: new Date(row.created_at as string).toISOString(),
      });
    }
    return recommendGraphicDirection(history);
  }

  async function validateDocumentMedia(
    siteId: string,
    source: import("./creative-documents.js").CreativeDocument,
  ) {
    const urls = source.slides.flatMap((slide) =>
      slide.layers
        .filter((layer) => layer.type === "image")
        .map((layer) => layer.src),
    );
    if (!urls.length) return;
    const media = await loadOwnerMedia(
      platform.sql,
      siteId,
      mediaBase(publicMediaUrl),
    );
    const allowed = new Set(
      media.photos.flatMap((photo) => [
        photo.url,
        ...photo.srcset.map((x) => x.url),
      ]),
    );
    if (urls.some((url) => !allowed.has(url)))
      throw new HttpError(
        422,
        "unapproved_graphic_asset",
        "Choose a photo from this business's approved image library.",
      );
    if (source.kind === "logo")
      throw new HttpError(
        422,
        "logo_must_be_vector",
        "Approved logos must remain editable vectors.",
      );
  }

  async function siteFor(
    req: FastifyRequest,
    id: string,
    role: "VIEWER" | "MEMBER" | "ADMIN" = "VIEWER",
  ) {
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, role);
    return site;
  }
  async function docFor(
    req: FastifyRequest,
    siteId: string,
    docId: string,
    role: "VIEWER" | "MEMBER" | "ADMIN" = "VIEWER",
  ) {
    const site = await siteFor(req, siteId, role);
    const row = (
      await platform.sql`SELECT * FROM creative_documents WHERE id=${docId} AND site_id=${site.id} AND org_id=${site.orgId}`
    )[0];
    if (!row) throw notFound();
    return { site, row };
  }
  const routeIds = z.object({ id: uuid, documentId: uuid });
  app.get("/api/sites/:id/creative-documents", async (req) => {
    const site = await siteFor(
      req,
      z.object({ id: uuid }).parse(req.params).id,
    );
    const rows =
      await platform.sql`SELECT id,kind,title,revision,status,brand_version,updated_at FROM creative_documents WHERE site_id=${site.id} AND org_id=${site.orgId} ORDER BY updated_at DESC LIMIT 150`;
    return { data: rows };
  });
  // Three genuine editable composition previews rendered by the same
  // generator as saved source, with no hidden persistence or outside model.
  app.post("/api/sites/:id/creative-documents/preview", async (req) => {
    const site = await siteFor(
      req,
      z.object({ id: uuid }).parse(req.params).id,
      "MEMBER",
    );
    const request = createDocumentSchema.parse(req.body);
    const brand = await brandStore.latest(site.id);
    const approvedLogoId = brand?.brandOs.visual.logoAssetId;
    const logo = approvedLogoId
      ? (
          await platform.sql`SELECT id,source FROM creative_documents
      WHERE id=${approvedLogoId} AND site_id=${site.id} AND org_id=${site.orgId}
        AND kind='logo' AND status='APPROVED'`
        )[0]
      : null;
    const identity = {
      version: brand?.version ?? 1,
      name: brand?.brandOs.name ?? site.name,
      ...(brand
        ? {
            colors: brand.brandOs.visual.palette,
            typeVoice: brand.brandOs.visual.typeVoice,
          }
        : {}),
      approvedLogo: logo
        ? {
            id: String(logo.id),
            source: creativeDocumentSchema.parse(logo.source),
          }
        : null,
    };
    const directions = [0, 1, 2].map((direction) => {
      const source = buildCreativeDocument({ ...request, direction }, identity);
      return { direction, source, svg: renderSlideSvg(source.slides[0]!) };
    });
    const memory = await graphicMemory(site.orgId);
    return { data: { directions, brandVersion: identity.version, memory } };
  });
  app.post("/api/sites/:id/creative-documents/style-feedback", async (req) => {
    const site = await siteFor(
      req,
      z.object({ id: uuid }).parse(req.params).id,
      "MEMBER",
    );
    const body = z
      .object({
        direction: z.number().int().min(0).max(2),
        outcome: z.enum(["chosen", "rejected"]),
        locked: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    if (body.locked) requireOrgRole(req, site.orgId, "OWNER");
    const current = await platform.sql`SELECT count(*)::int AS n FROM creative_feedback
      WHERE org_id=${site.orgId} AND kind='GRAPHIC_STYLE_FEEDBACK'
        AND created_at > now() - interval '1 day'`;
    if (Number(current[0]?.n ?? 0) >= 30)
      throw new HttpError(429, "design_feedback_limit", "Too many design ratings today.");
    await brandStore.feedback(
      site,
      "GRAPHIC_STYLE_FEEDBACK",
      GRAPHIC_STYLES[body.direction]!,
      { outcome: body.outcome, locked: body.locked, source: "OWNER" },
      requireUser(req).userId,
    );
    return { data: { memory: await graphicMemory(site.orgId) } };
  });

  app.post("/api/sites/:id/creative-documents", async (req, reply) => {
    const site = await siteFor(
      req,
      z.object({ id: uuid }).parse(req.params).id,
      "MEMBER",
    );
    const request = createDocumentSchema.parse(req.body);
    if (billing) {
      const { entitlements } = await billing.entitlements(site.orgId);
      if (!entitlements.canGenerate)
        throw new HttpError(
          402,
          "plan_restriction",
          "Your current plan does not permit new design generations.",
        );
    }
    const limit =
      await platform.sql`SELECT count(*)::int AS total FROM creative_documents
      WHERE site_id=${site.id} AND org_id=${site.orgId} AND status<>'ARCHIVED'`;
    if (Number(limit[0]?.total ?? 0) >= 200)
      throw new HttpError(
        429,
        "creative_library_limit",
        "This business has reached its active creative document limit.",
      );
    const brand = await brandStore.latest(site.id);
    const version = brand?.version ?? 1;
    const owner = requireUser(req).userId;
    const approvedLogoId = brand?.brandOs.visual.logoAssetId;
    const logoRow = approvedLogoId
      ? (
          await platform.sql`SELECT id,source FROM creative_documents
          WHERE id=${approvedLogoId} AND site_id=${site.id} AND org_id=${site.orgId}
            AND kind='logo' AND status='APPROVED'`
        )[0]
      : null;
    const approvedLogo = logoRow
      ? {
          id: String(logoRow.id),
          source: creativeDocumentSchema.parse(logoRow.source),
        }
      : null;
    const chosenDirection =
      (req.body as Record<string, unknown> | null)?.direction === undefined
        ? (await graphicMemory(site.orgId)).direction
        : request.direction;
    const source = buildCreativeDocument({ ...request, direction: chosenDirection }, {
      version,
      approvedLogo,
      name: brand?.brandOs.name ?? site.name,
      ...(brand
        ? {
            colors: brand.brandOs.visual.palette,
            typeVoice: brand.brandOs.visual.typeVoice,
          }
        : {}),
    });
    const documentId = randomUUID();
    await platform.inTransaction(async (tx) => {
      await tx.sql`INSERT INTO creative_documents(id,site_id,org_id,kind,title,revision,source,brand_version,created_by)
      VALUES (${documentId},${site.id},${site.orgId},${source.kind},${source.title},1,${tx.sql.json(json(source))},${source.brandVersion},${owner})`;
      await tx.sql`INSERT INTO creative_document_revisions(document_id,revision,source,brand_version,created_by)
      VALUES (${documentId},1,${tx.sql.json(json(source))},${source.brandVersion},${owner})`;
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: owner,
      action: "creative_document.created",
      objectType: "creative_document",
      objectId: documentId,
      requestId: req.id,
      metadata: { kind: source.kind },
    });
    reply.status(201);
    return { data: { id: documentId, revision: 1, source } };
  });
  app.get("/api/sites/:id/creative-documents/:documentId", async (req) => {
    const { id, documentId } = routeIds.parse(req.params);
    const { row } = await docFor(req, id, documentId);
    return {
      data: {
        id: String(row.id),
        revision: Number(row.revision),
        status: String(row.status),
        source: creativeDocumentSchema.parse(row.source),
      },
    };
  });
  app.put("/api/sites/:id/creative-documents/:documentId", async (req) => {
    const { id, documentId } = routeIds.parse(req.params);
    const { site, row } = await docFor(req, id, documentId, "MEMBER");
    const { revision, source } = editDocumentSchema.parse(req.body);
    if (revision >= 250)
      throw new HttpError(
        429,
        "creative_history_limit",
        "This document has reached its revision limit. Create a new document.",
      );
    await validateDocumentMedia(site.id, source);
    if (
      source.approvedLogoId !==
      creativeDocumentSchema.parse(row.source).approvedLogoId
    )
      throw new HttpError(
        409,
        "brand_asset_immutable",
        "Approved logo reference is controlled by Brand OS.",
      );
    if (source.kind !== row.kind)
      throw new HttpError(
        409,
        "immutable_kind",
        "Document type cannot change.",
      );
    if (source.brandVersion !== Number(row.brand_version))
      throw new HttpError(
        409,
        "brand_version",
        "Use the document's original approved brand version.",
      );
    const owner = requireUser(req).userId;
    const next = await platform.inTransaction(async (tx) => {
      const updated =
        await tx.sql`UPDATE creative_documents SET source=${tx.sql.json(json(source))},title=${source.title},revision=revision+1,updated_at=now(),status='DRAFT'
      WHERE id=${documentId} AND site_id=${site.id} AND org_id=${site.orgId} AND revision=${revision} RETURNING revision`;
      if (!updated.length)
        throw new HttpError(
          409,
          "version_conflict",
          "Document changed in another editor. Reload before saving.",
        );
      const nextRevision = Number(updated[0]!.revision);
      await tx.sql`INSERT INTO creative_document_revisions(document_id,revision,source,brand_version,created_by)
      VALUES (${documentId},${nextRevision},${tx.sql.json(json(source))},${source.brandVersion},${owner})`;
      return nextRevision;
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: owner,
      action: "creative_document.edited",
      objectType: "creative_document",
      objectId: documentId,
      requestId: req.id,
      metadata: { revision: next },
    });
    return { data: { id: documentId, revision: next, source } };
  });
  app.get(
    "/api/sites/:id/creative-documents/:documentId/evaluation",
    async (req) => {
      const { id, documentId } = routeIds.parse(req.params);
      const { row } = await docFor(req, id, documentId);
      const source = creativeDocumentSchema.parse(row.source);
      return {
        data: {
          revision: Number(row.revision),
          findings: assessCreativeSource(source),
          evaluationType: "DETERMINISTIC_SOURCE_ONLY",
          visualModelExecuted: false,
          screenshotsReviewed: false,
        },
      };
    },
  );
  app.post(
    "/api/sites/:id/creative-documents/:documentId/repair-geometry",
    async (req) => {
      const { id, documentId } = routeIds.parse(req.params);
      const { site, row } = await docFor(req, id, documentId, "MEMBER");
      const { revision } = z
        .object({ revision: z.number().int().positive() })
        .parse(req.body);
      if (Number(row.revision) !== revision)
        throw new HttpError(
          409,
          "version_conflict",
          "Reload the latest document before repairing.",
        );
      const fixed = repairCreativeGeometry(
        creativeDocumentSchema.parse(row.source),
      );
      if (!fixed.changes.length)
        return { data: { revision, changes: [], source: fixed.source } };
      const owner = requireUser(req).userId;
      const nextRevision = await platform.inTransaction(async (tx) => {
        const updated =
          await tx.sql`UPDATE creative_documents SET source=${tx.sql.json(json(fixed.source))},revision=revision+1,status='DRAFT',updated_at=now()
        WHERE id=${documentId} AND site_id=${site.id} AND org_id=${site.orgId} AND revision=${revision} RETURNING revision`;
        if (!updated.length)
          throw new HttpError(
            409,
            "version_conflict",
            "Reload the latest document before repairing.",
          );
        const next = Number(updated[0]!.revision);
        await tx.sql`INSERT INTO creative_document_revisions(document_id,revision,source,brand_version,created_by)
        VALUES(${documentId},${next},${tx.sql.json(json(fixed.source))},${fixed.source.brandVersion},${owner})`;
        return next;
      });
      await platform.audit({
        orgId: site.orgId,
        actorUserId: owner,
        action: "creative_document.geometry_repaired",
        objectType: "creative_document",
        objectId: documentId,
        requestId: req.id,
        metadata: { changes: fixed.changes.length },
      });
      return {
        data: {
          revision: nextRevision,
          changes: fixed.changes,
          source: fixed.source,
        },
      };
    },
  );
  app.get(
    "/api/sites/:id/creative-documents/:documentId/history",
    async (req) => {
      const { id, documentId } = routeIds.parse(req.params);
      await docFor(req, id, documentId);
      const rows =
        await platform.sql`SELECT revision,brand_version,created_at FROM creative_document_revisions WHERE document_id=${documentId} ORDER BY revision DESC LIMIT 100`;
      return { data: rows };
    },
  );
  app.post(
    "/api/sites/:id/creative-documents/:documentId/restore",
    async (req) => {
      const { id, documentId } = routeIds.parse(req.params);
      const { site, row } = await docFor(req, id, documentId, "MEMBER");
      const version = z
        .object({
          revision: z.number().int().positive(),
          currentRevision: z.number().int().positive(),
        })
        .parse(req.body);
      const history = (
        await platform.sql`SELECT source FROM creative_document_revisions WHERE document_id=${documentId} AND revision=${version.revision}`
      )[0];
      if (!history) throw notFound();
      if (Number(row.revision) !== version.currentRevision)
        throw new HttpError(
          409,
          "version_conflict",
          "Document changed; reload.",
        );
      const source = creativeDocumentSchema.parse(history.source);
      await validateDocumentMedia(site.id, source);
      const owner = requireUser(req).userId;
      const next = await platform.inTransaction(async (tx) => {
        const updated =
          await tx.sql`UPDATE creative_documents SET source=${tx.sql.json(json(source))},revision=revision+1,status='DRAFT',updated_at=now()
      WHERE id=${documentId} AND org_id=${site.orgId} AND revision=${version.currentRevision} RETURNING revision`;
        if (!updated.length)
          throw new HttpError(
            409,
            "version_conflict",
            "Document changed; reload.",
          );
        const revision = Number(updated[0]!.revision);
        await tx.sql`INSERT INTO creative_document_revisions(document_id,revision,source,brand_version,created_by)
      VALUES(${documentId},${revision},${tx.sql.json(json(source))},${source.brandVersion},${owner})`;
        return revision;
      });
      return { data: { revision: next, source } };
    },
  );
  app.post(
    "/api/sites/:id/creative-documents/:documentId/approve",
    async (req) => {
      const { id, documentId } = routeIds.parse(req.params);
      const { site, row } = await docFor(req, id, documentId, "ADMIN");
      const latestSource = creativeDocumentSchema.parse(row.source);
      await validateDocumentMedia(site.id, latestSource);
      if (
        assessCreativeSource(latestSource).some((f) => f.severity === "BLOCKER")
      )
        throw new HttpError(
          422,
          "creative_quality_blocker",
          "Resolve the blocked layers before approving this document.",
        );
      const revision = z
        .object({ revision: z.number().int().positive() })
        .parse(req.body).revision;
      const updated =
        await platform.sql`UPDATE creative_documents SET status='APPROVED',updated_at=now()
      WHERE id=${documentId} AND org_id=${site.orgId} AND revision=${revision} RETURNING id`;
      if (!updated.length)
        throw new HttpError(
          409,
          "version_conflict",
          "Approve the latest saved revision.",
        );
      await platform.audit({
        orgId: site.orgId,
        actorUserId: requireUser(req).userId,
        action: "creative_document.approved",
        objectType: "creative_document",
        objectId: documentId,
        requestId: req.id,
      });
      return { data: { id: documentId, status: "APPROVED" } };
    },
  );
  app.post(
    "/api/sites/:id/creative-documents/:documentId/activate-logo",
    async (req) => {
      const { id, documentId } = routeIds.parse(req.params);
      const { site, row } = await docFor(req, id, documentId, "ADMIN");
      if (row.kind !== "logo" || row.status !== "APPROVED")
        throw new HttpError(
          409,
          "logo_not_approved",
          "Approve a saved vector logo before adding it to your brand.",
        );
      const owner = requireUser(req).userId;
      const result = await platform.inTransaction(async (tx) => {
        const history = new BrandOsStore(tx.sql);
        const latest = await history.latest(site.id);
        if (!latest)
          throw new HttpError(
            409,
            "brand_missing",
            "Create a versioned Brand OS before activating your logo.",
          );
        if (latest.brandOs.visual.logoAssetId === documentId)
          return {
            version: latest.version,
            logoDocumentId: documentId,
            unchanged: true,
          };
        const nextVersion = latest.version + 1;
        const nextBrand = {
          ...latest.brandOs,
          version: nextVersion,
          visual: { ...latest.brandOs.visual, logoAssetId: documentId },
          provenance: {
            ...latest.brandOs.provenance,
            createdBy: "owner-edit" as const,
          },
        };
        const inserted = await tx.sql`INSERT INTO brand_os_versions
        (id,site_id,org_id,version,hash,grammar_id,direction_name,brand_os,created_by)
        VALUES(${randomUUID()},${site.id},${site.orgId},${nextVersion},
          ${brandOsHash(nextBrand)},${nextBrand.grammarId},${"Approved vector logo"},
          ${tx.sql.json(json(nextBrand))},${owner})
        ON CONFLICT(site_id,version) DO NOTHING RETURNING version`;
        if (!inserted.length)
          throw new HttpError(
            409,
            "brand_conflict",
            "Brand settings changed. Reload and approve again.",
          );
        return {
          version: nextVersion,
          logoDocumentId: documentId,
          unchanged: false,
        };
      });
      await platform.audit({
        orgId: site.orgId,
        actorUserId: owner,
        action: "brand.logo_activated",
        objectType: "creative_document",
        objectId: documentId,
        requestId: req.id,
        metadata: { brandVersion: result.version },
      });
      return { data: result };
    },
  );
  app.get(
    "/api/sites/:id/creative-documents/:documentId/publishing-package",
    async (req) => {
      const { id, documentId } = routeIds.parse(req.params);
      const { row } = await docFor(req, id, documentId);
      if (row.status !== "APPROVED")
        throw new HttpError(
          409,
          "needs_approval",
          "Approve this saved creative version before preparing a publishing package.",
        );
      const source = creativeDocumentSchema.parse(row.source);
      const media = source.slides.map((_, index) => ({
        format: "svg",
        mime: "image/svg+xml",
        slide: index + 1,
        downloadPath: `/api/sites/${id}/creative-documents/${documentId}/export/${index}`,
      }));
      return {
        data: {
          documentId,
          revision: Number(row.revision),
          kind: source.kind,
          brandVersion: source.brandVersion,
          caption: source.sourcePrompt,
          altText: source.title,
          hashtags: [],
          media,
          status: "APPROVED_NOT_PUBLISHED",
          requestedChannels: [],
          publicationEvidence: null,
          guidance:
            "Use exports with an authorized connected channel; a prepared package is not a published post.",
        },
      };
    },
  );
  app.get(
    "/api/sites/:id/creative-documents/:documentId/export/:slide",
    async (req, reply) => {
      const { id, documentId, slide } = z
        .object({
          ...routeIds.shape,
          slide: z.coerce.number().int().nonnegative(),
        })
        .parse(req.params);
      const { site, row } = await docFor(req, id, documentId);
      const source = creativeDocumentSchema.parse(row.source);
      const art = source.slides[slide];
      if (!art) throw notFound();
      const usageMetadata = {
        kind: source.kind,
        documentId,
        revision: Number(row.revision),
        slide,
      };
      const reservation = billing
        ? await billing.reserveUsage({
            orgId: site.orgId,
            siteId: site.id,
            kind: "export",
            idempotencyKey: exportUsageKey(req),
            metadata: usageMetadata,
          })
        : null;
      let svg: string;
      try {
        svg = renderSlideSvg(art);
        await platform.audit({
          orgId: site.orgId,
          actorUserId: requireUser(req).userId,
          action: "creative_document.exported",
          objectType: "creative_document",
          objectId: documentId,
          requestId: req.id,
          metadata: { revision: Number(row.revision), slide, format: "svg" },
        });
        if (reservation?.state === "RESERVED")
          await billing?.consumeUsage(reservation.id);
      } catch (error) {
        if (reservation?.state === "RESERVED")
          await billing?.releaseUsage(reservation.id);
        throw error;
      }
      reply.header("content-type", "image/svg+xml; charset=utf-8");
      reply.header(
        "content-disposition",
        `attachment; filename="krevstudio-${source.kind}-${slide + 1}.svg"`,
      );
      reply.header("x-content-type-options", "nosniff");
      reply.header("cache-control", "private, no-store");
      return reply.send(svg);
    },
  );
}
