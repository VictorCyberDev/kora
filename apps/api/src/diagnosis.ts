import { createHash } from "node:crypto";

export type EvidenceSource =
  "HEALTH_CHECK" | "PROVIDER" | "TOPOLOGY" | "INCIDENT_ENGINE" | "SYSTEM";
export type DiagnosticConfidence =
  | "CONFIRMED"
  | "STRONGLY_SUPPORTED"
  | "SUPPORTED"
  | "INSUFFICIENT_EVIDENCE";
export type RootCauseState = "IDENTIFIED" | "SUSPECTED" | "UNKNOWN";
export type FindingCode =
  | "SERVICE_HTTP_5XX"
  | "SERVICE_HTTP_4XX"
  | "SERVICE_TIMEOUT"
  | "DNS_RESOLUTION_FAILURE"
  | "TLS_HANDSHAKE_FAILURE"
  | "CONNECTION_REFUSED"
  | "RESOURCE_REPORTED_STOPPED"
  | "PROVIDER_UNAVAILABLE"
  | "RECOVERY_VERIFIED";
export type EvidenceGap =
  | "NO_RESOURCE_METRICS"
  | "NO_APPLICATION_LOGS"
  | "NO_PROVIDER_STATUS"
  | "NO_DEPLOYMENT_CONTEXT";

export interface DiagnosticEvidence {
  id: string;
  incidentId: string;
  serviceId: string;
  resourceId: string | null;
  source: EvidenceSource;
  type: string;
  observedAt: string;
  ingestedAt: string;
  healthy: boolean | null;
  httpStatus: number | null;
  failureCategory: string | null;
  providerStatus: string | null;
  provenance: string;
  contentHash: string;
}
export interface DiagnosticFinding {
  id: string;
  incidentId: string;
  code: FindingCode;
  statement: string;
  confidence: DiagnosticConfidence;
  evidenceIds: string[];
  method: "DETERMINISTIC_RULE";
}
export interface DiagnosticInput {
  incident: {
    id: string;
    serviceId: string;
    state: string;
    startedAt: string;
    resolvedAt: string | null;
    detectedAt: string | null;
    thresholdCrossedAt: string | null;
  };
  resource: {
    id: string;
    provider: string;
    providerResourceId: string;
    providerStatus: string | null;
  } | null;
  evidence: Omit<DiagnosticEvidence, "contentHash">[];
  recoveryVerified: boolean;
  createdAt: string;
  limit?: number;
}
export interface DiagnosticSnapshot {
  version: 1;
  incidentId: string;
  createdAt: string;
  temporal: {
    lastKnownHealthyAt: string | null;
    firstFailureAt: string | null;
    thresholdCrossedAt: string | null;
    incidentDetectedAt: string | null;
    latestFailureAt: string | null;
    recoveryStartedAt: string | null;
    recoveryVerifiedAt: string | null;
  };
  evidence: DiagnosticEvidence[];
  findings: DiagnosticFinding[];
  contradictions: Array<{
    code: string;
    evidenceIds: string[];
    statement: string;
  }>;
  evidenceGaps: EvidenceGap[];
  rootCause: { state: RootCauseState; statement: string };
  truncated: boolean;
  totalEvidenceCount: number;
  contentHash: string;
}

const secretPattern =
  /(authorization|bearer|api[_-]?key|token|password|secret)/i;
export function redactDiagnosticText(value: string): string {
  return secretPattern.test(value) ? "[REDACTED]" : value;
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}
export function deterministicHash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function evidenceHash(e: Omit<DiagnosticEvidence, "contentHash">) {
  return deterministicHash(e);
}
function finding(
  incidentId: string,
  code: FindingCode,
  statement: string,
  confidence: DiagnosticConfidence,
  evidenceIds: string[],
): DiagnosticFinding {
  const ids = [...evidenceIds].sort();
  return {
    id: deterministicHash({ incidentId, code, ids }).slice(0, 32),
    incidentId,
    code,
    statement,
    confidence,
    evidenceIds: ids,
    method: "DETERMINISTIC_RULE",
  };
}
const findingRules: Array<{
  category: string;
  code: FindingCode;
  statement: string;
}> = [
  {
    category: "HTTP_5XX",
    code: "SERVICE_HTTP_5XX",
    statement: "Service endpoint repeatedly returns server errors.",
  },
  {
    category: "HTTP_4XX",
    code: "SERVICE_HTTP_4XX",
    statement: "Service endpoint repeatedly returns client-error responses.",
  },
  {
    category: "TIMEOUT",
    code: "SERVICE_TIMEOUT",
    statement: "Service health checks repeatedly time out.",
  },
  {
    category: "DNS_FAILURE",
    code: "DNS_RESOLUTION_FAILURE",
    statement: "Service health checks fail during DNS resolution.",
  },
  {
    category: "TLS_FAILURE",
    code: "TLS_HANDSHAKE_FAILURE",
    statement: "Service health checks fail during TLS negotiation.",
  },
  {
    category: "CONNECTION_REFUSED",
    code: "CONNECTION_REFUSED",
    statement: "Service health connection attempts are refused.",
  },
  {
    category: "PROVIDER_UNAVAILABLE",
    code: "PROVIDER_UNAVAILABLE",
    statement:
      "Provider status could not be obtained because the provider was unavailable.",
  },
  {
    category: "RESOURCE_STOPPED",
    code: "RESOURCE_REPORTED_STOPPED",
    statement: "Provider evidence reports the resource stopped.",
  },
];

export function buildDiagnosticSnapshot(
  input: DiagnosticInput,
): DiagnosticSnapshot {
  const max = Math.max(1, input.limit ?? 500);
  const all = input.evidence
    .map((e) => {
      const provenance = redactDiagnosticText(e.provenance);
      return {
        ...e,
        provenance,
        contentHash: evidenceHash({ ...e, provenance }),
      };
    })
    .sort(
      (a, b) =>
        a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id),
    );
  const evidence = all.slice(Math.max(0, all.length - max));
  const failures = evidence.filter((e) => e.healthy === false);
  const healthy = evidence.filter((e) => e.healthy === true);
  const findings: DiagnosticFinding[] = [];
  for (const rule of findingRules) {
    const matches = failures.filter((e) => e.failureCategory === rule.category);
    if (matches.length)
      findings.push(
        finding(
          input.incident.id,
          rule.code,
          rule.statement,
          matches.length >= 3 ? "STRONGLY_SUPPORTED" : "SUPPORTED",
          matches.map((e) => e.id),
        ),
      );
  }
  if (input.recoveryVerified) {
    const recovery = healthy.filter(
      (e) => e.observedAt >= input.incident.startedAt,
    );
    findings.push(
      finding(
        input.incident.id,
        "RECOVERY_VERIFIED",
        "Recovery was verified by subsequent healthy observations.",
        "CONFIRMED",
        recovery.map((e) => e.id),
      ),
    );
  }
  const running = evidence.filter(
    (e) => e.providerStatus?.toUpperCase() === "RUNNING",
  );
  const stopped = evidence.filter(
    (e) => e.providerStatus?.toUpperCase() === "STOPPED",
  );
  const contradictions: DiagnosticSnapshot["contradictions"] = [];
  if (running.length && failures.length)
    contradictions.push({
      code: "RESOURCE_RUNNING_SERVICE_UNHEALTHY",
      statement:
        "Provider reports the resource running while service health is failing.",
      evidenceIds: [...running, ...failures].map((e) => e.id).sort(),
    });
  if (running.length && stopped.length)
    contradictions.push({
      code: "CONFLICTING_PROVIDER_STATE",
      statement: "Provider evidence contains conflicting resource states.",
      evidenceIds: [...running, ...stopped].map((e) => e.id).sort(),
    });
  const gaps: EvidenceGap[] = [
    "NO_RESOURCE_METRICS",
    "NO_APPLICATION_LOGS",
    "NO_DEPLOYMENT_CONTEXT",
  ];
  if (!evidence.some((e) => e.providerStatus)) gaps.push("NO_PROVIDER_STATUS");
  const failureTimes = failures.map((e) => e.observedAt);
  const postFailureHealthy = healthy.filter(
    (e) => failureTimes.length && e.observedAt > failureTimes[0]!,
  );
  const beforeFailureHealthy = healthy.filter(
    (e) => !failureTimes.length || e.observedAt < failureTimes[0]!,
  );

  // Hash only diagnostically meaningful state. Snapshot creation metadata is
  // intentionally outside this boundary so recreating the same diagnosis later
  // yields the same content hash.
  const diagnosticContent = {
    version: 1 as const,
    incidentId: input.incident.id,
    incidentState: input.incident.state,
    temporal: {
      lastKnownHealthyAt: beforeFailureHealthy.at(-1)?.observedAt ?? null,
      firstFailureAt: failureTimes[0] ?? null,
      thresholdCrossedAt: input.incident.thresholdCrossedAt,
      incidentDetectedAt: input.incident.detectedAt,
      latestFailureAt: failureTimes.at(-1) ?? null,
      recoveryStartedAt: postFailureHealthy[0]?.observedAt ?? null,
      recoveryVerifiedAt: input.recoveryVerified
        ? input.incident.resolvedAt
        : null,
    },
    evidence,
    findings: findings.sort((a, b) => a.code.localeCompare(b.code)),
    contradictions: contradictions.sort((a, b) =>
      a.code.localeCompare(b.code),
    ),
    evidenceGaps: gaps.sort(),
    rootCause: {
      state: "UNKNOWN" as const,
      statement:
        "Available evidence establishes symptoms but does not establish an underlying root cause.",
    },
    truncated: all.length > evidence.length,
    totalEvidenceCount: all.length,
  };
  return {
    version: diagnosticContent.version,
    incidentId: diagnosticContent.incidentId,
    createdAt: input.createdAt,
    temporal: diagnosticContent.temporal,
    evidence: diagnosticContent.evidence,
    findings: diagnosticContent.findings,
    contradictions: diagnosticContent.contradictions,
    evidenceGaps: diagnosticContent.evidenceGaps,
    rootCause: diagnosticContent.rootCause,
    truncated: diagnosticContent.truncated,
    totalEvidenceCount: diagnosticContent.totalEvidenceCount,
    contentHash: deterministicHash(diagnosticContent),
  };
}
