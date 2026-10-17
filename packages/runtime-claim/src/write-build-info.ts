#!/usr/bin/env node
// Image-build step: node write-build-info.js [--git-dir DIR] [--out FILE]
// Reads GIT_SHA and SOURCE_DATE_EPOCH from the environment. Always exits 0.
import { writeBuildInfo } from "./build-info.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const info = writeBuildInfo({
  out: option("--out") ?? "build-info.json",
  gitSha: process.env.GIT_SHA,
  gitDir: option("--git-dir"),
  sourceDateEpoch: process.env.SOURCE_DATE_EPOCH,
});
console.log(
  `build-info: commit=${info.commit ?? "unavailable"} builtAt=${info.builtAt ?? "unknown"}`,
);
