import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
afterAll(async () => {
  if (sql) await sql.end();
});

describe.skipIf(!databaseUrl)("test database isolation", () => {
  it("every test file starts from an empty database", async () => {
    // Diagnostic snapshots are immutable and cannot be cleaned by DELETE or
    // TRUNCATE, so isolation must come from a fresh database, not row cleanup.
    for (const table of [
      "services",
      "telemetry_observations",
      "incidents",
      "incident_evidence",
      "domain_events",
      "provider_resources",
      "diagnostic_snapshots",
    ]) {
      const [row] = await sql!.unsafe(
        `SELECT count(*)::int AS n FROM ${table}`,
      );
      expect(row!.n, `${table} must be empty at start`).toBe(0);
    }
  });
});
