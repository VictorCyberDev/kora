import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type postgres from "postgres";
import { llmFromEnv, type LlmClient } from "@kora/reasoner";
import type { KoraConfig } from "../config.js";
import { KoraStore } from "../store.js";
import { SiteAuthor } from "./author.js";
import { loadPlatformConfig, type PlatformConfig } from "./config.js";
import { registerHosting } from "./hosting.js";
import { HttpError, ROLE_RANK, requireOrgRole } from "./http.js";
import { Operations } from "./operations.js";
import { OpsStore } from "./ops-store.js";
import {
  KoraHostedPublisher,
  RumptyBucketPublisher,
  type SitePublisher,
} from "./publisher.js";
import { registerRoutes } from "./routes.js";
import { SESSION_COOKIE, readCookie, sha256Hex } from "./security.js";
import { PublishService, SiteMonitors } from "./services.js";
import { PlatformStore } from "./store.js";

export interface PlatformRuntime {
  platform: PlatformStore;
  ops: OpsStore;
  kora: KoraStore;
  operations: Operations;
  publishing: PublishService;
  monitors: SiteMonitors;
  publisher: SitePublisher;
  author: SiteAuthor;
  config: PlatformConfig;
  llm: LlmClient | null;
  extensions: Array<(app: FastifyInstance) => void>;
  startBackground(): Promise<void>;
  stop(): Promise<void>;
}

export interface CreatePlatformOptions {
  sql: postgres.Sql;
  kora: KoraStore;
  koraConfig: KoraConfig;
  config?: PlatformConfig;
  publisher?: SitePublisher;
  llm?: LlmClient | null;
  log: FastifyBaseLogger;
  /** Start site monitors on their own schedule. Tests drive them explicitly. */
  autostartMonitors?: boolean;
  now?: () => Date;
}

export function choosePublisher(
  config: PlatformConfig,
  koraConfig: KoraConfig,
  port: number,
): SitePublisher {
  if (
    config.RUMPTY_API_KEY &&
    config.RUMPTY_SITE_BUCKET &&
    config.RUMPTY_SITE_PUBLIC_BASE_URL &&
    koraConfig.RUMPTY_WORKSPACE
  )
    return new RumptyBucketPublisher({
      apiKey: config.RUMPTY_API_KEY,
      workspace: koraConfig.RUMPTY_WORKSPACE,
      bucket: config.RUMPTY_SITE_BUCKET,
      publicBaseUrl: config.RUMPTY_SITE_PUBLIC_BASE_URL,
      region: config.RUMPTY_SITE_REGION,
    });
  return new KoraHostedPublisher(
    config.KORA_PUBLIC_URL ?? `http://127.0.0.1:${port}`,
    koraConfig.KORA_ENVIRONMENT,
  );
}

export function createPlatform(o: CreatePlatformOptions): PlatformRuntime {
  const config = o.config ?? loadPlatformConfig();
  const platform = new PlatformStore(o.sql);
  const ops = new OpsStore(o.sql);
  const publisher =
    o.publisher ?? choosePublisher(config, o.koraConfig, o.koraConfig.API_PORT);
  const llm = o.llm === undefined ? llmFromEnv(config) : o.llm;
  const monitors = new SiteMonitors({
    kora: o.kora,
    ops,
    koraConfig: o.koraConfig,
    log: o.log,
    autostart: o.autostartMonitors ?? true,
  });
  const publishing = new PublishService({
    kora: o.kora,
    platform,
    ops,
    publisher,
    monitors,
    environment: o.koraConfig.KORA_ENVIRONMENT,
    log: o.log,
    monitorBase:
      config.KORA_MONITOR_BASE_URL ??
      config.KORA_PUBLIC_URL ??
      `http://127.0.0.1:${o.koraConfig.API_PORT}`,
  });
  const operations = new Operations({
    kora: o.kora,
    platform,
    ops,
    monitors,
    publishing,
    publisher,
    llm,
    config,
    koraConfig: o.koraConfig,
    log: o.log,
    ...(o.now ? { now: o.now } : {}),
  });
  monitors.onEffect = async (siteId, _serviceId, effect) => {
    if (effect.type === "incident_created")
      await operations.onIncidentCreated(siteId, effect.incident.id);
    if (effect.type === "recovery_verified")
      await operations.onRecovered(siteId, effect.incident.id);
  };
  let timer: NodeJS.Timeout | undefined;
  return {
    platform,
    ops,
    kora: o.kora,
    operations,
    publishing,
    monitors,
    publisher,
    author: new SiteAuthor(llm),
    config,
    llm,
    extensions: [],
    async startBackground() {
      for (const site of await platform.listPublishedSites()) {
        const resource = publisher.resourceFor(site);
        const url = publishing.monitorUrlFor(
          site.slug,
          publisher.publicUrlFor(site.slug),
        );
        const { serviceId, resourceId } = await monitors.bind(
          site,
          resource,
          o.koraConfig.KORA_ENVIRONMENT,
          publisher.publicUrlFor(site.slug),
          url,
        );
        monitors.start(site, serviceId, resourceId, url);
      }
      timer = setInterval(
        () =>
          void operations
            .verifyPending()
            .catch((err) => o.log.error({ err }, "verification loop failed")),
        config.ACTION_VERIFICATION_TICK_MS,
      );
    },
    async stop() {
      if (timer) clearInterval(timer);
      await monitors.stopAll();
    },
  };
}

const API_LIKE = /^\/(api|s|incidents|services|ui|health|__kora)(\/|$)/;
const WEB_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
export const defaultWebDir = () =>
  process.env.KORA_WEB_DIR ??
  fileURLToPath(new URL("../../../web/dist", import.meta.url));
const APP_CSP =
  "default-src 'self'; img-src 'self' data: https:; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'; form-action 'self'";

export function registerPlatform(
  app: FastifyInstance,
  rt: PlatformRuntime,
  options: { webDir?: string } = {},
) {
  const { platform, config } = rt;
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req) => {
    req.auth = null;
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token)
      req.auth = (await platform.findSession(sha256Hex(token))) ?? null;
    const path = req.url.split("?")[0] ?? "/";
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    const publicEndpoint =
      path.startsWith("/api/public/") ||
      path.startsWith("/api/billing/webhook");
    if (mutating && !publicEndpoint) {
      const origin = req.headers.origin;
      if (
        origin &&
        req.headers.host &&
        new URL(origin).host !== req.headers.host
      )
        throw new HttpError(
          403,
          "bad_origin",
          "Cross-origin requests are not allowed.",
        );
      if (
        path.startsWith("/api/") &&
        req.headers["x-requested-with"] !== "kora"
      )
        throw new HttpError(
          403,
          "csrf_check_failed",
          "Missing request marker.",
        );
    }
    // The original evidence routes stay public only where the operator allows it (demo mode).
    if (
      /^\/(incidents|services|ui)(\/|$)/.test(path) &&
      !config.KORA_LEGACY_PUBLIC_API
    ) {
      const m = /^\/(incidents|services)\/([0-9a-f-]{36})(\/|$)/.exec(path);
      if (!req.auth) throw new HttpError(401, "unauthenticated");
      if (!m) throw new HttpError(404, "not_found");
      const [, kind, id] = m;
      const rows =
        kind === "incidents"
          ? await platform.sql`SELECT s.org_id FROM incidents i JOIN services s ON s.id=i.service_id WHERE i.id=${id!}`
          : await platform.sql`SELECT org_id FROM services WHERE id=${id!}`;
      const orgId = rows[0]?.org_id as string | null | undefined;
      if (!orgId) throw new HttpError(404, "not_found");
      requireOrgRole(req, orgId, mutating ? "MEMBER" : "VIEWER");
    }
  });

  registerRoutes(app, {
    platform,
    ops: rt.ops,
    operations: rt.operations,
    publishing: rt.publishing,
    publisher: rt.publisher,
    author: rt.author,
    config,
  });
  registerHosting(app, {
    platform,
    ops: rt.ops,
    publisher: rt.publisher,
    chaosDelayMs: 10_000,
  });
  for (const extension of rt.extensions) extension(app);

  const webDir = resolve(options.webDir ?? defaultWebDir());
  app.setNotFoundHandler(async (req, reply) => {
    const path = (req.url.split("?")[0] ?? "/") || "/";
    if (req.method === "GET" && !API_LIKE.test(path)) {
      const rel = normalize(decodeURIComponent(path)).replace(/^[/\\]+/, "");
      const file = resolve(join(webDir, rel));
      const inside = file === webDir || file.startsWith(webDir + sep);
      const ext = extname(rel);
      try {
        if (inside && ext && WEB_TYPES[ext]) {
          const body = await readFile(file);
          return reply
            .header("content-type", WEB_TYPES[ext])
            .header(
              "cache-control",
              path.startsWith("/assets/")
                ? "public, max-age=31536000, immutable"
                : "no-cache",
            )
            .header("x-content-type-options", "nosniff")
            .send(body);
        }
        if (!ext) {
          const html = await readFile(join(webDir, "index.html"));
          return reply
            .header("content-type", WEB_TYPES[".html"]!)
            .header("cache-control", "no-cache")
            .header("content-security-policy", APP_CSP)
            .header("x-content-type-options", "nosniff")
            .header("referrer-policy", "same-origin")
            .send(html);
        }
      } catch {
        /* fall through to 404 */
      }
    }
    return reply.code(404).send({ error: "not_found", requestId: req.id });
  });
}
void ROLE_RANK;
