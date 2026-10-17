import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalize, hash, diagnosisHashInput } from "./index.js";

interface Vector {
  kind: "value" | "snapshot" | "evidence";
  value?: unknown;
  snapshot?: Record<string, unknown>;
  hashInput?: unknown;
  name?: string;
  hash: string;
}
const file = JSON.parse(
  readFileSync(
    new URL("../test-fixtures/golden-vectors.json", import.meta.url),
    "utf8",
  ),
) as { vectors: Vector[] };

// The vectors were produced by the original deterministicHash() and
// buildDiagnosticSnapshot() in apps/api/src/diagnosis.ts. The same file is
// asserted against that legacy code in apps/api, so both implementations are
// pinned to identical bytes.
describe("golden vectors from the existing diagnosis implementation", () => {
  it("has vectors of every kind", () => {
    const kinds = new Set(file.vectors.map((v) => v.kind));
    expect([...kinds].sort()).toEqual(["evidence", "snapshot", "value"]);
    expect(file.vectors.length).toBeGreaterThan(40);
  });
  it.each(file.vectors.filter((v) => v.kind !== "snapshot"))(
    "hash() reproduces $kind $name vector",
    (v) => {
      expect(hash(v.value)).toBe(v.hash);
    },
  );
  it.each(file.vectors.filter((v) => v.kind === "snapshot"))(
    "hash(diagnosisHashInput()) reproduces the contentHash of snapshot $name",
    (v) => {
      expect(hash(diagnosisHashInput(v.snapshot!))).toBe(v.hash);
      // The input is exactly the snapshot minus createdAt and contentHash.
      expect(diagnosisHashInput(v.snapshot!)).toEqual(v.hashInput);
    },
  );
});

describe("canonicalize", () => {
  it("sorts keys, keeps array order, emits no whitespace", () => {
    expect(canonicalize({ b: [2, 1], a: { d: null, c: "x" } })).toBe(
      '{"a":{"c":"x","d":null},"b":[2,1]}',
    );
  });
  it("is independent of key insertion order", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
  it("refuses values that have no canonical JSON form", () => {
    for (const bad of [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      10n,
      () => 1,
      Symbol("s"),
      new Date(0),
      new Map(),
      { a: undefined },
      [undefined],
      Object.create({ inherited: 1 }) as object,
    ])
      expect(() => canonicalize(bad), String(bad)).toThrow(TypeError);
  });
  it("refuses cycles", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalize(a)).toThrow(TypeError);
  });
});
