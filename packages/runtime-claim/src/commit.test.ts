import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBuildCommit } from "./commit.js";

const A = "a".repeat(40);
const B = "b0".repeat(20);
const C = "0123456789abcdef".repeat(2) + "01234567";

function gitDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "kora-git-"));
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

describe("resolveBuildCommit", () => {
  it("prefers a valid GIT_SHA build argument over .git", () => {
    const dir = gitDir({ HEAD: `${B}\n` });
    expect(resolveBuildCommit({ gitSha: A, gitDir: dir })).toBe(A);
  });
  it("lower-cases and trims the build argument", () => {
    expect(resolveBuildCommit({ gitSha: ` ${A.toUpperCase()} ` })).toBe(A);
  });
  it("ignores an invalid build argument instead of failing or echoing it", () => {
    expect(resolveBuildCommit({ gitSha: "not-a-sha" })).toBeNull();
    expect(resolveBuildCommit({ gitSha: A.slice(0, 39) })).toBeNull();
    expect(resolveBuildCommit({ gitSha: A + "0" })).toBeNull();
    const dir = gitDir({ HEAD: `${B}\n` });
    expect(resolveBuildCommit({ gitSha: "nope", gitDir: dir })).toBe(B);
  });
  it("reads a detached HEAD", () => {
    expect(resolveBuildCommit({ gitDir: gitDir({ HEAD: `${B}\n` }) })).toBe(B);
  });
  it("follows a branch ref to a loose ref file", () => {
    const dir = gitDir({
      HEAD: "ref: refs/heads/feature/x\n",
      "refs/heads/feature/x": `${C}\n`,
    });
    expect(resolveBuildCommit({ gitDir: dir })).toBe(C);
  });
  it("follows a branch ref to packed-refs when the loose ref is gone", () => {
    const dir = gitDir({
      HEAD: "ref: refs/heads/main\n",
      "packed-refs": `# pack-refs with: peeled fully-peeled sorted\n${A} refs/heads/other\n${B} refs/heads/main\n^${C}\n`,
    });
    expect(resolveBuildCommit({ gitDir: dir })).toBe(B);
  });
  it("returns null when the branch ref cannot be resolved", () => {
    const dir = gitDir({ HEAD: "ref: refs/heads/gone\n" });
    expect(resolveBuildCommit({ gitDir: dir })).toBeNull();
  });
  it("returns null for a missing or unreadable git directory", () => {
    expect(resolveBuildCommit({})).toBeNull();
    expect(resolveBuildCommit({ gitDir: "/nonexistent/kora/.git" })).toBeNull();
  });
  it("returns null for a garbage HEAD and never invents a value", () => {
    expect(
      resolveBuildCommit({ gitDir: gitDir({ HEAD: "garbage\n" }) }),
    ).toBeNull();
    expect(
      resolveBuildCommit({
        gitDir: gitDir({ HEAD: "ref: ../../etc/passwd\n" }),
      }),
    ).toBeNull();
  });
  it("does not follow refs outside the git directory", () => {
    const outside = gitDir({ secret: `${A}\n` });
    const dir = gitDir({ HEAD: `ref: ${outside}/secret\n` });
    expect(resolveBuildCommit({ gitDir: dir })).toBeNull();
  });
});
