import { createServer } from "node:net";
import postgres from "postgres";
import type { LlmClient } from "@kora/reasoner";
import { buildApi } from "../app.js";
import { loadConfig } from "../config.js";
import { createPlatform, type PlatformRuntime } from "../platform/index.js";
import { loadPlatformConfig } from "../platform/config.js";
import type { SitePublisher } from "../platform/publisher.js";
import { KoraHostedPublisher } from "../platform/publisher.js";
import { KoraStore } from "../store.js";
import {
  DEVELOPMENT_PLANS,
  type PaymentProvider,
} from "../platform/billing.js";
import type { DnsResolver } from "../platform/domains.js";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export interface Harness {
  base: string;
  runtime: PlatformRuntime;
  sql: postgres.Sql;
  store: KoraStore;
  close(): Promise<void>;
  call(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      cookie?: string | null;
      headers?: Record<string, string>;
    },
  ): Promise<{
    status: number;
    json: any;
    headers: Headers;
    cookie: string | null;
  }>;
  signup(
    email: string,
    orgName?: string,
  ): Promise<{ cookie: string; orgId: string; userId: string }>;
}

export async function startHarness(
  o: {
    env?: Record<string, string>;
    llm?: LlmClient | null;
    publisher?: (base: string) => SitePublisher;
    payments?: PaymentProvider;
    resolver?: DnsResolver;
    domainFetch?: typeof fetch;
    now?: () => Date;
  } = {},
): Promise<Harness> {
  const databaseUrl = process.env.DATABASE_URL!;
  const sql = postgres(databaseUrl, { max: 4, onnotice: () => {} });
  const store = new KoraStore(sql);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const koraConfig = loadConfig({
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    MONITOR_ENABLED: "false",
    MONITOR_FAILURE_THRESHOLD: "2",
    MONITOR_RECOVERY_THRESHOLD: "2",
    MONITOR_TIMEOUT_MS: "1200",
    API_PORT: String(port),
  });
  const config = loadPlatformConfig({
    NODE_ENV: "test",
    KORA_CHAOS_ENABLED: "true",
    KORA_PUBLIC_URL: base,
    ACTION_VERIFICATION_TIMEOUT_MS: "4000",
    ...o.env,
  });
  let runtime!: PlatformRuntime;
  const app = buildApi(store, "test", "silent", {
    createPlatform: (log) =>
      (runtime = createPlatform({
        sql,
        kora: store,
        koraConfig,
        config,
        log,
        autostartMonitors: false,
        ...(o.payments ? { payments: o.payments } : {}),
        ...(o.resolver ? { resolver: o.resolver } : {}),
        ...(o.domainFetch ? { domainFetch: o.domainFetch } : {}),
        ...(o.now ? { now: o.now } : {}),
        llm: o.llm ?? null,
        publisher: o.publisher
          ? o.publisher(base)
          : new KoraHostedPublisher(base, "test"),
      })),
    webDir: "/nonexistent",
  });
  await runtime.billing.seedPlans(DEVELOPMENT_PLANS);
  await app.listen({ host: "127.0.0.1", port });
  const call: Harness["call"] = async (method, path, opts = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(opts.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(path.startsWith("/api/") ? { "x-requested-with": "kora" } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...opts.headers,
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    const setCookie = res.headers.get("set-cookie");
    return {
      status: res.status,
      json,
      headers: res.headers,
      cookie: setCookie ? setCookie.split(";")[0]! : null,
    };
  };
  return {
    base,
    runtime,
    sql,
    store,
    call,
    async signup(email, orgName = "Test Org") {
      const r = await call("POST", "/api/auth/signup", {
        body: {
          email,
          password: "correct horse battery",
          displayName: "Tester",
          orgName,
        },
      });
      if (r.status !== 201)
        throw new Error(`signup failed: ${r.status} ${JSON.stringify(r.json)}`);
      return {
        cookie: r.cookie!,
        orgId: r.json.data.orgs[0].id,
        userId: r.json.data.user.id,
      };
    },
    async close() {
      await runtime.stop();
      await app.close();
      await sql.end();
    },
  };
}
