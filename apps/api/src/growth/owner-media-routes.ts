import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type postgres from "postgres";
import { z } from "zod";
import {
  HttpError,
  notFound,
  requireOrgRole,
  requireUser,
  type Role,
} from "../platform/http.js";
import type { PlatformStore } from "../platform/store.js";
import type { BillingService } from "../platform/billing.js";
import { requireFeature } from "./entitlements.js";
import {
  MAX_UPLOAD_BYTES,
  MediaRejected,
  ROLES,
  processUpload,
  safeFilename,
  suggestRole,
  type MediaQuality,
} from "./owner-media.js";

const toJson = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as postgres.JSONValue;
const idParam = z.object({ id: z.string().uuid() });
const midParam = z.object({ id: z.string().uuid(), mid: z.string().uuid() });

import {
  loadOwnerMedia,
  mediaBase,
  publicMediaUrl,
  type OwnerMediaForPlanner,
} from "../platform/owner-media-loader.js";
export { loadOwnerMedia, mediaBase, publicMediaUrl, type OwnerMediaForPlanner };

export function registerOwnerMediaRoutes(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    billing: BillingService;
    sql: postgres.Sql;
    publicUrl: string | undefined;
  },
) {
  const { platform, billing, sql } = d;
  const base = mediaBase(d.publicUrl);
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await platform.getSite(idParam.parse(req.params).id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const item = (r: postgres.Row, siteId: string) => ({
    id: String(r.id),
    kind: String(r.kind),
    role: String(r.role),
    width: Number(r.width),
    height: Number(r.height),
    hasAlpha: !!r.has_alpha,
    alt: String(r.alt),
    focal: { x: Number(r.focal_x), y: Number(r.focal_y) },
    quality: r.quality as MediaQuality,
    createdAt: new Date(r.created_at as string).toISOString(),
    thumbUrl: `/api/sites/${siteId}/media-library/${String(r.id)}/file?v=thumb`,
    usableInDesigns: base !== null,
  });
  const COLS = sql`id, kind, role, width, height, has_alpha, alt, focal_x, focal_y, quality, created_at`;

  // Uploads arrive as the raw picture bytes. The declared content type is not trusted: the file's own structure decides.
  void app.register((scope) => {
    scope.addContentTypeParser(
      ["image/png", "image/jpeg", "image/webp", "application/octet-stream"],
      { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES + 1024 },
      (
        _r: FastifyRequest,
        body: Buffer,
        done: (e: Error | null, v?: unknown) => void,
      ) => done(null, body),
    );
    scope.post(
      "/api/sites/:id/media-library",
      { bodyLimit: MAX_UPLOAD_BYTES + 1024 },
      async (req, reply) => {
        const site = await siteFor(req, "MEMBER");
        await requireFeature(billing, site.orgId, "brand.studio");
        const q = z
          .object({
            kind: z.enum(["logo", "photo"]),
            filename: z.string().max(200).default("upload"),
            role: z.enum(ROLES).optional(),
            alt: z.string().max(200).optional(),
          })
          .parse(req.query);
        const body = req.body;
        if (!Buffer.isBuffer(body))
          throw new HttpError(
            415,
            "unsupported_type",
            "Please upload a PNG, JPEG or WebP picture.",
          );
        let p;
        try {
          p = await processUpload(body, q.kind);
        } catch (e) {
          if (e instanceof MediaRejected)
            throw new HttpError(
              e.code === "too_large"
                ? 413
                : e.code === "unsupported_type"
                  ? 415
                  : 422,
              `media_${e.code}`,
              e.message,
            );
          throw e;
        }
        const user = requireUser(req);
        const id = randomUUID();
        const role =
          q.kind === "logo"
            ? "logo"
            : (q.role ?? suggestRole(q.filename, p.quality));
        const dupe = (
          await sql`SELECT id FROM owner_media WHERE site_id=${site.id} AND sha256=${p.sha256} AND removed_at IS NULL`
        )[0];
        if (dupe)
          throw new HttpError(
            409,
            "media_duplicate",
            "That picture is already in your library.",
          );
        const provenance = {
          sourceType: "owner-supplied",
          uploadedBy: user.userId,
          filename: safeFilename(q.filename),
          originalFormat: p.format,
          originalBytes: p.originalBytes,
          reviewStatus: "owner-approved",
        };
        await sql.begin(async (tx) => {
          if (q.kind === "logo")
            await tx`UPDATE owner_media SET removed_at=now(), replaced_by=${id} WHERE site_id=${site.id} AND kind='logo' AND removed_at IS NULL`;
          await tx`INSERT INTO owner_media (id, site_id, org_id, kind, role, sha256, width, height, has_alpha, alt, quality, provenance, v640, v1280, v1920, logo_png, thumb, created_by)
          VALUES (${id}, ${site.id}, ${site.orgId}, ${q.kind}, ${role}, ${p.sha256}, ${p.width}, ${p.height}, ${p.hasAlpha}, ${q.alt ?? ""}, ${tx.json(toJson(p.quality))}, ${tx.json(toJson(provenance))},
          ${p.v640 ?? null}, ${p.v1280 ?? null}, ${p.v1920 ?? null}, ${p.logoPng ?? null}, ${p.thumb}, ${user.userId})`;
        });
        await platform.audit({
          orgId: site.orgId,
          actorUserId: user.userId,
          action:
            q.kind === "logo" ? "media.logo_uploaded" : "media.photo_uploaded",
          objectType: "owner_media",
          objectId: id,
          requestId: req.id,
          metadata: { role, score: p.quality.score },
        });
        const row = (
          await sql`SELECT ${COLS} FROM owner_media WHERE id=${id}`
        )[0]!;
        return reply.code(201).send({
          data: {
            ...item(row, site.id),
            suggestedRole: role,
            advice: advice(p.quality),
          },
        });
      },
    );
  });

  app.get("/api/sites/:id/media-library", async (req) => {
    const site = await siteFor(req);
    const rows =
      await sql`SELECT ${COLS} FROM owner_media WHERE site_id=${site.id} AND removed_at IS NULL ORDER BY created_at DESC LIMIT 200`;
    return {
      data: {
        items: rows.map((r) => ({
          ...item(r, site.id),
          advice: advice(r.quality as MediaQuality),
        })),
        roles: ROLES,
        designsCanUse: base !== null,
      },
    };
  });

  app.get("/api/sites/:id/media-library/:mid/file", async (req, reply) => {
    const { id, mid } = midParam.parse(req.params);
    const site = await siteFor(req);
    void id;
    const v = z
      .object({
        v: z.enum(["thumb", "640", "1280", "1920", "logo"]).default("thumb"),
      })
      .parse(req.query).v;
    const r = (
      await sql`SELECT kind, thumb, v640, v1280, v1920, logo_png FROM owner_media WHERE id=${mid} AND site_id=${site.id}`
    )[0];
    if (!r) throw notFound();
    const bytes = (
      v === "thumb"
        ? r.thumb
        : v === "640"
          ? r.v640
          : v === "1280"
            ? r.v1280
            : v === "1920"
              ? r.v1920
              : r.logo_png
    ) as Buffer | null;
    if (!bytes) throw notFound();
    return reply
      .header("content-type", v === "logo" ? "image/png" : "image/webp")
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, max-age=300")
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(bytes);
  });

  app.patch("/api/sites/:id/media-library/:mid", async (req) => {
    const { mid } = midParam.parse(req.params);
    const site = await siteFor(req, "MEMBER");
    const b = z
      .object({
        role: z.enum(ROLES).optional(),
        alt: z.string().trim().max(200).optional(),
        focal: z
          .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
          .optional(),
      })
      .strict()
      .parse(req.body ?? {});
    const cur = (
      await sql`SELECT kind FROM owner_media WHERE id=${mid} AND site_id=${site.id} AND removed_at IS NULL`
    )[0];
    if (!cur) throw notFound();
    if (cur.kind === "logo" && b.role)
      throw new HttpError(422, "logo_role", "A logo does not have a role.");
    if (b.role)
      await sql`UPDATE owner_media SET role=${b.role} WHERE id=${mid}`;
    if (b.alt !== undefined)
      await sql`UPDATE owner_media SET alt=${b.alt} WHERE id=${mid}`;
    if (b.focal)
      await sql`UPDATE owner_media SET focal_x=${b.focal.x}, focal_y=${b.focal.y} WHERE id=${mid}`;
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "media.updated",
      objectType: "owner_media",
      objectId: mid,
      requestId: req.id,
    });
    const row = (
      await sql`SELECT ${COLS} FROM owner_media WHERE id=${mid}`
    )[0]!;
    return {
      data: {
        ...item(row, site.id),
        note: "Websites and creatives you already made keep what they used. New designs will use this change.",
      },
    };
  });

  // "Remove" hides from the library and from FUTURE designs. Versions and artifacts that already used the picture keep
  // working; Kora never rewrites finished work.
  app.delete("/api/sites/:id/media-library/:mid", async (req) => {
    const { mid } = midParam.parse(req.params);
    const site = await siteFor(req, "MEMBER");
    const r =
      await sql`UPDATE owner_media SET removed_at=now() WHERE id=${mid} AND site_id=${site.id} AND removed_at IS NULL RETURNING id`;
    if (r.length === 0) throw notFound();
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "media.removed",
      objectType: "owner_media",
      objectId: mid,
      requestId: req.id,
    });
    return {
      data: {
        removed: true,
        note: "Removed from your library. Anything already published keeps what it used.",
      },
    };
  });

  // Public, content-addressed delivery for published sites. The URL carries the picture's own hash, so it cannot be
  // guessed, never changes meaning, and can be cached forever.
  app.get("/api/public/sites/:sid/m/:sha/:file", async (req, reply) => {
    const { sid, sha, file } = z
      .object({
        sid: z.string().uuid(),
        sha: z.string().regex(/^[a-f0-9]{64}$/),
        file: z.enum([
          "w640.webp",
          "w1280.webp",
          "w1920.webp",
          "logo.png",
          "thumb.webp",
        ]),
      })
      .parse(req.params);
    const col = {
      "w640.webp": "v640",
      "w1280.webp": "v1280",
      "w1920.webp": "v1920",
      "logo.png": "logo_png",
      "thumb.webp": "thumb",
    }[file];
    const r = (
      await sql`SELECT v640, v1280, v1920, logo_png, thumb FROM owner_media WHERE site_id=${sid} AND sha256=${sha} AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.id=${sid} AND s.deleted_at IS NOT NULL) ORDER BY created_at DESC LIMIT 1`
    )[0];
    const bytes = r ? (r[col] as Buffer | null) : null;
    if (!bytes) throw notFound();
    return reply
      .header(
        "content-type",
        file.endsWith(".png") ? "image/png" : "image/webp",
      )
      .header("x-content-type-options", "nosniff")
      .header("cross-origin-resource-policy", "cross-origin")
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(bytes);
  });
}

/** Plain-language advice for the owner; never technical. */
export function advice(q: MediaQuality): string[] {
  const out: string[] = [];
  if (q.flags.includes("LOW_RESOLUTION"))
    out.push(
      "This picture is small. It will work in smaller spots, but a larger photo would look sharper at the top of your site.",
    );
  if (q.flags.includes("BLURRY"))
    out.push(
      "This picture looks soft or out of focus, so Kora will not use it as your main picture.",
    );
  if (q.flags.includes("TOO_DARK"))
    out.push(
      "This picture is quite dark. A brighter version would show your work better.",
    );
  if (q.flags.includes("TOO_BRIGHT"))
    out.push("This picture is very bright and may look washed out.");
  if (q.orientation === "portrait")
    out.push(
      "Tall pictures work best in smaller spots; a wider photo suits the top of your site.",
    );
  if (out.length === 0) out.push("Good picture. Kora can use it prominently.");
  return out;
}
