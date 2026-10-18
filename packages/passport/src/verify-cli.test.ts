import { describe, expect, it } from "vitest";
import { run } from "./verify-cli.js";
import { samplePassport } from "./test-support/sample.js";

function exec(args: string[], files: Record<string, string>) {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(args, {
    readFile: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("kora:verify", () => {
  it("prints PASS and exits 0 for an intact Passport", () => {
    const r = exec(["p.json"], { "p.json": JSON.stringify(samplePassport()) });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^PASS /);
    expect(r.out).toMatch(/integrity only/i);
    expect(r.out).toMatch(/not signed/i);
  });

  it("prints FAIL with the reason and exits 1 when a byte changed", () => {
    const text = JSON.stringify(samplePassport()).replace("503", "200");
    const r = exec(["p.json"], { "p.json": text });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^FAIL /);
    expect(r.out).toMatch(/content-hash|contentHash/);
    expect(r.out).not.toMatch(/PASS/);
  });

  it("fails (exit 1) on unreadable files and non-JSON, with a reason", () => {
    const missing = exec(["nope.json"], {});
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/^FAIL .*cannot read/i);
    const junk = exec(["p.json"], { "p.json": "{not json" });
    expect(junk.code).toBe(1);
    expect(junk.out).toMatch(/^FAIL .*not valid JSON/i);
  });

  it("exits 2 with usage when called without exactly one file", () => {
    for (const args of [[], ["a", "b"]]) {
      const r = exec(args, {});
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/usage/i);
    }
  });
});
