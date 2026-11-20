import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PlatformStore } from "../platform/store.js";
import {
  HttpError,
  ROLE_RANK,
  notFound,
  requireOrgRole,
  requireUser,
} from "../platform/http.js";
import { RateLimiter } from "../platform/security.js";

const uuid = z.string().uuid();
const objectType = z.enum([
  "creative_document",
  "motion_project",
  "campaign",
  "site_version",
]);
const sha = (token: string) => createHash("sha256").update(token).digest("hex");

export function registerAgencyRoutes(
  app: FastifyInstance,
  platform: PlatformStore,
) {
  const shareLimiter = new RateLimiter(60, 60_000);
  const siteFor = async (
    req: FastifyRequest,
    min: "VIEWER" | "MEMBER" | "ADMIN",
  ) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const reviewFor = async (
    req: FastifyRequest,
    min: "VIEWER" | "MEMBER" = "VIEWER",
  ) => {
    const { id, reviewId } = z
      .object({ id: uuid, reviewId: uuid })
      .parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    const review = (
      await platform.sql`SELECT * FROM asset_reviews
        WHERE id=${reviewId} AND site_id=${site.id} AND org_id=${site.orgId}`
    )[0];
    if (!review) throw notFound();
    return { site, review };
  };
  const objectExists = async (
    siteId: string,
    type: z.infer<typeof objectType>,
    objectId: string,
  ) => {
    const table = {
      creative_document: "creative_documents",
      motion_project: "motion_projects",
      campaign: "campaigns",
      site_version: "site_versions",
    }[type];
    const rows = await platform.sql.unsafe(
      `SELECT 1 FROM ${table} WHERE id=$1 AND site_id=$2 LIMIT 1`,
      [objectId, siteId],
    );
    return rows.length > 0;
  };

  app.get("/api/agency/workspaces", async (req) => {
    const user = requireUser(req);
    const orgs = await platform.listOrgs(user.userId);
    const sites = await platform.listSites(orgs.map((org) => org.id));
    return {
      data: orgs.map((org) => ({
        ...org,
        clients: sites.filter((site) => site.orgId === org.id),
      })),
    };
  });

  app.get("/api/sites/:id/collaborators", async (req) => {
    const site = await siteFor(req, "VIEWER");
    const rows =
      await platform.sql`SELECT c.user_id,u.email,u.display_name,c.role,c.created_at
      FROM site_collaborators c JOIN users u ON u.id=c.user_id
      WHERE c.site_id=${site.id} AND c.org_id=${site.orgId}
      ORDER BY c.created_at`;
    return { data: rows };
  });

  app.put("/api/sites/:id/collaborators/:userId", async (req) => {
    const site = await siteFor(req, "ADMIN");
    const { userId } = z.object({ userId: uuid }).parse(req.params);
    const { role } = z
      .object({ role: z.enum(["EDITOR", "REVIEWER", "APPROVER"]) })
      .strict()
      .parse(req.body);
    const member = (
      await platform.sql`SELECT 1 FROM organization_memberships
        WHERE org_id=${site.orgId} AND user_id=${userId}`
    )[0];
    if (!member)
      throw new HttpError(
        422,
        "not_client_member",
        "Add this person to the client organization before assigning project access.",
      );
    const actor = requireUser(req);
    await platform.sql`INSERT INTO site_collaborators
      (site_id,org_id,user_id,role,created_by)
      VALUES (${site.id},${site.orgId},${userId},${role},${actor.userId})
      ON CONFLICT(site_id,user_id) DO UPDATE SET role=EXCLUDED.role,updated_at=now()`;
    await platform.audit({
      orgId: site.orgId,
      actorUserId: actor.userId,
      action: "agency.collaborator_set",
      objectType: "site",
      objectId: site.id,
      requestId: req.id,
      metadata: { userId, role },
    });
    return { data: { userId, role } };
  });

  app.get("/api/sites/:id/reviews", async (req) => {
    const site = await siteFor(req, "VIEWER");
    const rows = await platform.sql`SELECT r.*,
      (SELECT count(*)::int FROM review_comments c WHERE c.review_id=r.id) AS comments
      FROM asset_reviews r WHERE r.site_id=${site.id} AND r.org_id=${site.orgId}
      ORDER BY r.updated_at DESC LIMIT 100`;
    return { data: rows };
  });

  app.post("/api/sites/:id/reviews", async (req, reply) => {
    const site = await siteFor(req, "MEMBER");
    const body = z
      .object({
        objectType,
        objectId: uuid,
        version: z.number().int().min(1),
        title: z.string().trim().min(1).max(160),
      })
      .strict()
      .parse(req.body);
    if (!(await objectExists(site.id, body.objectType, body.objectId)))
      throw notFound();
    const user = requireUser(req);
    const id = randomUUID();
    await platform.inTransaction(async (tx) => {
      await tx.sql`INSERT INTO asset_reviews
        (id,site_id,org_id,object_type,object_id,version,title,created_by)
        VALUES (${id},${site.id},${site.orgId},${body.objectType},${body.objectId},
          ${body.version},${body.title},${user.userId})`;
      await tx.sql`INSERT INTO review_events
        (id,review_id,site_id,from_status,to_status,actor_id,detail)
        VALUES (${randomUUID()},${id},${site.id},NULL,'IN_REVIEW',${user.userId},'{}')`;
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: user.userId,
      action: "review.requested",
      objectType: body.objectType,
      objectId: body.objectId,
      requestId: req.id,
      metadata: { reviewId: id, version: body.version },
    });
    return reply.code(201).send({ data: { id, status: "IN_REVIEW" } });
  });

  app.get("/api/sites/:id/reviews/:reviewId", async (req) => {
    const { review } = await reviewFor(req);
    const comments =
      await platform.sql`SELECT c.id,c.body,c.anchor,c.created_at,
      u.display_name AS author FROM review_comments c JOIN users u ON u.id=c.author_id
      WHERE c.review_id=${String(review.id)} ORDER BY c.created_at`;
    const events =
      await platform.sql`SELECT from_status,to_status,actor_id,detail,created_at
      FROM review_events WHERE review_id=${String(review.id)} ORDER BY created_at`;
    return { data: { review, comments, events } };
  });

  app.post("/api/sites/:id/reviews/:reviewId/comments", async (req, reply) => {
    const { site, review } = await reviewFor(req);
    const body = z
      .object({
        body: z.string().trim().min(1).max(2000),
        anchor: z
          .object({
            sceneId: z.string().max(80).optional(),
            slide: z.number().int().min(0).max(20).optional(),
          })
          .strict()
          .default({}),
      })
      .strict()
      .parse(req.body);
    const user = requireUser(req);
    const id = randomUUID();
    await platform.sql`INSERT INTO review_comments
      (id,review_id,site_id,author_id,body,anchor)
      VALUES (${id},${String(review.id)},${site.id},${user.userId},${body.body},
        ${platform.sql.json(body.anchor)})`;
    return reply.code(201).send({ data: { id } });
  });

  app.post("/api/sites/:id/reviews/:reviewId/decision", async (req) => {
    const { site, review } = await reviewFor(req);
    const body = z
      .object({
        decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
        note: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(req.body);
    const user = requireUser(req);
    const orgRole = user.memberships.get(site.orgId)!;
    const collaborator = String(
      (
        await platform.sql`SELECT role FROM site_collaborators
          WHERE site_id=${site.id} AND user_id=${user.userId}`
      )[0]?.role ?? "",
    );
    const canApprove =
      ROLE_RANK[orgRole] >= ROLE_RANK.ADMIN || collaborator === "APPROVER";
    const canReview =
      canApprove ||
      collaborator === "REVIEWER" ||
      ROLE_RANK[orgRole] >= ROLE_RANK.MEMBER;
    if (body.decision === "APPROVED" ? !canApprove : !canReview)
      throw new HttpError(
        403,
        "forbidden",
        "This project role cannot make that decision.",
      );
    if (String(review.status) !== "IN_REVIEW")
      throw new HttpError(
        409,
        "review_already_decided",
        "Start a new review for a new revision.",
      );
    await platform.inTransaction(async (tx) => {
      await tx.sql`UPDATE asset_reviews SET status=${body.decision},
        decided_by=${user.userId},decided_at=now(),updated_at=now()
        WHERE id=${String(review.id)} AND status='IN_REVIEW'`;
      await tx.sql`INSERT INTO review_events
        (id,review_id,site_id,from_status,to_status,actor_id,detail)
        VALUES (${randomUUID()},${String(review.id)},${site.id},'IN_REVIEW',
          ${body.decision},${user.userId},${tx.sql.json({ note: body.note })})`;
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: user.userId,
      action: `review.${body.decision.toLowerCase()}`,
      objectType: String(review.object_type),
      objectId: String(review.object_id),
      requestId: req.id,
      metadata: {
        reviewId: String(review.id),
        version: Number(review.version),
      },
    });
    return { data: { id: String(review.id), status: body.decision } };
  });

  app.post("/api/sites/:id/reviews/:reviewId/share", async (req, reply) => {
    const { site, review } = await reviewFor(req, "MEMBER");
    const { days } = z
      .object({ days: z.number().int().min(1).max(30).default(7) })
      .parse(req.body ?? {});
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    await platform.sql`INSERT INTO review_preview_shares
      (id,review_id,site_id,token_hash,expires_at,created_by)
      VALUES (${randomUUID()},${String(review.id)},${site.id},${sha(token)},
        ${expiresAt},${requireUser(req).userId})`;
    return reply.code(201).send({ data: { token, expiresAt } });
  });

  app.get("/api/public/review-preview/:token", async (req) => {
    if (!shareLimiter.take(req.ip))
      throw new HttpError(429, "rate_limited", "Try again later.");
    const { token } = z
      .object({ token: z.string().min(40).max(100) })
      .parse(req.params);
    const row = (
      await platform.sql`SELECT r.* FROM review_preview_shares s
        JOIN asset_reviews r ON r.id=s.review_id AND r.site_id=s.site_id
        WHERE s.token_hash=${sha(token)} AND s.revoked_at IS NULL AND s.expires_at>now()`
    )[0];
    if (!row) throw notFound();
    let source: unknown = null;
    if (String(row.object_type) === "creative_document") {
      const sourceRow = (
        await platform.sql`SELECT source FROM creative_documents
          WHERE id=${String(row.object_id)} AND site_id=${String(row.site_id)}`
      )[0] as Record<string, unknown> | undefined;
      source = sourceRow?.source ?? null;
    } else if (String(row.object_type) === "motion_project") {
      const sourceRow = (
        await platform.sql`SELECT source FROM motion_projects
          WHERE id=${String(row.object_id)} AND site_id=${String(row.site_id)}
            AND deleted_at IS NULL`
      )[0] as Record<string, unknown> | undefined;
      source = sourceRow?.source ?? null;
    }
    return {
      data: {
        title: String(row.title),
        objectType: String(row.object_type),
        version: Number(row.version),
        status: String(row.status),
        source: source ?? null,
      },
    };
  });
}
