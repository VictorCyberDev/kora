import { describe, expect, it } from "vitest";
import {
  hash,
  diagnosisHashInput,
  passportHashInput,
  verifyPassport,
} from "./index.js";
import { samplePassport, seal } from "./test-support/sample.js";

type Json = Record<string, unknown>;
const clone = <T>(v: T): T => structuredClone(v);
const failedChecks = (p: unknown) =>
  verifyPassport(p)
    .checks.filter((c) => !c.ok)
    .map((c) => c.name);

describe("verifyPassport", () => {
  it("passes an untouched Passport and reports every check", () => {
    const result = verifyPassport(samplePassport());
    expect(result.ok).toBe(true);
    expect(result.checks.map((c) => c.name)).toEqual([
      "structure",
      "content-hash",
      "evidence-hashes",
      "diagnosis-hash",
      "diagnosis-evidence-hashes",
    ]);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it("also passes after a JSON text round trip", () => {
    const text = JSON.stringify(samplePassport(), null, 4);
    expect(verifyPassport(JSON.parse(text)).ok).toBe(true);
  });

  it("does not cover generatedAt (documented exclusion)", () => {
    const p = samplePassport();
    p.generatedAt = "1999-01-01T00:00:00.000Z";
    expect(verifyPassport(p).ok).toBe(true);
  });

  it("fails when evidence, diagnosis, gaps, timeline or incident change", () => {
    const edits: Array<[string, (p: Json) => void]> = [
      ["evidence", (p) => ((p.evidence as Json[])[0]!.httpStatus = 200)],
      ["evidence removed", (p) => (p.evidence as Json[]).pop()],
      ["diagnosis", (p) => ((p.diagnosis as Json).incidentState = "RESOLVED")],
      [
        "diagnosis evidence",
        (p) => (((p.diagnosis as Json).evidence as Json[])[0]!.healthy = true),
      ],
      ["gaps", (p) => ((p.gaps as Json[])[0]!.reason = "fine")],
      ["gaps removed", (p) => (p.gaps as Json[]).shift()],
      ["timeline", (p) => ((p.timeline as Json[])[0]!.eventType = "X")],
      ["incident", (p) => ((p.incident as Json).state = "RESOLVED")],
      ["added field", (p) => (p.extra = 1)],
      [
        "added __proto__ key",
        (p) =>
          Object.defineProperty(p, "__proto__", { value: 1, enumerable: true }),
      ],
      ["removed field", (p) => delete p.resource],
    ];
    for (const [name, edit] of edits) {
      const p = clone(samplePassport());
      edit(p);
      expect(verifyPassport(p).ok, name).toBe(false);
    }
  });

  it("fails when the hash itself is changed", () => {
    const p = samplePassport();
    const h = (p.integrity as Json).contentHash as string;
    (p.integrity as Json).contentHash = (h[0] === "0" ? "1" : "0") + h.slice(1);
    const result = verifyPassport(p);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/contentHash/);
  });

  it("rejects an unknown schema, algorithm or canonicalization", () => {
    for (const edit of [
      (p: Json) => (p.schema = "kora.incident-passport/v2"),
      (p: Json) => ((p.integrity as Json).algorithm = "md5"),
      (p: Json) => ((p.integrity as Json).canonicalization = "other/v1"),
      (p: Json) => ((p.integrity as Json).contentHash = "ABC"),
      (p: Json) => ((p.integrity as Json).contentHash = undefined),
      (p: Json) => delete p.integrity,
      (p: Json) => (p.evidence = {}),
      (p: Json) => (p.diagnosis = null),
    ]) {
      const p = clone(samplePassport());
      edit(p);
      const result = verifyPassport(p);
      expect(result.ok).toBe(false);
      expect(failedChecks(p)).toContain("structure");
    }
  });

  it("fails inputs that are not a Passport without throwing", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, [samplePassport()]])
      expect(verifyPassport(bad).ok).toBe(false);
  });

  it("attributes the failure to the layer that was changed", () => {
    // Evidence edited, nothing re-hashed: item hash and passport hash fail.
    const a = samplePassport();
    (a.evidence as Json[])[0]!.httpStatus = 200;
    expect(failedChecks(a)).toEqual(["content-hash", "evidence-hashes"]);

    // Diagnosis edited, nothing re-hashed.
    const b = samplePassport();
    (b.diagnosis as Json).incidentState = "RESOLVED";
    expect(failedChecks(b)).toEqual(["content-hash", "diagnosis-hash"]);

    // Diagnosis edited and its own hash recomputed, passport hash left alone.
    const c = samplePassport();
    const d = c.diagnosis as Json;
    d.incidentState = "RESOLVED";
    d.contentHash = hash(diagnosisHashInput(d));
    expect(failedChecks(c)).toEqual(["content-hash"]);

    // Passport hash recomputed over an unfixed snapshot.
    const e = samplePassport();
    (e.diagnosis as Json).incidentState = "RESOLVED";
    (e.integrity as Json).contentHash = hash(passportHashInput(e));
    expect(failedChecks(e)).toEqual(["diagnosis-hash"]);
  });

  it("mutating any single leaf except generatedAt fails verification", () => {
    const base = samplePassport();
    let leaves = 0;
    const walk = (node: unknown, path: Array<string | number>) => {
      if (node !== null && typeof node === "object") {
        for (const [k, v] of Object.entries(node))
          walk(v, [...path, Array.isArray(node) ? Number(k) : k]);
        return;
      }
      if (path.length === 1 && path[0] === "generatedAt") return;
      leaves++;
      const p = clone(base);
      let parent: Json | unknown[] = p;
      for (const key of path.slice(0, -1))
        parent = parent[key as string] as Json;
      const last = path[path.length - 1] as string;
      const old = parent[last];
      parent[last] =
        typeof old === "string"
          ? old + "x"
          : typeof old === "number"
            ? old + 1
            : typeof old === "boolean"
              ? !old
              : "was-null";
      expect(verifyPassport(p).ok, path.join(".")).toBe(false);
    };
    walk(base, []);
    expect(leaves).toBeGreaterThan(100);
  });

  it("documents the limit: a forger who recomputes every hash passes", () => {
    const p = samplePassport();
    (p.incident as Json).state = "RESOLVED";
    (p.evidence as Json[])[0]!.httpStatus = 200;
    (p.diagnosis as Json).incidentState = "RESOLVED";
    seal(p);
    // Integrity-evident only: nothing here shows who produced the file.
    expect(verifyPassport(p).ok).toBe(true);
  });
});
