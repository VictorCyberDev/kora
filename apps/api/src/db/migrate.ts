import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
const config = loadConfig();
const sql = postgres(config.DATABASE_URL, { max: 1 });
const migration = await readFile(
  fileURLToPath(new URL("./migrations/001_initial.sql", import.meta.url)),
  "utf8",
);
try {
  await sql.unsafe(migration);
  console.log("Applied 001_initial.sql");
} finally {
  await sql.end();
}
