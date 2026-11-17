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
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as import("postgres").JSONValue;
export function registerCreativeDocumentRoutes(
  app: FastifyInstance,
  platform: PlatformStore,
) {
  const brandStore = new BrandOsStore(platform.sql);
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
  app.post("/api/sites/:id/creative-documents", async (req, reply) => {
    const site = await siteFor(
      req,
      z.object({ id: uuid }).parse(req.params).id,
      "MEMBER",
    );
    const request = createDocumentSchema.parse(req.body);
    const brand = await brandStore.latest(site.id);
    const version = brand?.version ?? 1;
    const owner = requireUser(req).userId;
    const source = buildCreativeDocument(request, {
      version,
      name: brand?.brandOs.name ?? site.name,
      ...(brand ? { colors: brand.brandOs.visual.palette } : {}),
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
        id: row.id,
        revision: Number(row.revision),
        status: row.status,
        source: creativeDocumentSchema.parse(row.source),
      },
    };
  });
  app.put("/api/sites/:id/creative-documents/:documentId", async (req) => {
    const { id, documentId } = routeIds.parse(req.params);
    const { site, row } = await docFor(req, id, documentId, "MEMBER");
    const { revision, source } = editDocumentSchema.parse(req.body);
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
  app.get(
    "/api/sites/:id/creative-documents/:documentId/export/:slide",
    async (req, reply) => {
      const { id, documentId, slide } = z
        .object({
          ...routeIds.shape,
          slide: z.coerce.number().int().nonnegative(),
        })
        .parse(req.params);
      const { row } = await docFor(req, id, documentId);
      const source = creativeDocumentSchema.parse(row.source);
      const art = source.slides[slide];
      if (!art) throw notFound();
      const svg = renderSlideSvg(art);
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
