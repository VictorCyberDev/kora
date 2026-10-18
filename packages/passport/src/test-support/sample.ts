import { readFileSync } from "node:fs";
import { hash, diagnosisHashInput, passportHashInput } from "../index.js";

type Json = Record<string, unknown>;

/** A real snapshot produced by the original buildDiagnosticSnapshot(). */
function realSnapshot(): Json {
  const file = JSON.parse(
    readFileSync(
      new URL("../../test-fixtures/golden-vectors.json", import.meta.url),
      "utf8",
    ),
  ) as { vectors: Array<{ kind: string; name?: string; snapshot?: Json }> };
  const found = file.vectors.find(
    (v) => v.kind === "snapshot" && v.name === "three-5xx-provider-running",
  );
  return structuredClone(found!.snapshot!);
}

function withHash<T extends Json>(item: T): T & { contentHash: string } {
  return { ...item, contentHash: hash(item) };
}

/** Re-seals every hash the way an exporter would. Test helper only. */
export function seal(passport: Json): Json {
  const diagnosis = passport.diagnosis as Json;
  diagnosis.evidence = (diagnosis.evidence as Json[]).map((e) => {
    const { contentHash: _drop, ...rest } = e;
    void _drop;
    return withHash(rest);
  });
  diagnosis.contentHash = hash(diagnosisHashInput(diagnosis));
  passport.evidence = (passport.evidence as Json[]).map((e) => {
    const { contentHash: _drop, ...rest } = e;
    void _drop;
    return withHash(rest);
  });
  (passport.integrity as Json).contentHash = hash(passportHashInput(passport));
  return passport;
}

/** A complete, valid, sealed Passport built from a real diagnosis snapshot. */
export function samplePassport(): Json {
  const diagnosis = realSnapshot();
  return seal({
    schema: "kora.incident-passport/v1",
    incident: {
      id: "00000000-0000-4000-8000-000000000001",
      serviceId: "00000000-0000-4000-8000-000000000002",
      state: "DETECTED",
      severity: "HIGH",
      startedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
    },
    service: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "demo-service",
      healthUrl: "http://example.invalid/health",
    },
    resource: {
      id: "r1",
      provider: "rumptycloud",
      providerResourceId: "rc-123",
      status: "RUNNING",
    },
    evidence: [
      {
        id: "e1",
        observedAt: "2026-01-01T00:00:00.000Z",
        healthy: false,
        httpStatus: 503,
        latencyMs: 12.5,
        failureCategory: "HTTP_5XX",
      },
      {
        id: "e2",
        observedAt: "2026-01-01T00:00:10.000Z",
        healthy: false,
        httpStatus: 503,
        latencyMs: 0.1,
        failureCategory: "HTTP_5XX",
      },
    ],
    timeline: [
      {
        occurredAt: "2026-01-01T00:00:31.000Z",
        eventType: "IncidentCreated",
        source: "incident-engine",
        payload: { severity: "HIGH" },
      },
    ],
    diagnosis,
    gaps: [
      {
        item: "rootCause",
        status: "UNKNOWN",
        reason: "Available evidence does not establish a root cause.",
      },
      {
        item: "applicationLogs",
        status: "NOT COLLECTED",
        reason: "Kora does not collect application logs.",
      },
    ],
    integrity: {
      algorithm: "sha256",
      canonicalization: "kora-stable-json/v1",
      contentHash: "",
    },
    generatedAt: "2026-01-02T03:04:05.000Z",
  });
}
