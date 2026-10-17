import { z } from "zod";
import { fetchJson } from "./safe-fetch.js";

const isoInstant = z.string().refine((v) => {
  const time = new Date(v);
  return !Number.isNaN(time.getTime()) && time.toISOString() === v;
}, "not an ISO-8601 instant");

/** kora.runtime-claim/v1, strictly: unknown schema or extra fields are rejected. */
export const runtimeClaimSchema = z.strictObject({
  schema: z.literal("kora.runtime-claim/v1"),
  service: z.string().min(1).max(200),
  environment: z.string().min(1).max(200),
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
  commitSource: z.enum(["build-info", "env", "unavailable"]),
  builtAt: isoInstant.nullable(),
  startedAt: isoInstant,
  uptimeSeconds: z.number().finite().min(0),
});

/** The claim as the workload reported it. */
export interface ReportedClaim {
  service: string;
  environment: string;
  commit: string | null;
  commitSource: "build-info" | "env" | "unavailable";
  builtAt: string | null;
  startedAt: string;
}

export interface ClaimObservation {
  kind: "workload_claim";
  outcome: "OBSERVED" | "UNKNOWN";
  observedAt: string;
  sourceUrl: string;
  httpStatus: number | null;
  reason: string | null;
  claim: ReportedClaim | null;
}

/**
 * Fetches and validates the workload's runtime claim. Never throws. Anything
 * missing or invalid is UNKNOWN with a fixed-vocabulary reason; a claim whose
 * commit is null is still a valid, OBSERVED claim.
 */
export async function observeWorkloadClaim(input: {
  url: string;
  timeoutMs: number;
  now?: () => Date;
}): Promise<ClaimObservation> {
  const observedAt = (input.now ?? (() => new Date()))().toISOString();
  const base = {
    kind: "workload_claim" as const,
    observedAt,
    sourceUrl: input.url,
  };
  const result = await fetchJson(input.url, { timeoutMs: input.timeoutMs });
  if (!result.ok)
    return {
      ...base,
      outcome: "UNKNOWN",
      httpStatus: result.httpStatus,
      reason: result.reason,
      claim: null,
    };
  const parsed = runtimeClaimSchema.safeParse(result.json);
  if (!parsed.success) {
    // Issue codes and our own field names only: never the received values.
    const where = [
      ...new Set(
        parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.code}@${i.path.join(".") || "(root)"}`),
      ),
    ].join(", ");
    return {
      ...base,
      outcome: "UNKNOWN",
      httpStatus: result.status,
      reason: `invalid_claim: ${where}`,
      claim: null,
    };
  }
  const { schema: _schema, uptimeSeconds: _uptime, ...claim } = parsed.data;
  void _schema;
  void _uptime;
  return {
    ...base,
    outcome: "OBSERVED",
    httpStatus: result.status,
    reason: null,
    claim,
  };
}
