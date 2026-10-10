import { describe, expect, it } from "vitest";
import {
  buildDiagnosticSnapshot,
  deterministicHash,
  redactDiagnosticText,
  type DiagnosticInput,
} from "./diagnosis.js";

const incidentId = "00000000-0000-4000-8000-000000000001";
const serviceId = "00000000-0000-4000-8000-000000000002";
function input(
  categories: Array<string | null>,
  providerStatus: string | null = "RUNNING",
): DiagnosticInput {
  return {
    incident: {
      id: incidentId,
      serviceId,
      state: "DETECTED",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      detectedAt: "2026-01-01T00:00:31.000Z",
      thresholdCrossedAt: null,
    },
    resource: {
      id: "r1",
      provider: "rumptycloud",
      providerResourceId: "rc-123",
      providerStatus,
    },
    evidence: categories.map((category, i) => ({
      id: `e${i + 1}`,
      incidentId,
      serviceId,
      resourceId: "r1",
      source: "HEALTH_CHECK" as const,
      type: category ? "HealthCheckFailed" : "HealthCheckSucceeded",
      observedAt: `2026-01-01T00:00:${String(i * 10).padStart(2, "0")}.000Z`,
      ingestedAt: `2026-01-01T00:01:${String(i).padStart(2, "0")}.000Z`,
      healthy: category === null,
      httpStatus:
        category === "HTTP_5XX" ? 503 : category === null ? 200 : null,
      failureCategory: category,
      providerStatus,
      provenance: "kora:health-monitor",
    })),
    recoveryVerified: false,
    createdAt: "2026-01-01T00:02:00.000Z",
  };
}

describe("deterministic diagnosis", () => {
  it("maps repeated 5xx to a service symptom, never VM crash", () => {
    const result = buildDiagnosticSnapshot(
      input(["HTTP_5XX", "HTTP_5XX", "HTTP_5XX"]),
    );
    expect(result.findings.map((f) => f.code)).toContain("SERVICE_HTTP_5XX");
    expect(JSON.stringify(result)).not.toMatch(/vm crashed|memory exhaustion/i);
    expect(result.rootCause.state).toBe("UNKNOWN");
  });
  it("uses finite deterministic confidence", () => {
    const result = buildDiagnosticSnapshot(
      input(["HTTP_5XX", "HTTP_5XX", "HTTP_5XX"]),
    );
    expect(result.findings[0]?.confidence).toBe("STRONGLY_SUPPORTED");
  });
  it("preserves RUNNING plus unhealthy as contradiction", () => {
    const result = buildDiagnosticSnapshot(
      input(["TIMEOUT", "TIMEOUT", "TIMEOUT"], "RUNNING"),
    );
    expect(result.contradictions[0]?.code).toBe(
      "RESOURCE_RUNNING_SERVICE_UNHEALTHY",
    );
    expect(result.rootCause.state).toBe("UNKNOWN");
  });
  it("does not interpret missing provider status as stopped", () => {
    const result = buildDiagnosticSnapshot(input(["TIMEOUT"], null));
    expect(result.findings.map((f) => f.code)).not.toContain(
      "RESOURCE_REPORTED_STOPPED",
    );
    expect(result.evidenceGaps).toContain("NO_PROVIDER_STATUS");
  });
  it("maps explicit stopped evidence only when present", () => {
    const result = buildDiagnosticSnapshot(
      input(["RESOURCE_STOPPED"], "STOPPED"),
    );
    expect(result.findings.map((f) => f.code)).toContain(
      "RESOURCE_REPORTED_STOPPED",
    );
  });
  it("maps DNS evidence", () =>
    expect(
      buildDiagnosticSnapshot(input(["DNS_FAILURE"])).findings[0]?.code,
    ).toBe("DNS_RESOLUTION_FAILURE"));
  it("maps TLS evidence", () =>
    expect(
      buildDiagnosticSnapshot(input(["TLS_FAILURE"])).findings[0]?.code,
    ).toBe("TLS_HANDSHAKE_FAILURE"));
  it("maps connection refused evidence", () =>
    expect(
      buildDiagnosticSnapshot(input(["CONNECTION_REFUSED"])).findings[0]?.code,
    ).toBe("CONNECTION_REFUSED"));
  it("maps provider unavailable without claiming workload failure cause", () => {
    const result = buildDiagnosticSnapshot(
      input(["PROVIDER_UNAVAILABLE"], null),
    );
    expect(result.findings[0]?.code).toBe("PROVIDER_UNAVAILABLE");
    expect(result.rootCause.state).toBe("UNKNOWN");
  });
  it("orders equal timestamps by evidence ID", () => {
    const data = input(["HTTP_5XX", "HTTP_5XX"]);
    data.evidence[1]!.observedAt = data.evidence[0]!.observedAt;
    data.evidence.reverse();
    expect(buildDiagnosticSnapshot(data).evidence.map((e) => e.id)).toEqual([
      "e1",
      "e2",
    ]);
  });
  it("produces the same hash for reordered equivalent evidence", () => {
    const a = input(["HTTP_5XX", "TIMEOUT", "HTTP_5XX"]);
    const b = structuredClone(a);
    b.evidence.reverse();
    expect(buildDiagnosticSnapshot(a).contentHash).toBe(
      buildDiagnosticSnapshot(b).contentHash,
    );
  });
  it("does not include snapshot creation time in the diagnostic content hash", () => {
    const a = input(["HTTP_5XX", "TIMEOUT", "HTTP_5XX"]);
    const b = structuredClone(a);
    b.createdAt = "2030-12-31T23:59:59.000Z";
    const first = buildDiagnosticSnapshot(a);
    const second = buildDiagnosticSnapshot(b);
    expect(first.createdAt).not.toBe(second.createdAt);
    expect(first.contentHash).toBe(second.contentHash);
  });
  it("changes hash when diagnostically relevant evidence changes", () => {
    const a = input(["HTTP_5XX"]);
    const b = input(["TIMEOUT"]);
    expect(buildDiagnosticSnapshot(a).contentHash).not.toBe(
      buildDiagnosticSnapshot(b).contentHash,
    );
  });
  it("stable hashes object keys independently of insertion order", () => {
    expect(deterministicHash({ a: 1, b: 2 })).toBe(
      deterministicHash({ b: 2, a: 1 }),
    );
  });
  it("redacts secret-bearing provenance", () => {
    const data = input(["HTTP_5XX"]);
    data.evidence[0]!.provenance = "Authorization: Bearer super-secret-token";
    expect(buildDiagnosticSnapshot(data).evidence[0]?.provenance).toBe(
      "[REDACTED]",
    );
  });
  it("represents deterministic evidence truncation explicitly", () => {
    const data = input(["HTTP_5XX", "HTTP_5XX", "HTTP_5XX"]);
    data.limit = 2;
    const result = buildDiagnosticSnapshot(data);
    expect(result.truncated).toBe(true);
    expect(result.totalEvidenceCount).toBe(3);
    expect(result.evidence).toHaveLength(2);
  });
  it("never infers threshold crossing solely from the third failure", () => {
    const data = input(["HTTP_5XX", "HTTP_5XX", "HTTP_5XX"]);
    expect(
      buildDiagnosticSnapshot(data).temporal.thresholdCrossedAt,
    ).toBeNull();
  });
  it("uses an authoritative threshold timestamp independent of failure position", () => {
    const data = input([
      "HTTP_5XX",
      "HTTP_5XX",
      "HTTP_5XX",
      "HTTP_5XX",
    ]);
    data.incident.thresholdCrossedAt = data.evidence[3]!.observedAt;
    expect(buildDiagnosticSnapshot(data).temporal.thresholdCrossedAt).toBe(
      data.evidence[3]!.observedAt,
    );
  });
  it("truncated evidence cannot manufacture a threshold crossing", () => {
    const data = input([
      "HTTP_5XX",
      "HTTP_5XX",
      "HTTP_5XX",
      "HTTP_5XX",
    ]);
    data.limit = 2;
    const result = buildDiagnosticSnapshot(data);
    expect(result.truncated).toBe(true);
    expect(result.temporal.thresholdCrossedAt).toBeNull();
  });
  it("preserves the authoritative incident detection timestamp", () => {
    const data = input(["HTTP_5XX", "HTTP_5XX", "HTTP_5XX"]);
    data.incident.detectedAt = "2026-01-01T00:00:47.000Z";
    expect(buildDiagnosticSnapshot(data).temporal.incidentDetectedAt).toBe(
      "2026-01-01T00:00:47.000Z",
    );
  });
  it("adds recovery finding only for verified recovery", () => {
    const data = input(["HTTP_5XX", "HTTP_5XX", "HTTP_5XX", null, null, null]);
    data.recoveryVerified = true;
    data.incident.state = "RESOLVED";
    data.incident.resolvedAt = "2026-01-01T00:01:00.000Z";
    const result = buildDiagnosticSnapshot(data);
    expect(result.findings.map((f) => f.code)).toContain("RECOVERY_VERIFIED");
    expect(result.temporal.recoveryVerifiedAt).toBe(data.incident.resolvedAt);
  });
  it("always exposes unavailable logs, metrics and deployment context as gaps", () => {
    const result = buildDiagnosticSnapshot(input(["HTTP_5XX"]));
    expect(result.evidenceGaps).toEqual(
      expect.arrayContaining([
        "NO_APPLICATION_LOGS",
        "NO_RESOURCE_METRICS",
        "NO_DEPLOYMENT_CONTEXT",
      ]),
    );
  });
  it("redacts direct secret text helper", () =>
    expect(redactDiagnosticText("api_key=abc123")).toBe("[REDACTED]"));
});
