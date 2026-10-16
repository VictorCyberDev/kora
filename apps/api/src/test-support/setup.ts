import { afterAll } from "vitest";
import { createIsolatedDatabase } from "./isolated-database.js";
import { assertTestDatabase } from "./test-database.js";

// Each test file gets its own freshly migrated database on the configured
// server; the configured database itself is never written to by tests.
const base = process.env.DATABASE_URL;
assertTestDatabase(base);
if (base) {
  const isolated = await createIsolatedDatabase(base);
  process.env.DATABASE_URL = isolated.url;
  afterAll(isolated.drop);
}
