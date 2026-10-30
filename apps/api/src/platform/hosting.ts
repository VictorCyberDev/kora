import type { FastifyInstance } from "fastify";
import { finalizeForPublish, type SiteSpec } from "@kora/site-schema";
import { FONT_CACHE_CONTROL, readFontFile } from "@kora/site-fonts";
import { MEDIA_CACHE_CONTROL, readMediaFile } from "@kora/site-media";
import { serveArtifact, type SiteFiles } from "@kora/site-serving";
import type { OpsStore } from "./ops-store.js";
import type { PlatformStore } from "./store.js";
import type { SitePublisher } from "./publisher.js";

export { contentType, resolveArtifactPath } from "@kora/site-serving";

export function sendArtifact(
  reply: import("fastify").FastifyReply,
  files: SiteFiles,
  subPath: string,
  basePath: string,
  extra: Record<string, string> = {},
  ifNoneMatch?: string,
) {
  const r = serveArtifact(files, subPath, basePath, ifNoneMatch);
  return reply
    .code(r.status)
    .headers({ ...r.headers, ...extra })
    .send(r.body);
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
  app.get("/_kora/fonts/:file", async (req, reply) => {
    const data = await readFontFile((req.params as { file: string }).file);
    if (!data) return reply.code(404).type("text/plain").send("Not found");
    return reply
      .header("cache-control", FONT_CACHE_CONTROL)
      .header("access-control-allow-origin", "*")
      .type("font/woff2")
      .send(data);
  });
  app.get("/_kora/media/:file", async (req, reply) => {
    const data = await readMediaFile((req.params as { file: string }).file);
    if (!data) return reply.code(404).type("text/plain").send("Not found");
    return reply
      .header("cache-control", MEDIA_CACHE_CONTROL)
      .type("image/webp")
      .send(data);
  });
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
