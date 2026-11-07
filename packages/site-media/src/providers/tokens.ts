import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Self-contained, signed tokens. A token carries the facts it vouches for, so verification needs no server-side memory:
 * any API instance holding the same key can verify what another instance issued. Expiry and the organisation and site
 * it was issued for are part of the signed payload.
 */
const b64 = (b: Buffer) => b.toString("base64url");

export function signToken(
  payload: Record<string, unknown>,
  key: Buffer,
): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", key).update(`v1.${body}`).digest());
  return `v1.${body}.${sig}`;
}

export type TokenResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: "malformed" | "signature" | "expired" };

export function verifyToken<T extends { exp: number }>(
  token: string,
  key: Buffer,
  now: number,
): TokenResult<T> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || token.length > 6000)
    return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", key).update(`v1.${parts[1]}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(parts[2]!, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return { ok: false, reason: "signature" };
  let payload: T;
  try {
    payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    ) as T;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.exp !== "number" || payload.exp < now)
    return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/** Derives the media signing key from the deployment secret, so the secret itself is never used directly. */
export function deriveMediaKey(secretBase64: string): Buffer | null {
  let raw: Buffer;
  try {
    raw = Buffer.from(secretBase64, "base64");
  } catch {
    return null;
  }
  if (raw.length < 16) return null;
  return createHmac("sha256", raw).update("kora-media-token/v1").digest();
}

/** What a placed picture claims about itself. A token vouches for exactly this and nothing else. */
export function mediaFingerprint(m: {
  url: string;
  provenance?:
    | {
        provider?: string | undefined;
        providerImageId?: string | undefined;
        creatorName?: string | undefined;
        creatorUrl?: string | undefined;
        providerUrl?: string | undefined;
        attribution?: string | undefined;
        license?: string | undefined;
      }
    | undefined;
}): string {
  const p = m.provenance ?? {};
  return createHash("sha256")
    .update(
      JSON.stringify([
        m.url,
        p.provider ?? "",
        p.providerImageId ?? "",
        p.creatorName ?? "",
        p.creatorUrl ?? "",
        p.providerUrl ?? "",
        p.attribution ?? "",
        p.license ?? "",
      ]),
    )
    .digest("hex");
}
