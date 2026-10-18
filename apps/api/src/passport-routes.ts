import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deterministicHash, redactDiagnosticText } from "./diagnosis.js";
import type { DiagnosticSnapshot } from "./diagnosis.js";
import type { KoraStore } from "./store.js";

/**
 * Incident Passport export (ADR-011, docs/architecture/incident-passport.md).
 *
 * The Passport is INTEGRITY-EVIDENT: `integrity.contentHash` shows the file was
 * not changed after export. It is not signed and says nothing about who
 * produced it. The route is read-only and writes nothing.
 *
 * Hashing deliberately reuses deterministicHash from diagnosis.ts rather than
 * importing @kora/passport: the image's Dockerfile installs only the packages
 * it names, so the API cannot take a new workspace dependency. The offline
 * verifier in @kora/passport is held to identical bytes by shared golden
 * vectors and by tests that verify real exports with the built CLI.
 */
export const PASSPORT_SCHEMA = "kora.incident-passport/v1";
export const INTEGRITY_ALGORITHM = "sha256";
export const CANONICALIZATION = "kora-stable-json/v1";

const idParams = z.object({ id: z.string().uuid() });
type Json = Record<string, unknown>;
type Row = Record<string, unknown>;
interface Gap {
  item: string;
  status: "UNKNOWN" | "NOT COLLECTED";
  reason: string;
}

const iso = (value: unknown): string =>
  new Date(value as string | Date).toISOString();
const isoOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : iso(value);

/** A text column: its string, or null. */
const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const redacted = (value: unknown): string | null => {
  const t = text(value);
  return t === null ? null : redactDiagnosticText(t);
};

const REDACTED = "[REDACTED]";
/** Redacts string values, and any string under a secret-looking key. */
function redactDeep(value: unknown, key = ""): unknown {
  if (typeof value === "string")
    return redactDiagnosticText(key) === REDACTED
      ? REDACTED
      : redactDiagnosticText(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, key));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactDeep(v, k)]),
    );
  return value;
}

const missingEvidence: Record<DiagnosticSnapshot["evidenceGaps"][number], Gap> =
  {
    NO_RESOURCE_METRICS: {
      item: "resourceMetrics",
      status: "NOT COLLECTED",
      reason:
        "Kora does not collect resource metrics (CPU, memory, disk, network) for this resource.",
    },
    NO_APPLICATION_LOGS: {
      item: "applicationLogs",
      status: "NOT COLLECTED",
      reason: "Kora does not collect application logs from the service.",
    },
    NO_DEPLOYMENT_CONTEXT: {
      item: "deploymentContext",
      status: "NOT COLLECTED",
      reason:
        "No deployment record (revision, rollout time) is linked to this incident.",
    },
    NO_PROVIDER_STATUS: {
      item: "providerStatus",
      status: "NOT COLLECTED",
      reason:
        "None of the collected evidence carries a provider-reported resource status.",
    },
  };

function buildGaps(snapshot: DiagnosticSnapshot, hasResource: boolean): Gap[] {
  const gaps: Gap[] = snapshot.evidenceGaps.map((g) => missingEvidence[g]);
  if (snapshot.rootCause.state === "UNKNOWN")
    gaps.push({
      item: "rootCause",
      status: "UNKNOWN",
      reason: snapshot.rootCause.statement,
    });
  if (!hasResource)
    gaps.push({
      item: "resource",
      status: "UNKNOWN",
      reason:
        "The service has no bound provider resource, so provider, region and resource status are unknown.",
    });
  if (snapshot.temporal.lastKnownHealthyAt === null)
    gaps.push({
      item: "lastKnownHealthyAt",
      status: "UNKNOWN",
      reason:
        "No healthy observation precedes the first failure in the collected evidence.",
    });
  if (snapshot.temporal.recoveryVerifiedAt === null)
    gaps.push({
      item: "recoveryVerification",
      status: "UNKNOWN",
      reason: "Recovery has not been verified for this incident.",
    });
  if (snapshot.truncated)
    gaps.push({
      item: "diagnosisEvidenceLimit",
      status: "NOT COLLECTED",
      reason: `The diagnosis considered only the latest ${snapshot.evidence.length} of ${snapshot.totalEvidenceCount} evidence items.`,
    });
  gaps.push({
    item: "producer",
    status: "UNKNOWN",
    reason:
      "This Passport is not signed. Its hash shows the file was not changed after export; it does not show who produced it.",
  });
  return gaps.sort((a, b) => a.item.localeCompare(b.item));
}

/** Everything except generatedAt and integrity.contentHash. */
function hashInput(passport: Json): Json {
  const { generatedAt, integrity, ...rest } = passport;
  void generatedAt;
  const { contentHash, ...integrityRest } = integrity as Json;
  void contentHash;
  return { ...rest, integrity: integrityRest };
}

/**
 * Reads the incident and assembles its Passport. Returns null for an unknown
 * incident and `{ changed: true }` when the incident moved while it was being
 * read (the caller retries), so the document never mixes two states.
 */
async function assemble(
  store: KoraStore,
  id: string,
  now: Date,
): Promise<Json | null | { changed: true }> {
  const incident = await store.getIncident(id);
  if (!incident) return null;
  const service = await store.getService(String(incident.service_id));
  const evidenceRows: Row[] = await store.getIncidentEvidence(id);
  const timelineRows: Row[] = await store.getIncidentTimeline(id);
  const snapshot = await store.computeDiagnosticSnapshot(id);
  if (!service || !snapshot) return null;
  const unchanged =
    snapshot.incidentState === String(incident.state) &&
    snapshot.totalEvidenceCount === evidenceRows.length &&
    snapshot.evidence.every((e) =>
      evidenceRows.some((r) => String(r.observation_id) === e.id),
    );
  if (!unchanged) return { changed: true };

  const evidence = evidenceRows.map((r) => ({
    id: String(r.id),
    observationId: String(r.observation_id),
    serviceId: String(r.service_id),
    kind: String(r.evidence_kind),
    thresholdCount: Number(r.threshold_count),
    observedAt: iso(r.observed_at),
    ingestedAt: iso(r.ingested_at),
    healthy: Boolean(r.healthy),
    httpStatus: r.http_status === null ? null : Number(r.http_status),
    latencyMs: Number(r.latency_ms),
    timedOut: Boolean(r.timed_out),
    failureReason: redacted(r.failure_reason),
    failureCategory: text(r.failure_category),
    providerStatus: text(r.provider_status),
    resourceId: r.resource ? String((r.resource as { id: string }).id) : null,
  }));
  const timeline = timelineRows
    .map((r) => ({
      occurredAt: iso(r.occurred_at),
      eventType: String(r.event_type),
      source: String(r.source),
      payload: redactDeep(r.payload),
    }))
    // The query's ORDER BY leaves ties undefined; make the order a function of
    // content so repeated exports are identical.
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) ||
        a.eventType.localeCompare(b.eventType) ||
        deterministicHash(a).localeCompare(deterministicHash(b)),
    );

  const draft: Json = {
    schema: PASSPORT_SCHEMA,
    incident: {
      id: String(incident.id),
      serviceId: String(incident.service_id),
      deduplicationKey: String(incident.deduplication_key),
      state: String(incident.state),
      severity: String(incident.severity),
      startedAt: iso(incident.started_at),
      resolvedAt: isoOrNull(incident.resolved_at),
      createdAt: iso(incident.created_at),
      updatedAt: iso(incident.updated_at),
    },
    service: {
      id: String(service.id),
      name: String(service.name),
      healthUrl: redactDiagnosticText(String(service.health_url)),
      createdAt: iso(service.created_at),
    },
    resource: incident.resource ?? null,
    evidence,
    timeline,
    diagnosis: snapshot,
    gaps: buildGaps(snapshot, Boolean(incident.resource)),
    integrity: {
      algorithm: INTEGRITY_ALGORITHM,
      canonicalization: CANONICALIZATION,
      contentHash: "",
    },
    generatedAt: now.toISOString(),
  };
  // Hash exactly what goes over the wire: anything JSON would drop or rewrite
  // (undefined, Date) is normalised before it is hashed, never after.
  const wire = JSON.parse(JSON.stringify(draft)) as Json;
  wire.evidence = (wire.evidence as Json[]).map((e) => ({
    ...e,
    contentHash: deterministicHash(e),
  }));
  (wire.integrity as Json).contentHash = deterministicHash(hashInput(wire));
  return wire;
}

export function registerPassportRoutes(
  app: FastifyInstance,
  store: KoraStore,
): void {
  app.get("/incidents/:id/passport", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await assemble(store, id, new Date());
      if (result === null)
        return reply.code(404).send({ error: "not_found", requestId: req.id });
      if ("changed" in result) continue;
      return reply.header("cache-control", "no-store").send(result);
    }
    return reply
      .code(503)
      .header("retry-after", "1")
      .send({ error: "incident_changing", requestId: req.id });
  });
}
