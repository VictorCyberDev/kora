import { describe, expect, it } from "vitest";
import {
  RateLimiter,
  hashPassword,
  readCookie,
  redactSecrets,
  serializeSessionCookie,
  verifyPassword,
} from "./security.js";

describe("password hashing", () => {
  it("round-trips, salts, and rejects the wrong password or a malformed hash", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterz", a)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$a$b")).toBe(false);
  });
});

describe("session cookie", () => {
  it("is HttpOnly + SameSite, and Secure when asked", () => {
    expect(serializeSessionCookie("t", true)).toMatch(
      /HttpOnly.*SameSite=Lax.*Max-Age=\d+.*Secure|Secure/,
    );
    expect(serializeSessionCookie("t", false)).not.toMatch(/Secure/);
    expect(serializeSessionCookie("", false, 0)).toContain("Max-Age=0");
  });
  it("parses only the named cookie", () => {
    expect(readCookie("a=1; kora_session=abc; b=2", "kora_session")).toBe(
      "abc",
    );
    expect(readCookie("xkora_session=abc", "kora_session")).toBeNull();
    expect(readCookie(undefined, "kora_session")).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows the limit then blocks until the window passes", () => {
    let t = 0;
    const rl = new RateLimiter(2, 1000, () => t);
    expect([rl.take("k"), rl.take("k"), rl.take("k")]).toEqual([
      true,
      true,
      false,
    ]);
    expect(rl.take("other")).toBe(true);
    t = 1001;
    expect(rl.take("k")).toBe(true);
  });
});

describe("secret redaction", () => {
  const samples = [
    "rmp_abcdefghijklmnop1234",
    "sk_live_abcdef123456",
    "sk_test_abcdef123456",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "Bearer abcdefghijklmnop.qrstuv",
    "api_key=supersecretvalue",
    'password: "hunter2hunter2"',
    "authorization=abc123def456",
  ];
  it("removes every common secret shape", () => {
    for (const s of samples) {
      const out = redactSecrets(`error talking to provider: ${s} (retrying)`);
      expect(out, s).toContain("[REDACTED]");
      expect(out, s).not.toMatch(
        /abcdefghijklmnop1234|abcdef123456|hunter2hunter2|supersecretvalue|abc123def456|qrstuv/,
      );
    }
  });
  it("redacts database URL credentials but keeps the host for diagnosis", () => {
    const out = redactSecrets(
      "connect postgres://kora:p4ssw0rd@db.internal:5432/kora failed",
    );
    expect(out).not.toContain("p4ssw0rd");
    expect(out).toContain("db.internal");
  });
  it("leaves ordinary text alone", () => {
    expect(redactSecrets("HTTP 503 from /health after 2000ms")).toBe(
      "HTTP 503 from /health after 2000ms",
    );
  });
});
