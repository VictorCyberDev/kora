import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BuildInfo } from "./build-info.js";
import { normalizeSha } from "./commit.js";

export const RUNTIME_CLAIM_SCHEMA = "kora.runtime-claim/v1";

/**
 * What a running process says about itself. It is a self-report, not proof:
 * nothing here is signed or verified, and it must never be treated as
 * attestation (see ADR-009).
 */
export interface RuntimeClaim {
  schema: typeof RUNTIME_CLAIM_SCHEMA;
  service: string;
  environment: string;
  commit: string | null;
  commitSource: "build-info" | "env" | "unavailable";
  builtAt: string | null;
  startedAt: string;
  uptimeSeconds: number;
}

// packages/runtime-claim/{src,dist}/claim.* -> repository or image root.
const DEFAULT_BUILD_INFO = fileURLToPath(
  new URL("../../../build-info.json", import.meta.url),
);

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) || time.toISOString() !== value
    ? null
    : value;
}

function readBuildInfo(path: string): BuildInfo {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<
      Record<keyof BuildInfo, unknown>
    > | null;
    return {
      commit: normalizeSha(parsed?.commit),
      builtAt: isoOrNull(parsed?.builtAt),
    };
  } catch {
    return { commit: null, builtAt: null };
  }
}

/**
 * Reads the build-info file and environment once, at startup. Commit order:
 * build-info file, then KORA_COMMIT_SHA, else null with "unavailable".
 */
export function createRuntimeClaim(input: {
  service: string;
  env?: Record<string, string | undefined>;
  buildInfoPath?: string;
  startedAt?: Date;
  now?: () => Date;
}) {
  const env = input.env ?? process.env;
  const info = readBuildInfo(input.buildInfoPath ?? DEFAULT_BUILD_INFO);
  const fromEnv = normalizeSha(env.KORA_COMMIT_SHA);
  const commit = info.commit ?? fromEnv;
  const commitSource: RuntimeClaim["commitSource"] = info.commit
    ? "build-info"
    : fromEnv
      ? "env"
      : "unavailable";
  const now = input.now ?? (() => new Date());
  const startedAt =
    input.startedAt ?? new Date(now().getTime() - process.uptime() * 1000);
  const environment = env.KORA_ENVIRONMENT || "development";
  return {
    snapshot(): RuntimeClaim {
      return {
        schema: RUNTIME_CLAIM_SCHEMA,
        service: input.service,
        environment,
        commit,
        commitSource,
        builtAt: info.builtAt,
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.max(
          0,
          Math.floor((now().getTime() - startedAt.getTime()) / 1000),
        ),
      };
    },
  };
}
