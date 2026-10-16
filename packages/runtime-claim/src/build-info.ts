import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveBuildCommit } from "./commit.js";

export interface BuildInfo {
  commit: string | null;
  builtAt: string | null;
}

function builtAt(sourceDateEpoch: string | undefined, now: Date): string {
  if (sourceDateEpoch && /^\d{1,12}$/.test(sourceDateEpoch)) {
    const fromEpoch = new Date(Number(sourceDateEpoch) * 1000);
    if (!Number.isNaN(fromEpoch.getTime())) return fromEpoch.toISOString();
  }
  return now.toISOString();
}

/**
 * Writes build-info.json for the image build. It never throws: a build must
 * not fail because the commit is unknown or the file cannot be written.
 */
export function writeBuildInfo(input: {
  out: string;
  gitSha?: string | undefined;
  gitDir?: string | undefined;
  sourceDateEpoch?: string | undefined;
  now?: Date;
}): BuildInfo {
  const info: BuildInfo = {
    commit: resolveBuildCommit(input),
    builtAt: builtAt(input.sourceDateEpoch, input.now ?? new Date()),
  };
  try {
    mkdirSync(dirname(input.out), { recursive: true });
    writeFileSync(input.out, `${JSON.stringify(info)}\n`);
  } catch (error) {
    console.error(
      `write-build-info: could not write ${input.out}: ${String(error)}`,
    );
  }
  return info;
}
