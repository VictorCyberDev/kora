import postgres from "postgres";
import { applyMigrations } from "../db/apply-migrations.js";
import { assertTestDatabase } from "./test-database.js";

/**
 * Creates a brand-new, migrated database for one test file on the same server
 * as `baseUrl` and returns its URL and a drop function. The name is derived
 * from the base database but always ends in `_test`, and is re-checked with
 * assertTestDatabase before anything is created or dropped. Immutable
 * snapshots cannot be cleaned by DELETE/TRUNCATE, so isolation is a database.
 */
export async function createIsolatedDatabase(baseUrl: string) {
  assertTestDatabase(baseUrl);
  const base = new URL(baseUrl);
  const baseName = decodeURIComponent(base.pathname.slice(1)).replace(
    /_test$/,
    "",
  );
  const name = `${baseName}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const target = new URL(baseUrl);
  target.pathname = `/${encodeURIComponent(name)}`;
  assertTestDatabase(target.toString());
  const admin = new URL(baseUrl);
  admin.pathname = "/postgres";
  const quoted = `"${name.replaceAll('"', '""')}"`;

  const adminSql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    await adminSql.unsafe(`CREATE DATABASE ${quoted}`);
  } finally {
    await adminSql.end();
  }
  const sql = postgres(target.toString(), { max: 1, onnotice: () => {} });
  try {
    await applyMigrations(sql);
  } finally {
    await sql.end();
  }
  return {
    url: target.toString(),
    name,
    drop: async () => {
      const dropper = postgres(admin.toString(), {
        max: 1,
        onnotice: () => {},
      });
      try {
        await dropper.unsafe(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}
