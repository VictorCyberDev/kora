import type { ClaimObservation } from "./claim.js";
import { evaluateVerification, METHOD, type EvidenceKind } from "./evaluate.js";
import type { RelationObservation, ScmHeadObservation } from "./scm.js";

type Row = Record<string, unknown>;
const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Rebuilds the stored observations of one check. Unknown columns stay null. */
function observations(rows: Row[]) {
  let scm: ScmHeadObservation | null = null;
  let claim: ClaimObservation | null = null;
  let relation: RelationObservation | null = null;
  const ids = new Map<EvidenceKind, string>();
  for (const r of rows) {
    const common = {
      outcome: r.outcome as "OBSERVED" | "UNKNOWN",
      observedAt: iso(r.observed_at)!,
      sourceUrl: String(r.source_url),
      httpStatus: num(r.http_status),
      reason: str(r.reason),
    };
    ids.set(r.kind as EvidenceKind, String(r.id));
    if (r.kind === "scm_head")
      scm = { kind: "scm_head", ...common, sha: str(r.commit_sha) };
    else if (r.kind === "workload_claim")
      claim = {
        kind: "workload_claim",
        ...common,
        claim:
          common.outcome === "OBSERVED"
            ? {
                service: String(r.claim_service),
                environment: String(r.claim_environment),
                commit: str(r.commit_sha),
                commitSource: r.commit_source as
                  "build-info" | "env" | "unavailable",
                builtAt: iso(r.built_at),
                startedAt: iso(r.claim_started_at)!,
              }
            : null,
      };
    else if (r.kind === "commit_relation")
      relation = {
        kind: "commit_relation",
        ...common,
        relation: str(r.relation) as RelationObservation["relation"],
        behindBy: num(r.behind_by),
        aheadBy: num(r.ahead_by),
      };
  }
  return { scm, claim, relation, ids };
}

/** The API view of the latest stored check. Deterministic; reads only. */
export function buildVerificationReport(
  serviceId: string,
  latest: { checkId: string; rows: Row[] },
) {
  const { scm, claim, relation, ids } = observations(latest.rows);
  const result = evaluateVerification({ scm, claim, relation });
  const evidence = [scm, claim, relation]
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .map((o) => ({
      kind: o.kind,
      observationId: ids.get(o.kind)!,
      observedAt: o.observedAt,
      outcome: o.outcome,
      sourceUrl: o.sourceUrl,
      httpStatus: o.httpStatus,
      reason: o.reason,
      used: result.evidenceUsed.includes(o.kind),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
  return {
    method: METHOD,
    serviceId,
    checkId: latest.checkId,
    checkedAt:
      evidence
        .map((e) => e.observedAt)
        .sort()
        .at(-1) ?? null,
    status: result.status,
    behindBy: result.behindBy,
    relation: result.relation,
    detail: result.detail,
    scmHead: result.scmHead,
    claimedCommit: result.claimedCommit,
    claim: claim?.claim ?? null,
    evidence,
    providerLeg: result.providerLeg,
  };
}
