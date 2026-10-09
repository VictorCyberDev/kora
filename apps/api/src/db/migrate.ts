import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";

const config = loadConfig();
const sql = postgres(config.DATABASE_URL, { max: 1 });
const migrationsUrl = new URL("./migrations/", import.meta.url);
const migrationsDir = fileURLToPath(migrationsUrl);

try {
  const migrations = (await readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const name of migrations) {
    const migration = await readFile(new URL(name, migrationsUrl), "utf8");
    await sql.unsafe(migration);
    console.log(`Applied ${name}`);
  }
} finally {
  await sql.end();
}
