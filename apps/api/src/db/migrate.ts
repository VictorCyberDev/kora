import postgres from "postgres";
import { loadConfig } from "../config.js";
import { applyMigrations } from "./apply-migrations.js";

const config = loadConfig();
const sql = postgres(config.DATABASE_URL, { max: 1 });

try {
  await applyMigrations(sql, (name) => console.log(`Applied ${name}`));
} finally {
  await sql.end();
}
