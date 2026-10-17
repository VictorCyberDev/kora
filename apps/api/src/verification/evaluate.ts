import type { ClaimObservation } from "./claim.js";
import type { RelationObservation, ScmHeadObservation } from "./scm.js";

/** The only name for this check. It compares claims with a source; nothing is signed. */
export const METHOD = "Deployment Verification (not cryptographic)";

export const VERIFICATION_STATUSES = [
  "MATCH",
  "BEHIND",
  "DIVERGED",
  "CLAIM_HAS_NO_COMMIT",
  "CLAIM_UNREACHABLE",
  "SCM_UNKNOWN",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** The provider leg is never collected: Rumpty documents no revision signal. */
export const PROVIDER_LEG = {
  status: "NOT COLLECTED",
  reason: "Rumpty exposes no documented deployment revision signal",
} as const;

export type EvidenceKind = "scm_head" | "workload_claim" | "commit_relation";

export interface VerificationResult {
  status: VerificationStatus;
  /** Only for BEHIND: commits on the head that the claimed commit lacks. */
  behindBy: number | null;
  /** How the commits relate; "differs" when they differ but how is unknown. */
  relation:
    | "identical"
    | "claimed_behind"
    | "claimed_ahead"
    | "diverged"
    | "differs"
    | null;
  scmHead: string | null;
  claimedCommit: string | null;
  detail: string;
  evidenceUsed: EvidenceKind[];
  providerLeg: typeof PROVIDER_LEG;
}

/**
 * Pure and deterministic. Precedence: an unreadable claim (CLAIM_UNREACHABLE),
 * then a claim without a commit (CLAIM_HAS_NO_COMMIT), then an unknown source
 * head (SCM_UNKNOWN), then the comparison itself.
 */
export function evaluateVerification(input: {
  scm: ScmHeadObservation | null;
  claim: ClaimObservation | null;
  relation: RelationObservation | null;
}): VerificationResult {
  const scmHead = input.scm?.outcome === "OBSERVED" ? input.scm.sha : null;
  const claim = input.claim?.outcome === "OBSERVED" ? input.claim.claim : null;
  const claimedCommit = claim?.commit ?? null;
  const base = { scmHead, claimedCommit, providerLeg: PROVIDER_LEG };
  const result = (
    status: VerificationStatus,
    detail: string,
    evidenceUsed: EvidenceKind[],
    extra: Partial<Pick<VerificationResult, "behindBy" | "relation">> = {},
  ): VerificationResult => ({
    ...base,
    status,
    behindBy: null,
    relation: null,
    detail,
    evidenceUsed,
    ...extra,
  });

  if (!claim)
    return result(
      "CLAIM_UNREACHABLE",
      "The workload's claim could not be read or did not validate.",
      input.claim ? ["workload_claim"] : [],
    );
  if (!claimedCommit)
    return result(
      "CLAIM_HAS_NO_COMMIT",
      "The workload's claim carries no commit, so there is nothing to compare.",
      ["workload_claim"],
    );
  if (!scmHead)
    return result(
      "SCM_UNKNOWN",
      "The source branch head could not be determined.",
      input.scm ? ["scm_head", "workload_claim"] : ["workload_claim"],
    );
  if (claimedCommit === scmHead)
    return result(
      "MATCH",
      "Claimed commit equals the source branch head.",
      ["scm_head", "workload_claim"],
      { relation: "identical" },
    );

  const rel = input.relation?.outcome === "OBSERVED" ? input.relation : null;
  if (rel?.relation === "claimed_behind" && rel.behindBy && rel.behindBy >= 1)
    return result(
      "BEHIND",
      `Claimed commit is ${rel.behindBy} ${rel.behindBy === 1 ? "commit" : "commits"} behind the source branch head.`,
      ["scm_head", "workload_claim", "commit_relation"],
      { behindBy: rel.behindBy, relation: "claimed_behind" },
    );
  if (rel?.relation === "claimed_ahead" || rel?.relation === "diverged")
    return result(
      "DIVERGED",
      `Claimed commit differs from the source branch head and is not behind it (${rel.relation === "diverged" ? "diverged" : "ahead of the head"}).`,
      ["scm_head", "workload_claim", "commit_relation"],
      { relation: rel.relation },
    );
  return result(
    "DIVERGED",
    "Claimed commit differs from the source branch head; how they relate could not be determined.",
    ["scm_head", "workload_claim"],
    { relation: "differs" },
  );
}
