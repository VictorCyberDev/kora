import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM envelope for provider tokens: `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export class SecretBox {
  private constructor(private readonly key: Buffer) {}
  static fromEnv(b64: string | undefined): SecretBox | null {
    if (!b64) return null;
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32)
      throw new Error("KORA_SECRETS_KEY must be 32 bytes, base64 encoded");
    return new SecretBox(key);
  }
  seal(plain: unknown): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([
      c.update(JSON.stringify(plain), "utf8"),
      c.final(),
    ]);
    return ["v1", iv, c.getAuthTag(), ct]
      .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
      .join(".");
  }
  open<T>(sealed: string): T {
    const [v, iv, tag, ct] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || !ct)
      throw new Error("unrecognised secret format");
    const d = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64url"),
    );
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        d.update(Buffer.from(ct, "base64url")),
        d.final(),
      ]).toString("utf8"),
    ) as T;
  }
}
