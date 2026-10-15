/**
 * Destructive PostgreSQL tests (e.g. `DELETE FROM incidents`) must only ever
 * run against a database whose actual name ends in `_test`. The name is taken
 * from the parsed URL pathname, never from substring matching the raw URL.
 */
export function assertTestDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) return;
  let name: string;
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    throw new Error(
      "Refusing to run tests: DATABASE_URL is not a parseable URL. Use a database whose name ends in _test.",
    );
  }
  if (!name.endsWith("_test"))
    throw new Error(
      `Refusing to run destructive tests against database "${name}". The database name must end in "_test" (e.g. kora_test).`,
    );
}
