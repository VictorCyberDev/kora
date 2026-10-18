import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildApi } from "./app.js";
import { deterministicHash } from "./diagnosis.js";
import type { KoraStore } from "./store.js";

describe("GET /incidents/:id/passport (no database)", () => {
  it("returns 400 for an invalid UUID without touching the store", async () => {
    const untouchable = new Proxy(
      {},
      {
        get: (_t, prop) => {
          throw new Error(`store.${String(prop)} must not be used`);
        },
      },
    ) as unknown as KoraStore;
    const app = buildApi(untouchable, "test");
    for (const id of ["not-a-uuid", "123", "00000000-0000-0000-0000"]) {
      const r = await app.inject(`/incidents/${id}/passport`);
      expect(r.statusCode, id).toBe(400);
      expect(r.json<{ error: string }>().error).toBe("invalid_request");
    }
    await app.close();
  });

  it("returns 404 for a well-formed id that is not an incident", async () => {
    const store = {
      getIncident: () => Promise.resolve(null),
    } as unknown as KoraStore;
    const app = buildApi(store, "test");
    const r = await app.inject(`/incidents/${crypto.randomUUID()}/passport`);
    expect(r.statusCode).toBe(404);
    expect(r.json<{ error: string }>().error).toBe("not_found");
    await app.close();
  });
});

// The same vectors are asserted against @kora/passport. Both implementations
// therefore produce identical bytes, which is what lets the offline verifier
// check what this API exports.
describe("existing deterministicHash is pinned to the golden vectors", () => {
  const file = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/passport/test-fixtures/golden-vectors.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    vectors: Array<{
      kind: string;
      value?: unknown;
      hashInput?: unknown;
      hash: string;
    }>;
  };
  it("reproduces every vector", () => {
    expect(file.vectors.length).toBeGreaterThan(40);
    for (const v of file.vectors)
      expect(
        deterministicHash(v.kind === "snapshot" ? v.hashInput : v.value),
      ).toBe(v.hash);
  });
});
