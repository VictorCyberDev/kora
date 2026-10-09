import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
const config = loadConfig();
const sql = postgres(config.DATABASE_URL, { max: 1 });
const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));
try {
  const files = (await readdir(migrationsDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const migration = await readFile(join(dirname(join(migrationsDir, file)), file), "utf8");
    await sql.unsafe(migration);
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
