import { CHANNEL_MATRIX, type ChannelProvider } from "@kora/growth";
import type { PlatformConfig } from "../platform/config.js";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string | null;
  scopes: string[];
}
export interface AccountInfo {
  externalId: string;
  name: string;
}
export type CheckResult =
  { ok: true } | { ok: false; httpStatus: number; code?: string };

/**
 * What every provider adapter implements. Capability methods beyond connect/refresh/check are added by the
 * milestone that needs them (publishing, messaging, analytics); each stays optional so a provider that cannot do
 * something is simply missing the method rather than faking it.
 */
export interface ProviderAdapter {
  provider: ChannelProvider;
  mode: "LIVE" | "SANDBOX";
  scopes: string[];
  authorizeUrl(p: { state: string; redirectUri: string }): string;
  exchange(p: {
    code: string;
    redirectUri: string;
    /** Provider-specific account the owner says they are connecting (e.g. a WhatsApp phone number id). */
    externalAccountId?: string;
  }): Promise<{ tokens: TokenSet; account: AccountInfo }>;
  refresh(tokens: TokenSet): Promise<TokenSet>;
  check(tokens: TokenSet): Promise<CheckResult>;
  /**
   * Optional: only providers Kora can really post to implement it. A missing method is how the engine knows a
   * provider is handoff-only; nothing pretends to post.
   */
  publish?(tokens: TokenSet, post: PublishInput): Promise<PublishResult>;
}
export interface PublishInput {
  text: string;
  media: { bytes: Buffer; mime: string } | null;
  /** Stable per (item, channel); providers that support it should use it to deduplicate. */
  idempotencyKey: string;
}
export interface PublishResult {
  externalId: string;
  url: string | null;
}

type Fetch = typeof fetch;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;
interface OAuthSpec {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdParam?: string;
  extraAuth?: Record<string, string>;
  accountUrl: string;
  accountFrom: (j: Record<string, unknown>) => AccountInfo | null;
  creds: (c: PlatformConfig) => { id: string; secret: string } | null;
}

const META = {
  authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
  accountUrl: "https://graph.facebook.com/v21.0/me?fields=id,name",
  accountFrom: (j: Record<string, unknown>) =>
    typeof j.id === "string"
      ? { externalId: j.id, name: str(j.name) ?? j.id }
      : null,
  creds: (c: PlatformConfig) =>
    c.META_APP_ID && c.META_APP_SECRET
      ? { id: c.META_APP_ID, secret: c.META_APP_SECRET }
      : null,
};
const GOOGLE = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  extraAuth: { access_type: "offline", prompt: "consent" },
  accountUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  accountFrom: (j: Record<string, unknown>) =>
    typeof j.id === "string"
      ? { externalId: j.id, name: str(j.email) ?? str(j.name) ?? j.id }
      : null,
  creds: (c: PlatformConfig) =>
    c.GOOGLE_OAUTH_CLIENT_ID && c.GOOGLE_OAUTH_CLIENT_SECRET
      ? { id: c.GOOGLE_OAUTH_CLIENT_ID, secret: c.GOOGLE_OAUTH_CLIENT_SECRET }
      : null,
};

const SPECS: Partial<Record<ChannelProvider, OAuthSpec>> = {
  instagram: {
    ...META,
    scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "pages_show_list",
    ],
  },
  facebook: {
    ...META,
    scopes: [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "read_insights",
    ],
  },
  whatsapp: {
    ...META,
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
  },
  google_business: {
    ...GOOGLE,
    scopes: ["https://www.googleapis.com/auth/business.manage"],
  },
  search_console: {
    ...GOOGLE,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  },
  tiktok: {
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdParam: "client_key",
    scopes: ["user.info.basic", "video.upload"],
    accountUrl:
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
    accountFrom: (j) => {
      const u = (
        j.data as
          { user?: { open_id?: string; display_name?: string } } | undefined
      )?.user;
      return u?.open_id
        ? { externalId: u.open_id, name: u.display_name ?? u.open_id }
        : null;
    },
    creds: (c) =>
      c.TIKTOK_CLIENT_KEY && c.TIKTOK_CLIENT_SECRET
        ? { id: c.TIKTOK_CLIENT_KEY, secret: c.TIKTOK_CLIENT_SECRET }
        : null,
  },
};

class ProviderError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

/** A real OAuth 2.0 adapter driven by data. Only runs when the deployment holds the provider's credentials. */
class OAuthAdapter implements ProviderAdapter {
  mode = "LIVE" as const;
  scopes: string[];
  constructor(
    readonly provider: ChannelProvider,
    private readonly s: OAuthSpec,
    private readonly creds: { id: string; secret: string },
    private readonly f: Fetch,
  ) {
    this.scopes = s.scopes;
  }
  authorizeUrl(p: { state: string; redirectUri: string }) {
    const u = new URL(this.s.authUrl);
    u.searchParams.set(this.s.clientIdParam ?? "client_id", this.creds.id);
    u.searchParams.set("redirect_uri", p.redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set(
      "scope",
      this.s.scopes.join(this.provider === "tiktok" ? "," : " "),
    );
    u.searchParams.set("state", p.state);
    for (const [k, v] of Object.entries(this.s.extraAuth ?? {}))
      u.searchParams.set(k, v);
    return u.toString();
  }
  private async token(params: Record<string, string>): Promise<TokenSet> {
    const body = new URLSearchParams({
      [this.s.clientIdParam ?? "client_id"]: this.creds.id,
      client_secret: this.creds.secret,
      ...params,
    });
    const r = await this.f(this.s.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || typeof j.access_token !== "string")
      throw new ProviderError(
        r.status,
        "The provider did not accept the sign-in.",
      );
    const secs = typeof j.expires_in === "number" ? j.expires_in : null;
    return {
      accessToken: j.access_token,
      ...(typeof j.refresh_token === "string"
        ? { refreshToken: j.refresh_token }
        : {}),
      expiresAt: secs ? new Date(Date.now() + secs * 1000).toISOString() : null,
      scopes:
        typeof j.scope === "string"
          ? j.scope.split(/[ ,]/).filter(Boolean)
          : this.s.scopes,
    };
  }
  async exchange(p: {
    code: string;
    redirectUri: string;
    externalAccountId?: string;
  }) {
    const tokens = await this.token({
      grant_type: "authorization_code",
      code: p.code,
      redirect_uri: p.redirectUri,
    });
    const r = await this.f(this.s.accountUrl, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    let account = r.ok ? this.s.accountFrom(j) : null;
    if (!account)
      throw new ProviderError(
        r.status,
        "Could not read the connected account.",
      );
    if (this.provider === "whatsapp" && p.externalAccountId) {
      // Webhooks are routed by this id, so the signed-in user must prove they can read that exact number.
      if (!/^\d{5,30}$/.test(p.externalAccountId))
        throw new ProviderError(
          400,
          "That is not a valid WhatsApp phone number ID.",
        );
      const v = await this.f(
        `https://graph.facebook.com/v21.0/${p.externalAccountId}?fields=display_phone_number,verified_name`,
        { headers: { authorization: `Bearer ${tokens.accessToken}` } },
      );
      const vj = (await v.json().catch(() => ({}))) as Record<string, unknown>;
      if (!v.ok)
        throw new ProviderError(
          403,
          "Your account does not have access to that WhatsApp number.",
        );
      account = {
        externalId: p.externalAccountId,
        name:
          str(vj.verified_name) ??
          str(vj.display_phone_number) ??
          p.externalAccountId,
      };
    }
    return { tokens, account };
  }
  async refresh(t: TokenSet) {
    if (!t.refreshToken) {
      // Meta long-lived tokens are renewed by exchanging the current one.
      return this.token({
        grant_type: "fb_exchange_token",
        fb_exchange_token: t.accessToken,
      });
    }
    const next = await this.token({
      grant_type: "refresh_token",
      refresh_token: t.refreshToken,
    });
    return { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
  }
  async check(t: TokenSet): Promise<CheckResult> {
    try {
      const r = await this.f(this.s.accountUrl, {
        headers: { authorization: `Bearer ${t.accessToken}` },
      });
      return r.ok ? { ok: true } : { ok: false, httpStatus: r.status };
    } catch {
      return { ok: false, httpStatus: 503 };
    }
  }
}

/** Test and demo provider. It never talks to a network and is unavailable in production. */
class SandboxAdapter implements ProviderAdapter {
  mode = "SANDBOX" as const;
  scopes: string[];
  constructor(readonly provider: ChannelProvider) {
    this.scopes = SPECS[provider]?.scopes ?? [];
  }
  authorizeUrl(p: { state: string; redirectUri: string }) {
    return `${p.redirectUri}?code=sandbox&state=${encodeURIComponent(p.state)}`;
  }
  exchange(p: { code: string; externalAccountId?: string }) {
    if (p.code !== "sandbox")
      return Promise.reject(new ProviderError(400, "Invalid sandbox code."));
    return Promise.resolve({
      tokens: {
        accessToken: "sandbox-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        scopes: this.scopes,
      },
      account: {
        externalId:
          p.externalAccountId ??
          `sandbox-${this.provider}-${crypto.randomUUID().slice(0, 8)}`,
        name: `Sandbox ${CHANNEL_MATRIX[this.provider].label}`,
      },
    });
  }
  refresh(t: TokenSet) {
    return Promise.resolve({
      ...t,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }
  check(): Promise<CheckResult> {
    return Promise.resolve({ ok: true });
  }
  /** Test double. `[sandbox-fail:NNN]` in the text simulates a provider error with that HTTP status. */
  publish(_t: TokenSet, post: PublishInput): Promise<PublishResult> {
    const m = /\[sandbox-fail:(\d{3}|net)\]/.exec(post.text);
    if (m)
      return Promise.reject(
        m[1] === "net"
          ? new ProviderError(0, "network")
          : new ProviderError(Number(m[1]), "sandbox failure"),
      );
    const id = `sandbox-${this.provider}-${post.idempotencyKey.slice(0, 12)}`;
    return Promise.resolve({ externalId: id, url: null });
  }
}

export class ProviderRegistry {
  constructor(
    private readonly config: PlatformConfig,
    private readonly f: Fetch = fetch,
  ) {}
  /** Null when this deployment cannot connect the provider. */
  adapter(provider: ChannelProvider): ProviderAdapter | null {
    if (CHANNEL_MATRIX[provider].availability === "planned") return null;
    if (this.config.KORA_SANDBOX_CHANNELS) return new SandboxAdapter(provider);
    const s = SPECS[provider];
    const creds = s?.creds(this.config);
    if (!s || !creds || !this.config.KORA_SECRETS_KEY) return null;
    return new OAuthAdapter(provider, s, creds, this.f);
  }
  /** Environment names visible to runtimeStatus; never values. */
  env(): Record<string, string | undefined> {
    const c = this.config;
    return {
      META_APP_ID: c.META_APP_ID,
      META_APP_SECRET: c.META_APP_SECRET,
      WHATSAPP_VERIFY_TOKEN: c.WHATSAPP_VERIFY_TOKEN,
      GOOGLE_OAUTH_CLIENT_ID: c.GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET: c.GOOGLE_OAUTH_CLIENT_SECRET,
      TIKTOK_CLIENT_KEY: c.TIKTOK_CLIENT_KEY,
      TIKTOK_CLIENT_SECRET: c.TIKTOK_CLIENT_SECRET,
      LINKEDIN_CLIENT_ID: c.LINKEDIN_CLIENT_ID,
      LINKEDIN_CLIENT_SECRET: c.LINKEDIN_CLIENT_SECRET,
    };
  }
  sandbox(): boolean {
    return this.config.KORA_SANDBOX_CHANNELS;
  }
}
export { ProviderError };
