import { describe, expect, it } from "vitest";
import { loadPlatformConfig } from "../platform/config.js";
import { ProviderError, ProviderRegistry } from "./providers.js";
import { SecretBox } from "./secrets.js";

const key = Buffer.alloc(32, 9).toString("base64");
const cfg = (env: Record<string, string> = {}) =>
  loadPlatformConfig({ NODE_ENV: "test", ...env });

describe("secret box", () => {
  it("round-trips, uses a fresh nonce and rejects tampering", () => {
    const b = SecretBox.fromEnv(key)!;
    const a1 = b.seal({ t: "x" });
    expect(a1).not.toBe(b.seal({ t: "x" }));
    expect(b.open<{ t: string }>(a1).t).toBe("x");
    const parts = a1.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => b.open(parts.join("."))).toThrow();
    expect(SecretBox.fromEnv(undefined)).toBeNull();
    expect(() => SecretBox.fromEnv("c2hvcnQ=")).toThrow(/32 bytes/);
  });
});

describe("provider registry", () => {
  it("has no live adapter without credentials and a key", () => {
    expect(new ProviderRegistry(cfg()).adapter("instagram")).toBeNull();
    expect(
      new ProviderRegistry(
        cfg({ META_APP_ID: "a", META_APP_SECRET: "b" }),
      ).adapter("instagram"),
    ).toBeNull();
    expect(
      new ProviderRegistry(
        cfg({ META_APP_ID: "a", META_APP_SECRET: "b", KORA_SECRETS_KEY: key }),
      ).adapter("instagram")?.mode,
    ).toBe("LIVE");
  });
  it("never offers sandbox providers in production, even when asked", () => {
    const c = loadPlatformConfig({
      NODE_ENV: "production",
      KORA_SANDBOX_CHANNELS: "true",
    });
    expect(c.KORA_SANDBOX_CHANNELS).toBe(false);
    expect(new ProviderRegistry(c).adapter("facebook")).toBeNull();
  });
  it("does not offer planned providers at all", () => {
    expect(
      new ProviderRegistry(cfg({ KORA_SANDBOX_CHANNELS: "true" })).adapter(
        "linkedin",
      ),
    ).toBeNull();
  });
});

describe("live OAuth adapter (fake provider)", () => {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const fake = ((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      auth: new Headers(init?.headers).get("authorization"),
    });
    if (u.includes("oauth/access_token"))
      return Promise.resolve(
        Response.json({ access_token: "AT", expires_in: 3600 }),
      );
    if (u.includes("/me?"))
      return Promise.resolve(Response.json({ id: "42", name: "Mama Ngozi" }));
    if (u.includes("/109900001111"))
      return Promise.resolve(
        Response.json({ verified_name: "Mama Ngozi Kitchen" }),
      );
    if (u.includes("/777"))
      return Promise.resolve(Response.json({ error: "no" }, { status: 403 }));
    return Promise.resolve(Response.json({}, { status: 404 }));
  }) as unknown as typeof fetch;
  const reg = new ProviderRegistry(
    cfg({ META_APP_ID: "app", META_APP_SECRET: "sec", KORA_SECRETS_KEY: key }),
    fake,
  );

  it("builds an authorize URL carrying state and the right scopes", () => {
    const u = new URL(
      reg.adapter("facebook")!.authorizeUrl({
        state: "S",
        redirectUri: "https://k.example/api/oauth/callback",
      }),
    );
    expect(u.searchParams.get("state")).toBe("S");
    expect(u.searchParams.get("client_id")).toBe("app");
    expect(u.searchParams.get("scope")).toContain("pages_manage_posts");
    expect(u.toString()).not.toContain("sec");
  });
  it("exchanges a code for tokens and the connected account", async () => {
    const r = await reg
      .adapter("facebook")!
      .exchange({ code: "c", redirectUri: "https://k.example/cb" });
    expect(r.tokens.accessToken).toBe("AT");
    expect(r.account).toEqual({ externalId: "42", name: "Mama Ngozi" });
  });
  it("only accepts a WhatsApp number the signed-in user can actually read", async () => {
    const ok = await reg.adapter("whatsapp")!.exchange({
      code: "c",
      redirectUri: "x",
      externalAccountId: "109900001111",
    });
    expect(ok.account.externalId).toBe("109900001111");
    await expect(
      reg
        .adapter("whatsapp")!
        .exchange({ code: "c", redirectUri: "x", externalAccountId: "777777" }),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      reg.adapter("whatsapp")!.exchange({
        code: "c",
        redirectUri: "x",
        externalAccountId: "not-a-number",
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
