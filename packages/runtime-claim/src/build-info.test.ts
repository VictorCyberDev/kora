import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeBuildInfo } from "./build-info.js";

const A = "a".repeat(40);
const tmp = () => mkdtempSync(join(tmpdir(), "kora-bi-"));
const readInfo = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as {
    commit: string | null;
    builtAt: string | null;
  };

describe("writeBuildInfo", () => {
  it("never fails and writes a null commit with no ARG and no .git", () => {
    const out = join(tmp(), "build-info.json");
    const info = writeBuildInfo({ out, now: new Date("2026-01-02T03:04:05Z") });
    expect(info).toEqual({ commit: null, builtAt: "2026-01-02T03:04:05.000Z" });
    expect(readInfo(out)).toEqual(info);
  });
  it("records the GIT_SHA argument", () => {
    const out = join(tmp(), "build-info.json");
    writeBuildInfo({ out, gitSha: A });
    expect(readInfo(out).commit).toBe(A);
  });
  it("records the commit from a git directory when there is no argument", () => {
    const dir = tmp();
    mkdirSync(join(dir, "g"));
    writeFileSync(join(dir, "g", "HEAD"), `${A}\n`);
    const out = join(dir, "build-info.json");
    writeBuildInfo({ out, gitDir: join(dir, "g") });
    expect(readInfo(out).commit).toBe(A);
  });
  it("is reproducible with SOURCE_DATE_EPOCH", () => {
    const out = join(tmp(), "build-info.json");
    const info = writeBuildInfo({ out, sourceDateEpoch: "1767323045" });
    expect(info.builtAt).toBe("2026-01-02T03:04:05.000Z");
  });
  it("ignores an invalid SOURCE_DATE_EPOCH", () => {
    const out = join(tmp(), "build-info.json");
    const info = writeBuildInfo({
      out,
      sourceDateEpoch: "yesterday",
      now: new Date("2026-05-06T07:08:09Z"),
    });
    expect(info.builtAt).toBe("2026-05-06T07:08:09.000Z");
  });
  it("does not throw when the output cannot be written", () => {
    expect(() =>
      writeBuildInfo({ out: "/nonexistent-dir/kora/build-info.json" }),
    ).not.toThrow();
  });
});
