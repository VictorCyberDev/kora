import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  designBriefSchema,
  planDirections,
  renderSiteV2,
} from "@kora/site-schema";
import type { BillingService } from "./billing.js";
import { HttpError, notFound, requireOrgRole, requireUser } from "./http.js";
import { sendArtifact } from "./hosting.js";
import type { PlatformStore } from "./store.js";

const uuid = z.string().uuid();

/**
 * Lets owners compare three real rendered directions before a Site row exists.
 * This avoids abandoned draft sites consuming plan quota when a user only wants
 * to explore directions or when generation later fails.
 */
export function registerBriefDirectionRoutes(
  app: FastifyInstance,
  d: { platform: PlatformStore; billing: BillingService },
) {
  const held = new Map<
    string,
    { userId: string; expires: number; files: Record<string, string>[] }
  >();

  app.post("/api/design/directions", async (req) => {
    const user = requireUser(req);
    const body = z
      .object({
        orgId: uuid,
        name: designBriefSchema.shape.name,
        description: designBriefSchema.shape.description,
        goal: designBriefSchema.shape.goal.optional(),
        feel: designBriefSchema.shape.feel.optional(),
        location: designBriefSchema.shape.location.optional(),
        whatsapp: designBriefSchema.shape.whatsapp.optional(),
        email: designBriefSchema.shape.email.optional(),
        phone: designBriefSchema.shape.phone.optional(),
      })
      .parse(req.body ?? {});

    requireOrgRole(req, body.orgId, "MEMBER");
    const { entitlements } = await d.billing.entitlements(body.orgId);
    if (!entitlements.canGenerate)
      throw new HttpError(
        402,
        "plan_restriction",
        entitlements.restrictedReason ??
          "Your current plan cannot generate new designs right now.",
      );

    const brief = designBriefSchema.parse(body);
    const planned = planDirections(brief);
    const token = randomBytes(16).toString("hex");

    for (const [key, value] of held)
      if (value.expires < Date.now()) held.delete(key);
    if (held.size >= 200) held.delete(held.keys().next().value!);

    held.set(token, {
      userId: user.userId,
      expires: Date.now() + 30 * 60_000,
      files: planned.map((direction) => {
        const files = renderSiteV2(direction.spec);
        files["index.html"] = files["index.html"]!.replace(
          /<form[\s\S]*?<\/form>/g,
          "",
        );
        return files;
      }),
    });

    return {
      data: planned.map((direction) => ({
        index: direction.index,
        name: direction.name,
        summary: direction.summary,
        look: direction.look,
        palette: direction.palette,
        swatches: [
          direction.spec.design.palette.background,
          direction.spec.design.palette.primary,
          direction.spec.design.palette.accent,
          direction.spec.design.palette.surfaceMuted,
        ],
        fontPairing: direction.spec.design.typography.pairing,
        previewUrl: `/api/design/brief-previews/${token}/${direction.index}/`,
      })),
    };
  });

  app.get("/api/design/brief-previews/:token/:index/*", async (req, reply) => {
    const { token, index } = z
      .object({
        token: z.string().regex(/^[a-f0-9]{32}$/),
        index: z.coerce.number().int().min(0).max(2),
      })
      .parse(req.params);
    const item = held.get(token);
    if (
      !item ||
      item.userId !== requireUser(req).userId ||
      item.expires < Date.now()
    )
      throw notFound();

    return sendArtifact(
      reply,
      item.files[index]!,
      (req.params as Record<string, string>)["*"] ?? "",
      `/api/design/brief-previews/${token}/${index}/`,
      { "x-frame-options": "SAMEORIGIN" },
    );
  });
}
