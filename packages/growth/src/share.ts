/** M23: read-only share links. A signed, expiring token that grants one view of one report and nothing else. */
import { createHmac, timingSafeEqual } from "node:crypto";

const b64 = (b: Buffer) => b.toString("base64url");

export function signShare(
  secret: string,
  p: { kind: "audit" | "report"; id: string; expiresAt: number },
): string {
  const body = b64(Buffer.from(JSON.stringify(p)));
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

export function verifyShare(
  secret: string,
  token: string,
  now: number,
):
  | { ok: true; kind: "audit" | "report"; id: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" } {
  const [body, sig] = token.split(".");
  if (!body || !sig || token.split(".").length !== 2)
    return { ok: false, reason: "malformed" };
  const want = createHmac("sha256", secret).update(body).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (got.length !== want.length || !timingSafeEqual(got, want))
    return { ok: false, reason: "bad_signature" };
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      kind: "audit" | "report";
      id: string;
      expiresAt: number;
    };
    if (typeof p.expiresAt !== "number" || p.expiresAt <= now)
      return { ok: false, reason: "expired" };
    if (p.kind !== "audit" && p.kind !== "report")
      return { ok: false, reason: "malformed" };
    return { ok: true, kind: p.kind, id: p.id };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
