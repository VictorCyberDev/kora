import type { FastifyInstance } from "fastify";
import {
  finalizeForPublish,
  type SiteFiles,
  type SiteSpec,
} from "@kora/site-schema";
import type { OpsStore } from "./ops-store.js";
import type { PlatformStore } from "./store.js";
import type { SitePublisher } from "./publisher.js";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
export const contentType = (path: string) =>
  TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream";

/** Resolves a request sub-path to a file in an artifact; null when absent. */
export function resolveArtifactPath(
  files: SiteFiles,
  subPath: string,
): { path: string } | { redirect: string } | null {
  const clean = subPath.replace(/^\/+/, "");
  if (clean.includes("..") || clean.includes("\0")) return null;
  if (clean === "") return { path: "index.html" };
  if (files[clean]) return { path: clean };
  if (clean.endsWith("/") && files[`${clean}index.html`])
    return { path: `${clean}index.html` };
  if (!clean.endsWith("/") && files[`${clean}/index.html`])
    return { redirect: `${clean}/` };
  return null;
}

export function sendArtifact(
  reply: import("fastify").FastifyReply,
  files: SiteFiles,
  subPath: string,
  basePath: string,
  extra: Record<string, string> = {},
) {
  const hit = resolveArtifactPath(files, subPath);
  if (!hit) return reply.code(404).type("text/plain").send("Not found");
  if ("redirect" in hit)
    return reply.redirect(`${basePath}${hit.redirect}`, 301);
  return reply
    .header("content-type", contentType(hit.path))
    .header("x-content-type-options", "nosniff")
    .header("referrer-policy", "strict-origin-when-cross-origin")
    .header("cache-control", "no-cache")
    .headers(extra)
    .send(files[hit.path]);
}

/**
 * Serves each site's published version at /s/:slug/ straight from the database.
 * A controlled test (when enabled) makes the faulty version fail for real:
 * the monitor observes an actual HTTP 500 or a response that outlasts its timeout.
 */
export function registerHosting(
  app: FastifyInstance,
  d: {
    platform: PlatformStore;
    ops: OpsStore;
    publisher: SitePublisher;
    chaosDelayMs: number;
  },
) {
  const cache = new Map<string, SiteFiles>();
  app.get("/s/:slug", (req, reply) =>
    reply.redirect(`${req.url.split("?")[0]}/`, 301),
  );
  app.get("/s/:slug/*", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const sub = (req.params as Record<string, string>)["*"] ?? "";
    const site = await d.platform.getSiteBySlug(slug);
    if (
      !site ||
      site.status !== "PUBLISHED" ||
      !site.publishedVersionId ||
      d.publisher.name !== "kora-hosted"
    )
      return reply.code(404).type("text/plain").send("Not found");
    const fault = await d.ops.getFault(site.id);
    if (fault && fault.versionId === site.publishedVersionId) {
      if (fault.mode === "timeout")
        await new Promise((r) => setTimeout(r, d.chaosDelayMs));
      return reply.code(500).type("text/plain").send("Controlled test failure");
    }
    let files = cache.get(site.publishedVersionId);
    if (!files) {
      const row = await d.platform.getVersionRow(
        site.id,
        site.publishedVersionId,
      );
      if (!row) return reply.code(404).type("text/plain").send("Not found");
      files = finalizeForPublish(
        row.artifact as SiteFiles,
        row.spec as SiteSpec,
        d.publisher.publicUrlFor(slug),
      );
      if (cache.size > 200) cache.clear();
      cache.set(site.publishedVersionId, files);
    }
    return sendArtifact(reply, files, sub, `/s/${slug}/`);
  });
}
