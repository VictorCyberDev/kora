import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

// Rumpty's public Postgres endpoint requires TLS and uses a per-database
// self-signed certificate; its documented URL ends in ?sslmode=require.
describe("postgres driver and sslmode", () => {
  const url = (query: string) =>
    `postgresql://user:pass@db.example.invalid:5432/main_db${query}`;
  it("turns ?sslmode=require into the driver's TLS 'require' mode", async () => {
    const sql = postgres(url("?sslmode=require"));
    expect(sql.options.ssl).toBe("require");
    await sql.end({ timeout: 0 });
  });
  it("uses no TLS when sslmode is absent", async () => {
    const sql = postgres(url(""));
    expect(sql.options.ssl).toBe(false);
    await sql.end({ timeout: 0 });
  });
  it("keeps strict verification for sslmode=verify-full", async () => {
    const sql = postgres(url("?sslmode=verify-full"));
    expect(sql.options.ssl).toBe("verify-full");
    await sql.end({ timeout: 0 });
  });
});

// Manual check against any TLS-enabled PostgreSQL (for example the Rumpty
// public endpoint). Skipped unless KORA_TLS_DATABASE_URL is set; it only runs
// a read-only SELECT. See docs/runbooks/rumpty-deploy.md.
const tlsUrl = process.env.KORA_TLS_DATABASE_URL;
const tlsSql = tlsUrl ? postgres(tlsUrl, { max: 1 }) : null;
afterAll(async () => {
  if (tlsSql) await tlsSql.end();
});
describe.skipIf(!tlsUrl)("live TLS connection", () => {
  it("is encrypted with sslmode=require", async () => {
    expect(new URL(tlsUrl!).searchParams.get("sslmode")).toBe("require");
    const [row] =
      await tlsSql!`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
    expect(row!.ssl).toBe(true);
  });
});
