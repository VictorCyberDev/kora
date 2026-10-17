import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyPassport } from "./index.js";

// A real export of GET /incidents/:id/passport from a resolved incident with
// recovery evidence, committed as it left the API (then run through prettier).
// A v1 verifier must keep accepting it, whatever the exporter does later.
const path = new URL("../test-fixtures/example.passport.json", import.meta.url);
const text = readFileSync(path, "utf8");
// Re-verifies the file once per character (~15k hashes). About 4s alone and far
// more when the suite runs in parallel, so it gets an explicit generous timeout
// rather than fewer positions.
const SLOW = 60_000;

describe("committed real export", () => {
  it("verifies", () => {
    const result = verifyPassport(JSON.parse(text));
    expect(result.reason).toBe("all hashes match");
    expect(result.ok).toBe(true);
  });

  it("has the documented content", () => {
    const p = JSON.parse(text) as Record<string, unknown>;
    expect(p.schema).toBe("kora.incident-passport/v1");
    expect((p.evidence as unknown[]).length).toBeGreaterThanOrEqual(5);
    expect((p.gaps as unknown[]).length).toBeGreaterThan(3);
    expect((p.incident as { state: string }).state).toBe("RESOLVED");
  });

  it(
    "fails when any single character is changed, except inside generatedAt",
    () => {
      const marker = '"generatedAt": "';
      const start = text.indexOf(marker) + marker.length;
      const survivors: number[] = [];
      for (let i = 0; i < text.length; i++) {
        if (i >= start && i < start + 24) continue;
        const mutated =
          text.slice(0, i) + (text[i] === "x" ? "y" : "x") + text.slice(i + 1);
        let ok = false;
        try {
          ok = verifyPassport(JSON.parse(mutated)).ok;
        } catch {
          ok = false;
        }
        if (ok) survivors.push(i);
      }
      expect(text.length).toBeGreaterThan(5000);
      expect(survivors).toEqual([]);
    },
    SLOW,
  );

  it("is stable across a JSON round trip with fractional numbers", () => {
    const p = JSON.parse(text) as Record<string, unknown>;
    const again = JSON.parse(JSON.stringify(p)) as unknown;
    expect(verifyPassport(again).ok).toBe(true);
    const timeline = p.timeline as Array<{ payload: Record<string, unknown> }>;
    const created = timeline.find((t) => "latencySeconds" in t.payload);
    expect(created?.payload.latencySeconds).toBe(12.345678901234567);
  });
});
