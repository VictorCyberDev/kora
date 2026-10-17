import { describe, expect, it } from "vitest";
import { sha } from "../test-support/fake-servers.js";
import type { ClaimObservation } from "./claim.js";
import {
  evaluateVerification,
  METHOD,
  PROVIDER_LEG,
  VERIFICATION_STATUSES,
} from "./evaluate.js";
import type { RelationObservation, ScmHeadObservation } from "./scm.js";

const at = "2026-03-04T10:00:00.000Z";
const scm = (over: Partial<ScmHeadObservation> = {}): ScmHeadObservation => ({
  kind: "scm_head",
  outcome: "OBSERVED",
  observedAt: at,
  sourceUrl: "https://api.github.com/repos/a/b/git/ref/heads/main",
  httpStatus: 200,
  reason: null,
  sha: sha(2),
  ...over,
});
const claim = (
  commit: string | null = sha(1),
  over: Partial<ClaimObservation> = {},
): ClaimObservation => ({
  kind: "workload_claim",
  outcome: "OBSERVED",
  observedAt: at,
  sourceUrl: "http://demo/__kora",
  httpStatus: 200,
  reason: null,
  claim: {
    service: "demo-service",
    environment: "test",
    commit,
    commitSource: commit ? "build-info" : "unavailable",
    builtAt: null,
    startedAt: at,
  },
  ...over,
});
const unknownClaim = (reason = "unreachable: ECONNREFUSED"): ClaimObservation =>
  claim(null, { outcome: "UNKNOWN", reason, claim: null, httpStatus: null });
const relation = (
  over: Partial<RelationObservation> = {},
): RelationObservation => ({
  kind: "commit_relation",
  outcome: "OBSERVED",
  observedAt: at,
  sourceUrl: "https://api.github.com/repos/a/b/compare/x...y?per_page=1",
  httpStatus: 200,
  reason: null,
  relation: "claimed_behind",
  behindBy: 4,
  aheadBy: 0,
  ...over,
});

describe("evaluateVerification", () => {
  it("MATCH when the claimed commit is the source head", () => {
    const r = evaluateVerification({
      scm: scm({ sha: sha(5) }),
      claim: claim(sha(5)),
      relation: null,
    });
    expect(r).toMatchObject({
      status: "MATCH",
      behindBy: null,
      scmHead: sha(5),
      claimedCommit: sha(5),
      evidenceUsed: ["scm_head", "workload_claim"],
    });
  });
  it("BEHIND N when the claimed commit is N commits behind the head", () => {
    const r = evaluateVerification({
      scm: scm(),
      claim: claim(),
      relation: relation(),
    });
    expect(r).toMatchObject({
      status: "BEHIND",
      behindBy: 4,
      evidenceUsed: ["scm_head", "workload_claim", "commit_relation"],
    });
    expect(r.detail).toContain("4 commits");
  });
  it("BEHIND says '1 commit' for a single commit", () => {
    const r = evaluateVerification({
      scm: scm(),
      claim: claim(),
      relation: relation({ behindBy: 1 }),
    });
    expect(r.detail).toContain("1 commit");
    expect(r.detail).not.toContain("1 commits");
  });
  it.each([
    ["diverged", relation({ relation: "diverged", behindBy: 2, aheadBy: 3 })],
    [
      "claimed ahead",
      relation({ relation: "claimed_ahead", behindBy: 0, aheadBy: 3 }),
    ],
  ])("DIVERGED when the relation is %s", (_n, rel) => {
    const r = evaluateVerification({
      scm: scm(),
      claim: claim(),
      relation: rel,
    });
    expect(r.status).toBe("DIVERGED");
    expect(r.behindBy).toBeNull();
    expect(r.evidenceUsed).toEqual([
      "scm_head",
      "workload_claim",
      "commit_relation",
    ]);
  });
  it("DIVERGED (relation unknown, 'differs') when compare failed or was not asked", () => {
    for (const rel of [
      relation({
        outcome: "UNKNOWN",
        relation: null,
        behindBy: null,
        aheadBy: null,
        reason: "http_status_404",
      }),
      null,
    ]) {
      const r = evaluateVerification({
        scm: scm(),
        claim: claim(),
        relation: rel,
      });
      expect(r.status).toBe("DIVERGED");
      expect(r.relation).toBe("differs");
      expect(r.evidenceUsed).toEqual(["scm_head", "workload_claim"]);
    }
  });
  it("CLAIM_HAS_NO_COMMIT when the claim is valid but carries no commit", () => {
    const r = evaluateVerification({
      scm: scm(),
      claim: claim(null),
      relation: null,
    });
    expect(r).toMatchObject({
      status: "CLAIM_HAS_NO_COMMIT",
      claimedCommit: null,
      evidenceUsed: ["workload_claim"],
    });
  });
  it.each([
    ["unreachable", unknownClaim()],
    ["invalid", unknownClaim("invalid_claim: unrecognized_keys@(root)")],
    ["never collected", null],
  ])("CLAIM_UNREACHABLE when the claim is %s", (_n, c) => {
    const r = evaluateVerification({ scm: scm(), claim: c, relation: null });
    expect(r.status).toBe("CLAIM_UNREACHABLE");
    expect(r.claimedCommit).toBeNull();
    expect(r.evidenceUsed).toEqual(c ? ["workload_claim"] : []);
  });
  it.each([
    [
      "unknown",
      scm({
        outcome: "UNKNOWN",
        sha: null,
        reason: "http_status_403",
        httpStatus: 403,
      }),
    ],
    ["never collected", null],
  ])("SCM_UNKNOWN when the source head is %s", (_n, s) => {
    const r = evaluateVerification({ scm: s, claim: claim(), relation: null });
    expect(r.status).toBe("SCM_UNKNOWN");
    expect(r.scmHead).toBeNull();
    expect(r.evidenceUsed).toEqual(
      s ? ["scm_head", "workload_claim"] : ["workload_claim"],
    );
  });
  it("precedence: unreachable claim, then no-commit claim, then unknown source", () => {
    const badScm = scm({ outcome: "UNKNOWN", sha: null, reason: "timeout" });
    expect(
      evaluateVerification({
        scm: badScm,
        claim: unknownClaim(),
        relation: null,
      }).status,
    ).toBe("CLAIM_UNREACHABLE");
    expect(
      evaluateVerification({ scm: badScm, claim: claim(null), relation: null })
        .status,
    ).toBe("CLAIM_HAS_NO_COMMIT");
    expect(
      evaluateVerification({ scm: badScm, claim: claim(), relation: null })
        .status,
    ).toBe("SCM_UNKNOWN");
  });
  it("ignores a relation observation when the commits are equal", () => {
    const r = evaluateVerification({
      scm: scm({ sha: sha(5) }),
      claim: claim(sha(5)),
      relation: relation(),
    });
    expect(r.status).toBe("MATCH");
    expect(r.evidenceUsed).not.toContain("commit_relation");
  });
  it("always reports the provider leg as NOT COLLECTED with the documented reason", () => {
    expect(PROVIDER_LEG).toEqual({
      status: "NOT COLLECTED",
      reason: "Rumpty exposes no documented deployment revision signal",
    });
    for (const input of [
      { scm: scm(), claim: claim(), relation: null },
      { scm: null, claim: null, relation: null },
    ])
      expect(evaluateVerification(input).providerLeg).toEqual(PROVIDER_LEG);
  });
  it("returns exactly one of the six statuses and is deterministic", () => {
    expect(VERIFICATION_STATUSES).toEqual([
      "MATCH",
      "BEHIND",
      "DIVERGED",
      "CLAIM_HAS_NO_COMMIT",
      "CLAIM_UNREACHABLE",
      "SCM_UNKNOWN",
    ]);
    const input = { scm: scm(), claim: claim(), relation: relation() };
    const frozen = structuredClone(input);
    const a = evaluateVerification(input);
    expect(evaluateVerification(input)).toEqual(a);
    expect(input).toEqual(frozen);
    expect(VERIFICATION_STATUSES).toContain(a.status);
  });
  it("uses the required terminology and never overclaims", () => {
    expect(METHOD).toBe("Deployment Verification (not cryptographic)");
    const outputs = [
      evaluateVerification({
        scm: scm({ sha: sha(5) }),
        claim: claim(sha(5)),
        relation: null,
      }),
      evaluateVerification({
        scm: scm(),
        claim: claim(),
        relation: relation(),
      }),
      evaluateVerification({ scm: null, claim: null, relation: null }),
    ];
    expect(JSON.stringify(outputs)).not.toMatch(/attested|proven|secure/i);
  });
});
