import { createHash } from "node:crypto";
import type { ActionType } from "./schema.js";

/** Structural subset of the deterministic diagnostic snapshot. */
export interface SnapshotLike {
  incidentId: string;
  incidentState: string;
  temporal: Record<string, string | null>;
  evidence: Array<{
    id: string;
    type: string;
    observedAt: string;
    healthy: boolean | null;
    httpStatus: number | null;
    failureCategory: string | null;
    providerStatus: string | null;
  }>;
  findings: Array<{
    id: string;
    code: string;
    statement: string;
    confidence: string;
    evidenceIds: string[];
  }>;
  contradictions: Array<{
    code: string;
    evidenceIds: string[];
    statement: string;
  }>;
  evidenceGaps: string[];
  rootCause: { state: string; statement: string };
  contentHash: string;
}
export interface ChangeLike {
  id: string;
  kind: string;
  occurredAt: string;
  revision?: string | null;
  /** Seconds between the change and the incident's first failure (negative: after). */
  secondsBeforeFailure: number | null;
}
export interface ReasonerInput {
  incident: {
    id: string;
    state: string;
    startedAt: string;
    resolvedAt: string | null;
  };
  snapshot: SnapshotLike;
  topology: {
    components: Array<{ id: string; kind: string; label: string }>;
    affected: string[];
  };
  recentChanges: ChangeLike[];
  verification: { outcome: string; detail?: string } | null;
  permittedActions: ActionType[];
  rollbackTargetVersionId: string | null;
}

const SECRETISH =
  /(rmp_|sk_(live|test)_|gh[pousr]_|bearer\s|password|secret|api[_-]?key|token)[^\s]*/gi;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
/** Untrusted text: bounded, control-free, secret-shaped substrings removed. */
export function sanitizeUntrusted(value: string, max = 300): string {
  return value
    .replace(CONTROL, " ")
    .replace(SECRETISH, "[REDACTED]")
    .slice(0, max);
}

/** Allow-list projection: only these fields ever reach the model. */
export function projectInput(input: ReasonerInput): ReasonerInput {
  const s = input.snapshot;
  return {
    incident: { ...input.incident },
    snapshot: {
      incidentId: s.incidentId,
      incidentState: s.incidentState,
      temporal: { ...s.temporal },
      evidence: s.evidence.slice(-30).map((e) => ({
        id: e.id,
        type: e.type,
        observedAt: e.observedAt,
        healthy: e.healthy,
        httpStatus: e.httpStatus,
        failureCategory: e.failureCategory,
        providerStatus:
          e.providerStatus === null
            ? null
            : sanitizeUntrusted(e.providerStatus, 60),
      })),
      findings: s.findings.map((f) => ({
        id: f.id,
        code: f.code,
        statement: sanitizeUntrusted(f.statement),
        confidence: f.confidence,
        evidenceIds: f.evidenceIds,
      })),
      contradictions: s.contradictions.map((c) => ({
        code: c.code,
        evidenceIds: c.evidenceIds,
        statement: sanitizeUntrusted(c.statement),
      })),
      evidenceGaps: [...s.evidenceGaps],
      rootCause: {
        state: s.rootCause.state,
        statement: sanitizeUntrusted(s.rootCause.statement),
      },
      contentHash: s.contentHash,
    },
    topology: {
      components: input.topology.components.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: sanitizeUntrusted(c.label, 80),
      })),
      affected: [...input.topology.affected],
    },
    recentChanges: input.recentChanges
      .slice(0, 10)
      .map((c) => ({
        ...c,
        revision: c.revision ? sanitizeUntrusted(c.revision, 80) : null,
      })),
    verification: input.verification
      ? {
          outcome: input.verification.outcome,
          ...(input.verification.detail
            ? { detail: sanitizeUntrusted(input.verification.detail) }
            : {}),
        }
      : null,
    permittedActions: [...input.permittedActions],
    rollbackTargetVersionId: input.rollbackTargetVersionId,
  };
}
export const inputHash = (input: ReasonerInput) =>
  createHash("sha256")
    .update(JSON.stringify(projectInput(input)))
    .digest("hex");

export const CONFIDENCE_ORDER = [
  "INSUFFICIENT_EVIDENCE",
  "SUPPORTED",
  "STRONGLY_SUPPORTED",
  "CONFIRMED",
] as const;
export function maxSupportedConfidence(
  s: SnapshotLike,
): "SUPPORTED" | "STRONGLY_SUPPORTED" | "CONFIRMED" {
  let best = 1;
  for (const f of s.findings)
    best = Math.max(
      best,
      CONFIDENCE_ORDER.indexOf(
        f.confidence as (typeof CONFIDENCE_ORDER)[number],
      ),
    );
  return (
    ["SUPPORTED", "SUPPORTED", "STRONGLY_SUPPORTED", "CONFIRMED"] as const
  )[best]!;
}
