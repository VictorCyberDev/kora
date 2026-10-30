import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

/** scrypt, self-describing: `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: 128 * N * R * 2,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newSessionToken = () => randomBytes(32).toString("base64url");

export const SESSION_COOKIE = "kora_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export function serializeSessionCookie(
  token: string,
  secure: boolean,
  maxAge = SESSION_TTL_SECONDS,
): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return part.slice(i + 1).trim() || null;
  }
  return null;
}

/** Fixed-window in-memory limiter. One per process; sufficient for one API node. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}
  /** Returns true when the call is allowed. */
  take(key: string): boolean {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /rmp_[A-Za-z0-9_-]{8,}/g,
  /sk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /(api[_-]?key|secret|token|password|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;}]{4,}/gi,
  /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/gi,
];
/** Removes secret-shaped substrings from text bound for logs, events or APIs. */
export function redactSecrets(text: string): string {
  let out = text;
  out = out.replace(SECRET_PATTERNS[5]!, "postgres://[REDACTED]@");
  for (const re of SECRET_PATTERNS.slice(0, 4)) out = out.replace(re, "[REDACTED]");
  out = out.replace(SECRET_PATTERNS[4]!, "$1$2[REDACTED]");
  return out;
}
