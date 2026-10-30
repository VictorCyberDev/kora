import Fastify from "fastify";
import { createRuntimeClaim } from "@kora/runtime-claim";
import { FONT_CACHE_CONTROL, readFontFile } from "@kora/site-fonts";
import { MEDIA_CACHE_CONTROL, readMediaFile } from "@kora/site-media";
import { finalizeForPublish } from "@kora/site-schema";
import { serveArtifact, type SiteFiles } from "@kora/site-serving";
import { SiteHostStore, type HostedSite } from "./store.js";

export interface SiteHostOptions {
  store: SiteHostStore;
  /** Public base URL of this host; only used for sitemap/robots absolute URLs. */
  publicUrl?: string | undefined;
  /** How long a `timeout` controlled test stalls a response before failing it. */
  faultDelayMs?: number;
  logger?: false | { level: string };
  runtimeClaim?: ReturnType<typeof createRuntimeClaim>;
}

/**
 * Serves published Kora site artifacts and nothing else: no sessions, billing,
 * Reasoner, provider credentials or remediation authority.
 */
export function buildSiteHost(o: SiteHostOptions) {
  const claim =
    o.runtimeClaim ?? createRuntimeClaim({ service: "kora-site-host" });
  const app = Fastify({
    logger: o.logger ?? false,
    // One hop: the platform edge.
    trustProxy: (_address: string, hop: number) => hop < 1,
    bodyLimit: 1024,
  });
  const cache = new Map<string, SiteFiles>();
  const configured = o.publicUrl?.replace(/\/+$/, "");
  // Without configuration, the public origin is whatever the (single trusted) proxy says it is.
  const baseFor = (req: {
    protocol: string;
    headers: { host?: string | undefined };
  }) => configured ?? `${req.protocol}://${req.headers.host ?? "localhost"}`;

  app.get("/health", async () => ({
    status: "ok",
    database: (await o.store.ping()) ? "ok" : "unavailable",
  }));
  app.get("/__kora", (_req, reply) =>
    reply.header("cache-control", "no-store").send(claim.snapshot()),
  );

  async function serve(
    site: HostedSite,
    sub: string,
    basePath: string,
    ifNoneMatch: string | undefined,
    publicBase: string,
  ) {
    const fault = await o.store.activeFault(site.id, site.publishedVersionId);
    if (fault === "timeout")
      await new Promise((r) => setTimeout(r, o.faultDelayMs ?? 10_000));
    if (fault)
      return {
        status: 500 as const,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
        body: "Controlled test failure",
      };
    const key = `${site.publishedVersionId}|${publicBase}`;
    let files = cache.get(key);
    if (!files) {
      const v = await o.store.version(site.id, site.publishedVersionId);
      if (!v)
        return {
          status: 404 as const,
          headers: { "content-type": "text/plain; charset=utf-8" },
          body: "Not found",
        };
      files = finalizeForPublish(v.files, v.spec, publicBase);
      if (cache.size > 100) cache.clear();
      cache.set(key, files);
    }
    return serveArtifact(files, sub, basePath, ifNoneMatch);
  }

  // Bundled, licensed fonts that v2 sites reference by absolute path. Fixed file names only.
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
    const site = await o.store.siteBySlug(slug);
    if (!site) return reply.code(404).type("text/plain").send("Not found");
    const r = await serve(
      site,
      (req.params as Record<string, string>)["*"] ?? "",
      `/s/${slug}/`,
      req.headers["if-none-match"],
      `${baseFor(req)}/s/${slug}/`,
    );
    return reply.code(r.status).headers(r.headers).send(r.body);
  });
  // A connected custom hostname serves its site at the root.
  app.setNotFoundHandler(async (req, reply) => {
    const host = (req.headers.host ?? "").split(":")[0] ?? "";
    if (req.method === "GET" && host) {
      const site = await o.store.siteByHostname(host);
      if (site) {
        const r = await serve(
          site,
          (req.url.split("?")[0] ?? "/").slice(1),
          "/",
          req.headers["if-none-match"],
          `https://${host}/`,
        );
        return reply.code(r.status).headers(r.headers).send(r.body);
      }
    }
    return reply.code(404).type("text/plain").send("Not found");
  });
  return app;
}
