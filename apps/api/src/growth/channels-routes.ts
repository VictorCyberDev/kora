import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CAPABILITIES,
  CHANNEL_MATRIX,
  CHANNEL_PROVIDERS,
  deriveConnectionState,
  runtimeStatus,
  type ChannelProvider,
} from "@kora/growth";
import {
  HttpError,
  notFound,
  requireOrgRole,
  requireUser,
  type Role,
} from "../platform/http.js";
import type { PlatformStore } from "../platform/store.js";
import type { BillingService } from "../platform/billing.js";
import type { PlatformConfig } from "../platform/config.js";
import { RateLimiter } from "../platform/security.js";
import type { ChannelsStore } from "./channels-store.js";
import type { CustomersStore } from "./customers-store.js";
import { requireFeature } from "./entitlements.js";
import {
  ProviderError,
  type ProviderRegistry,
  type TokenSet,
} from "./providers.js";
import type { SecretBox } from "./secrets.js";

export interface ChannelDeps {
  platform: PlatformStore;
  billing: BillingService;
  channels: ChannelsStore;
  customers: CustomersStore;
  providers: ProviderRegistry;
  secrets: SecretBox | null;
  config: PlatformConfig;
  now?: () => Date;
}

const siteParam = z.object({ id: z.string().uuid() });
const providerParam = z.object({
  id: z.string().uuid(),
  provider: z.enum(CHANNEL_PROVIDERS),
});

export function registerChannelRoutes(app: FastifyInstance, d: ChannelDeps) {
  const { platform, billing, channels, providers, secrets, config } = d;
  const now = d.now ?? (() => new Date());
  const hookLimiter = new RateLimiter(300, 60_000);
  const siteFor = async (
    req: FastifyRequest,
    id: string,
    min: Role = "VIEWER",
  ) => {
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const redirectUri = () =>
    `${(config.KORA_PUBLIC_URL ?? "http://127.0.0.1").replace(/\/+$/, "")}/api/oauth/callback`;
  const tokensOf = async (siteId: string, provider: ChannelProvider) => {
    const sealed = await channels.sealedToken(siteId, provider);
    if (!sealed || !secrets) return null;
    try {
      return secrets.open<TokenSet>(sealed);
    } catch {
      return null;
    }
  };

  app.get("/api/sites/:id/channels", async (req) => {
    const site = await siteFor(req, siteParam.parse(req.params).id);
    const conns = await channels.list(site.id);
    const env = providers.env();
    return {
      data: {
        sandbox: providers.sandbox(),
        channels: CHANNEL_PROVIDERS.map((p) => {
          const spec = CHANNEL_MATRIX[p];
          const c =
            conns.find((x) => x.provider === p && x.state !== "DISCONNECTED") ??
            null;
          const rt = runtimeStatus(p, env);
          const available = providers.adapter(p) !== null;
          return {
            provider: p,
            label: spec.label,
            availability: spec.availability,
            capabilities: Object.fromEntries(
              CAPABILITIES.map((k) => [k, spec.capabilities[k]]),
            ),
            notes: spec.notes,
            platformApproval: spec.platformApproval,
            // What this deployment is able to do: names of missing settings only, never values.
            runtime:
              providers.sandbox() && spec.availability === "available"
                ? { state: "SANDBOX", missing: [] as string[] }
                : { ...rt, state: available ? rt.state : "NOT_CONFIGURED" },
            connection: c && {
              state: c.state,
              mode: c.mode,
              accountName: c.accountName,
              tokenExpiresAt: c.tokenExpiresAt,
              lastCheckedAt: c.lastCheckedAt,
              lastError: c.lastError,
            },
          };
        }),
      },
    };
  });

  app.post("/api/sites/:id/channels/:provider/connect", async (req) => {
    const { id, provider } = providerParam.parse(req.params);
    const site = await siteFor(req, id, "ADMIN");
    await requireFeature(billing, site.orgId, "channels.connect");
    const body = z
      .object({
        externalAccountId: z
          .string()
          .regex(/^\d{5,30}$/)
          .optional(),
      })
      .strict()
      .parse(req.body ?? {});
    const adapter = providers.adapter(provider);
    if (!adapter) {
      const rt = runtimeStatus(provider, providers.env());
      throw new HttpError(
        409,
        "not_configured",
        CHANNEL_MATRIX[provider].availability === "planned"
          ? `${CHANNEL_MATRIX[provider].label} is not available yet.`
          : `${CHANNEL_MATRIX[provider].label} is not set up on this Kora yet. Missing: ${[...rt.missing, ...(config.KORA_SECRETS_KEY ? [] : ["KORA_SECRETS_KEY"])].join(", ")}.`,
      );
    }
    const a = requireUser(req);
    const state = await channels.createState({
      siteId: site.id,
      orgId: site.orgId,
      userId: a.userId,
      provider,
    });
    // The WhatsApp phone number the owner names rides in the state row's provider field-free path: it is re-sent at callback.
    const url = adapter.authorizeUrl({
      state: body.externalAccountId
        ? `${state}.${body.externalAccountId}`
        : state,
      redirectUri: redirectUri(),
    });
    return { data: { authorizeUrl: url } };
  });

  /** Where providers send the browser back. Everything is decided by the single-use, user-bound state. */
  app.get("/api/oauth/callback", async (req, reply) => {
    const q = z
      .object({
        state: z.string().max(200),
        code: z.string().max(2000).optional(),
        error: z.string().max(200).optional(),
      })
      .parse(req.query);
    const user = requireUser(req);
    const [rawState, extraId] = q.state.split(".");
    const st = rawState ? await channels.consumeState(rawState) : null;
    if (!st || st.userId !== user.userId)
      throw new HttpError(
        400,
        "invalid_state",
        "This sign-in link expired or is not yours. Start again from Channels.",
      );
    requireOrgRole(req, st.orgId, "ADMIN");
    const back = `/app/sites/${st.siteId}/channels`;
    if (q.error || !q.code)
      return reply.redirect(
        `${back}?problem=${encodeURIComponent("The provider did not grant access.")}`,
      );
    const adapter = providers.adapter(st.provider);
    if (!adapter || !secrets)
      return reply.redirect(
        `${back}?problem=${encodeURIComponent("This channel is not set up on this Kora.")}`,
      );
    try {
      const ex = await adapter.exchange({
        code: q.code,
        redirectUri: redirectUri(),
        ...(extraId ? { externalAccountId: extraId } : {}),
      });
      const taken = await channels.byExternalAccount(
        st.provider,
        ex.account.externalId,
      );
      if (taken && taken.siteId !== st.siteId)
        throw new ProviderError(
          409,
          "That account is already connected to another Kora business.",
        );
      const rec = await channels.upsert({
        siteId: st.siteId,
        orgId: st.orgId,
        provider: st.provider,
        state: deriveConnectionState({
          tokenExpiresAt: ex.tokens.expiresAt
            ? new Date(ex.tokens.expiresAt)
            : null,
          lastCall: null,
          grantedScopes: ex.tokens.scopes,
          requiredScopes:
            adapter.mode === "SANDBOX" ? [] : adapter.scopes.slice(0, 1),
          now: now(),
          revoked: false,
        }),
        mode: adapter.mode,
        externalAccountId: ex.account.externalId,
        accountName: ex.account.name,
        scopes: ex.tokens.scopes,
        sealedToken: secrets.seal(ex.tokens),
        tokenExpiresAt: ex.tokens.expiresAt,
        userId: user.userId,
      });
      await platform.audit({
        orgId: st.orgId,
        actorUserId: user.userId,
        action: "channel.connected",
        objectType: "channel_connection",
        objectId: rec.id,
        requestId: req.id,
        metadata: { provider: st.provider, mode: adapter.mode },
      });
      return reply.redirect(`${back}?connected=${st.provider}`);
    } catch (e) {
      const msg =
        e instanceof ProviderError
          ? e.message
          : "Could not finish connecting. Please try again.";
      return reply.redirect(`${back}?problem=${encodeURIComponent(msg)}`);
    }
  });

  app.post("/api/sites/:id/channels/:provider/disconnect", async (req) => {
    const { id, provider } = providerParam.parse(req.params);
    const site = await siteFor(req, id, "ADMIN");
    if (!(await channels.disconnect(site.id, provider))) throw notFound();
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "channel.disconnected",
      objectType: "channel_connection",
      objectId: site.id,
      requestId: req.id,
      metadata: { provider },
    });
    return { data: { provider, state: "DISCONNECTED" } };
  });

  /** Refreshes a token that is close to expiry, probes the provider and records the resulting state. */
  app.post("/api/sites/:id/channels/:provider/check", async (req) => {
    const { id, provider } = providerParam.parse(req.params);
    const site = await siteFor(req, id, "MEMBER");
    const conn = await channels.get(site.id, provider);
    if (!conn || conn.state === "DISCONNECTED") throw notFound();
    const adapter = providers.adapter(provider);
    let tokens = await tokensOf(site.id, provider);
    if (!adapter || !tokens || !secrets) {
      await channels.setHealth(site.id, provider, {
        state: "DEGRADED",
        lastError: "This channel is not set up on this Kora.",
      });
      return { data: { state: "DEGRADED" } };
    }
    let sealed: string | undefined;
    let expiresAt: string | null | undefined;
    if (
      tokens.expiresAt &&
      new Date(tokens.expiresAt).getTime() - now().getTime() < 24 * 3_600_000
    ) {
      try {
        tokens = await adapter.refresh(tokens);
        sealed = secrets.seal(tokens);
        expiresAt = tokens.expiresAt;
      } catch {
        /* the probe below reports what the provider thinks */
      }
    }
    const call = await adapter.check(tokens);
    const state = deriveConnectionState({
      tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
      lastCall: call,
      grantedScopes: tokens.scopes,
      requiredScopes:
        adapter.mode === "SANDBOX" ? [] : adapter.scopes.slice(0, 1),
      now: now(),
      revoked: false,
    });
    await channels.setHealth(site.id, provider, {
      state,
      lastError: call.ok ? null : `Provider answered ${call.httpStatus}`,
      ...(sealed ? { sealedToken: sealed } : {}),
      ...(expiresAt !== undefined ? { tokenExpiresAt: expiresAt } : {}),
    });
    return { data: { state } };
  });

  // ---- WhatsApp Business webhook ------------------------------------------
  // Raw body is needed to verify Meta's signature, so this scope owns its JSON parser.
  void app.register((scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (
        _r: FastifyRequest,
        body: string,
        done: (e: Error | null, v?: unknown) => void,
      ) => done(null, body),
    );
    scope.get("/api/webhooks/whatsapp", (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const token = config.WHATSAPP_VERIFY_TOKEN;
      if (!token)
        throw new HttpError(503, "not_configured", "WhatsApp is not set up.");
      const a = Buffer.from(q["hub.verify_token"] ?? "");
      const b = Buffer.from(token);
      if (
        q["hub.mode"] === "subscribe" &&
        a.length === b.length &&
        timingSafeEqual(a, b)
      )
        return reply.type("text/plain").send(q["hub.challenge"] ?? "");
      throw new HttpError(403, "forbidden");
    });
    scope.post(
      "/api/webhooks/whatsapp",
      { bodyLimit: 256 * 1024 },
      async (req, reply) => {
        if (!hookLimiter.take(`wa:${req.ip}`))
          throw new HttpError(429, "rate_limited");
        const secret = config.META_APP_SECRET;
        if (!secret)
          throw new HttpError(503, "not_configured", "WhatsApp is not set up.");
        const raw = typeof req.body === "string" ? req.body : "";
        const sig = String(req.headers["x-hub-signature-256"] ?? "");
        const want = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
        if (
          sig.length !== want.length ||
          !timingSafeEqual(Buffer.from(sig), Buffer.from(want))
        )
          throw new HttpError(401, "bad_signature");
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          throw new HttpError(400, "bad_json");
        }
        const out = await ingestWhatsApp(payload, d);
        return reply.code(200).send({ data: out });
      },
    );
    return Promise.resolve();
  });
}

const waSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string().optional(),
                  profile: z.object({ name: z.string().optional() }).optional(),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  timestamp: z.string().optional(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

/** Persists each message once, maps it to the owning business through the phone number id, and creates or updates the lead. */
export async function ingestWhatsApp(
  payload: unknown,
  d: Pick<ChannelDeps, "channels" | "customers">,
) {
  const parsed = waSchema.safeParse(payload);
  if (!parsed.success) return { received: 0, created: 0, ignored: 0 };
  let received = 0,
    created = 0,
    ignored = 0;
  for (const e of parsed.data.entry)
    for (const ch of e.changes) {
      const pid = ch.value.metadata?.phone_number_id;
      for (const m of ch.value.messages ?? []) {
        received++;
        const conn = pid
          ? await d.channels.byExternalAccount("whatsapp", pid)
          : null;
        const evId = await d.channels.recordWebhook({
          provider: "whatsapp",
          eventId: m.id,
          payload: m,
          orgId: conn?.orgId ?? null,
          siteId: conn?.siteId ?? null,
        });
        if (!evId) {
          ignored++;
          continue;
        }
        if (!conn || conn.state === "DISCONNECTED") {
          await d.channels.finishWebhook(
            evId,
            "IGNORED",
            "No business owns this phone number id",
          );
          ignored++;
          continue;
        }
        const name =
          ch.value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ??
          "";
        const body =
          m.type === "text" && m.text
            ? m.text.body
            : `(${m.type} message — open WhatsApp to view)`;
        const at = m.timestamp
          ? new Date(Number(m.timestamp) * 1000)
          : new Date();
        const r = await d.customers.ingest({
          siteId: conn.siteId,
          orgId: conn.orgId,
          source: "WHATSAPP",
          sourceRef: `wa:${m.from}`,
          channel: "whatsapp",
          name,
          phone: `+${m.from}`,
          summary: body.slice(0, 200),
          body,
          externalId: m.id,
          at,
        });
        if (r.created) created++;
        await d.channels.finishWebhook(evId, "PROCESSED");
      }
    }
  return { received, created, ignored };
}
