import type postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migrationsUrl = new URL("./migrations/", import.meta.url);

/** Applies every ordered migration (they are written to be re-runnable). */
export async function applyMigrations(
  sql: postgres.Sql,
  onApplied: (name: string) => void = () => undefined,
) {
  const migrations = (await readdir(fileURLToPath(migrationsUrl)))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const name of migrations) {
    await sql.unsafe(await readFile(new URL(name, migrationsUrl), "utf8"));
    onApplied(name);
  }
}

const MIGRATION_LOCK_KEY = 746_100_001;
/**
 * Applies every migration while holding a PostgreSQL advisory lock, so several
 * processes starting together migrate exactly once and the rest wait. Safe to
 * run on every start because migrations are re-runnable.
 */
export async function migrateWithLock(
  sql: postgres.Sql,
  onApplied: (name: string) => void = () => undefined,
) {
  const conn = await sql.reserve();
  try {
    await conn`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      await applyMigrations(conn, onApplied);
    } finally {
      await conn`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    conn.release();
  }
}
