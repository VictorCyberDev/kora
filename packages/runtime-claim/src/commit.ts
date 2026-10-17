import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const SHA = /^[0-9a-f]{40}$/;

/** A 40-hex commit id (lower-cased), or null. Never returns anything else. */
export function normalizeSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sha = value.trim().toLowerCase();
  return SHA.test(sha) ? sha : null;
}

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** HEAD of a git directory: detached sha, or a branch ref (loose or packed). */
function readGitHead(gitDir: string): string | null {
  const head = read(join(gitDir, "HEAD"))?.trim();
  if (!head) return null;
  const detached = normalizeSha(head);
  if (detached) return detached;
  const ref = /^ref:\s*(refs\/[A-Za-z0-9._/-]+)$/.exec(head)?.[1];
  if (!ref || ref.split("/").includes("..")) return null;
  const root = resolve(gitDir);
  const loosePath = resolve(root, ref);
  if (loosePath.startsWith(root + sep)) {
    const loose = normalizeSha(read(loosePath));
    if (loose) return loose;
  }
  for (const line of (read(join(gitDir, "packed-refs")) ?? "").split("\n")) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref) return normalizeSha(sha);
  }
  return null;
}

/**
 * Commit a build is made from: a valid GIT_SHA argument first, else the HEAD
 * of the given git directory, else null. Invalid input is ignored, never
 * repaired or echoed, so the build cannot fail and no value is invented.
 */
export function resolveBuildCommit(input: {
  gitSha?: string | undefined;
  gitDir?: string | undefined;
}): string | null {
  return (
    normalizeSha(input.gitSha) ??
    (input.gitDir ? readGitHead(input.gitDir) : null)
  );
}
