import { describe, expect, it } from "vitest";
import { loadConfig, resolveClaimUrl } from "./config.js";
describe("configuration", () => {
  it("rejects missing critical database configuration", () =>
    expect(() => loadConfig({})).toThrow());
  it("rejects invalid thresholds", () =>
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://u:p@localhost/db",
        MONITOR_FAILURE_THRESHOLD: "0",
      }),
    ).toThrow());
  describe("listen port (API_PORT, then PORT, then 3000)", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };
    it("defaults to 3000", () => expect(loadConfig(base).API_PORT).toBe(3000));
    it("falls back to the platform-injected PORT", () =>
      expect(loadConfig({ ...base, PORT: "8080" }).API_PORT).toBe(8080));
    it("API_PORT wins over PORT", () =>
      expect(
        loadConfig({ ...base, API_PORT: "4000", PORT: "8080" }).API_PORT,
      ).toBe(4000));
    it("treats an empty API_PORT as unset", () =>
      expect(loadConfig({ ...base, API_PORT: "", PORT: "8080" }).API_PORT).toBe(
        8080,
      ));
    it("still rejects an invalid port", () => {
      expect(() => loadConfig({ ...base, PORT: "abc" })).toThrow();
      expect(() => loadConfig({ ...base, PORT: "70000" })).toThrow();
    });
    it("binds all interfaces by default", () =>
      expect(loadConfig(base).API_HOST).toBe("0.0.0.0"));
  });
  it("accepts a Rumpty public database URL with sslmode=require", () => {
    const url =
      "postgresql://user:pass@db.example.rumpty.invalid:5432/main_db?sslmode=require";
    expect(loadConfig({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });
  describe("deployment verification settings", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };
    it("are all optional and default sensibly", () => {
      const c = loadConfig(base);
      expect(c.GITHUB_REPO).toBeUndefined();
      expect(c.GITHUB_BRANCH).toBe("main");
      expect(c.GITHUB_API_URL).toBe("https://api.github.com");
      expect(c.GITHUB_TOKEN).toBeUndefined();
    });
    it("accepts owner/name and a branch", () => {
      const c = loadConfig({
        ...base,
        GITHUB_REPO: "VictorCyberDev/kora",
        GITHUB_BRANCH: "release/1.x",
      });
      expect(c.GITHUB_REPO).toBe("VictorCyberDev/kora");
      expect(c.GITHUB_BRANCH).toBe("release/1.x");
    });
    it.each(["kora", "a/b/c", "owner/", "/name", "ow ner/name", "o/n?x=1"])(
      "rejects GITHUB_REPO %j",
      (GITHUB_REPO) =>
        expect(() => loadConfig({ ...base, GITHUB_REPO })).toThrow(),
    );
    it("rejects a non-URL GITHUB_API_URL and MONITOR_CLAIM_URL", () => {
      expect(() => loadConfig({ ...base, GITHUB_API_URL: "nope" })).toThrow();
      expect(() =>
        loadConfig({ ...base, MONITOR_CLAIM_URL: "nope" }),
      ).toThrow();
    });
    it("keeps the token readable but out of enumeration and JSON", () => {
      const c = loadConfig({ ...base, GITHUB_TOKEN: "ghp_secret_value" });
      expect(c.GITHUB_TOKEN).toBe("ghp_secret_value");
      expect(Object.keys(c)).not.toContain("GITHUB_TOKEN");
      expect(JSON.stringify(c)).not.toContain("ghp_secret_value");
      expect(JSON.stringify({ ...c })).not.toContain("ghp_secret_value");
    });
    it("never puts the token in a validation error", () => {
      let message = "";
      try {
        loadConfig({
          ...base,
          GITHUB_REPO: "not a repo",
          GITHUB_TOKEN: "ghp_secret_value",
        });
      } catch (e) {
        message = String(e) + JSON.stringify(e);
      }
      expect(message).not.toBe("");
      expect(message).not.toContain("ghp_secret_value");
    });
    it("checks every 5 minutes by default (GitHub rate limits) and is tunable", () => {
      expect(loadConfig(base).VERIFICATION_INTERVAL_MS).toBe(300_000);
      expect(
        loadConfig({ ...base, VERIFICATION_INTERVAL_MS: "60000" })
          .VERIFICATION_INTERVAL_MS,
      ).toBe(60_000);
      expect(() =>
        loadConfig({ ...base, VERIFICATION_INTERVAL_MS: "10" }),
      ).toThrow();
    });
    it("treats an empty token as unset", () =>
      expect(
        loadConfig({ ...base, GITHUB_TOKEN: "" }).GITHUB_TOKEN,
      ).toBeUndefined());
  });
  describe("resolveClaimUrl", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };
    it("defaults to the health URL's origin plus /__kora", () => {
      expect(
        resolveClaimUrl(
          loadConfig({
            ...base,
            MONITOR_HEALTH_URL: "https://demo.example.com:8443/some/health?x=1",
          }),
        ),
      ).toBe("https://demo.example.com:8443/__kora");
      expect(resolveClaimUrl(loadConfig(base))).toBe(
        "http://localhost:3100/__kora",
      );
    });
    it("uses MONITOR_CLAIM_URL when set", () =>
      expect(
        resolveClaimUrl(
          loadConfig({ ...base, MONITOR_CLAIM_URL: "http://other.test/claim" }),
        ),
      ).toBe("http://other.test/claim"));
  });
});
