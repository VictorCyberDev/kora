import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { KoraStore } from "../store.js";
import { sha } from "../test-support/fake-servers.js";
import type { ScmHeadObservation } from "./scm.js";

// The per-file database (test-support/setup.ts) is fresh and ends in _test.
const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const store = sql ? new KoraStore(sql) : null;
afterAll(async () => {
  if (sql) await sql.end();
});

const observation = (over: Partial<ScmHeadObservation> = {}) =>
  ({
    kind: "scm_head",
    outcome: "OBSERVED",
    observedAt: "2026-03-04T10:00:00.000Z",
    sourceUrl: "http://127.0.0.1:1/repos/a/b/git/ref/heads/main",
    httpStatus: 200,
    reason: null,
    sha: sha(3),
    ...over,
  }) satisfies ScmHeadObservation;

async function recorded() {
  const service = await store!.ensureService(
    `append-only-${crypto.randomUUID()}`,
    "http://127.0.0.1:1/health",
  );
  const checkId = await store!.recordVerificationCheck(String(service.id), [
    observation(),
  ]);
  return { serviceId: String(service.id), checkId };
}
const count = async (checkId: string) =>
  (
    await sql!`SELECT count(*)::int n FROM verification_observations WHERE check_id=${checkId}`
  )[0]!.n as number;

describe.skipIf(!databaseUrl)(
  "verification_observations is append-only",
  () => {
    it("still accepts INSERT", async () => {
      const { serviceId, checkId } = await recorded();
      expect(await count(checkId)).toBe(1);
      await store!.recordVerificationCheck(serviceId, [
        observation({ sha: sha(4) }),
      ]);
      const rows = await sql!`
      SELECT count(*)::int n FROM verification_observations WHERE service_id=${serviceId}`;
      const n = rows[0]!.n as number;
      expect(n).toBe(2);
    });
    it("refuses UPDATE", async () => {
      const { checkId } = await recorded();
      await expect(
        sql!`UPDATE verification_observations SET reason='x', outcome='UNKNOWN', commit_sha=NULL WHERE check_id=${checkId}`,
      ).rejects.toThrow(/append-only.*UPDATE/i);
      await expect(
        sql!`UPDATE verification_observations SET observed_at=now() WHERE check_id=${checkId}`,
      ).rejects.toThrow(/append-only.*UPDATE/i);
    });
    it("refuses DELETE", async () => {
      const { checkId } = await recorded();
      await expect(
        sql!`DELETE FROM verification_observations WHERE check_id=${checkId}`,
      ).rejects.toThrow(/append-only.*DELETE/i);
      expect(await count(checkId)).toBe(1);
    });
    it("refuses TRUNCATE, directly and through its parent", async () => {
      const { checkId } = await recorded();
      await expect(sql!`TRUNCATE verification_observations`).rejects.toThrow(
        /append-only.*TRUNCATE/i,
      );
      await expect(sql!`TRUNCATE services CASCADE`).rejects.toThrow(
        /append-only.*TRUNCATE/i,
      );
      expect(await count(checkId)).toBe(1);
    });
  },
);
