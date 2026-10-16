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
