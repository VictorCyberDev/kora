import postgres from "postgres";
import { parseDomainEvent, type DomainEvent } from "@kora/event-schema";
import type {
  IncidentSnapshot,
  TelemetryObservation,
} from "@kora/incident-engine";
import type { ProviderResource } from "@kora/topology";
import {
  buildDiagnosticSnapshot,
  verifyDiagnosticSnapshot,
  type DiagnosticEvidence,
} from "./diagnosis.js";

export class KoraStore {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly inTx = false,
  ) {}
  /**
   * Runs `fn` in one PostgreSQL transaction. The store passed to `fn` is bound
   * to that transaction: if `fn` throws, every write made through it is rolled
   * back. Called on an already-transactional store it joins the outer one.
   */
  async inTransaction<T>(fn: (tx: KoraStore) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    return (await this.sql.begin((tx) =>
      fn(new KoraStore(tx as unknown as postgres.Sql, true)),
    )) as T;
  }
  async ensureService(name: string, healthUrl: string) {
    const rows = await this
      .sql`INSERT INTO services (id,name,health_url) VALUES (${crypto.randomUUID()},${name},${healthUrl}) ON CONFLICT(name) DO UPDATE SET health_url=EXCLUDED.health_url RETURNING id,name,health_url,created_at`;
    return rows[0]!;
  }
  async ensureProviderResource(resource: ProviderResource) {
    const rows = await this.sql`
      INSERT INTO provider_resources(id,provider,provider_account,region,resource_type,provider_resource_id,display_name,environment,provider_status,metadata)
      VALUES(${crypto.randomUUID()},${resource.provider},${resource.providerAccount},${resource.region},${resource.resourceType},${resource.providerResourceId},${resource.displayName ?? null},${resource.environment},${resource.status ?? null},${this.sql.json(resource.metadata)})
      ON CONFLICT(provider,provider_account,region,resource_type,provider_resource_id)
      DO UPDATE SET display_name=EXCLUDED.display_name,environment=EXCLUDED.environment,provider_status=EXCLUDED.provider_status,metadata=EXCLUDED.metadata,updated_at=now()
      RETURNING id,provider,provider_account,region,resource_type,provider_resource_id,display_name,environment,provider_status,metadata,created_at,updated_at`;
    return rows[0]!;
  }
  async bindServiceToResource(serviceId: string, resourceId: string) {
    await this
      .sql`INSERT INTO service_resource_bindings(service_id,resource_id,relationship) VALUES(${serviceId},${resourceId},'RUNS_ON') ON CONFLICT DO NOTHING`;
  }
  async recordObservation(o: TelemetryObservation) {
    await this.sql`
      INSERT INTO telemetry_observations(id,service_id,observed_at,healthy,http_status,latency_ms,timed_out,failure_reason,failure_category,resource_id,provider_status)
      VALUES(${o.id},${o.serviceId},${o.observedAt},${o.healthy},${o.httpStatus},${Math.round(o.latencyMs)},${o.timedOut},${o.failureReason},${o.failureCategory},${o.resourceId ?? null},${o.providerStatus ?? null})
      ON CONFLICT(id) DO NOTHING`;
  }
  async recordEvent(event: DomainEvent) {
    const e = parseDomainEvent(event);
    await this.sql`
      INSERT INTO domain_events(event_id,event_type,schema_version,occurred_at,source,service_id,correlation_id,payload)
      VALUES(${e.eventId},${e.eventType},${e.schemaVersion},${e.occurredAt},${e.source},${e.serviceId ?? null},${e.correlationId ?? null},${this.sql.json(e.payload)})
      ON CONFLICT(event_id) DO NOTHING`;
  }
  async createIncident(i: IncidentSnapshot) {
    await this.inTransaction(async ({ sql: tx }) => {
      await tx`INSERT INTO incidents(id,service_id,deduplication_key,state,severity,started_at,resolved_at) VALUES(${i.id},${i.serviceId},${i.deduplicationKey},${i.state},${i.severity},${i.startedAt},${i.resolvedAt})`;
      for (let n = 0; n < i.evidence.length; n++) {
        const o = i.evidence[n]!;
        await tx`INSERT INTO incident_evidence(id,incident_id,observation_id,evidence_kind,threshold_count) VALUES(${crypto.randomUUID()},${i.id},${o.id},'trigger',${n + 1}) ON CONFLICT(incident_id,observation_id) DO NOTHING`;
      }
    });
  }
  /** The unresolved incident for this deduplication key (the identity enforced
   * by one_active_incident_per_key) with its trigger+ongoing evidence. */
  async getOpenIncident(key: string): Promise<IncidentSnapshot | null> {
    const incident = (
      await this
        .sql`SELECT id,service_id,deduplication_key,state,severity,started_at FROM incidents WHERE deduplication_key=${key} AND resolved_at IS NULL`
    )[0];
    if (!incident) return null;
    const rows = await this.sql`
      SELECT o.id,o.service_id,o.observed_at,o.healthy,o.http_status,o.latency_ms,o.timed_out,o.failure_reason,o.failure_category,o.resource_id,o.provider_status
      FROM incident_evidence e JOIN telemetry_observations o ON o.id=e.observation_id
      WHERE e.incident_id=${incident.id as string} AND e.evidence_kind IN ('trigger','ongoing')
      ORDER BY e.threshold_count,o.observed_at,o.id`;
    return {
      id: String(incident.id),
      serviceId: String(incident.service_id),
      deduplicationKey: String(incident.deduplication_key),
      state: incident.state as IncidentSnapshot["state"],
      severity: incident.severity as IncidentSnapshot["severity"],
      startedAt: new Date(incident.started_at as string | Date).toISOString(),
      resolvedAt: null,
      evidence: rows.map((o) => ({
        id: String(o.id),
        serviceId: String(o.service_id),
        observedAt: new Date(o.observed_at as string | Date).toISOString(),
        healthy: Boolean(o.healthy),
        httpStatus: o.http_status === null ? null : Number(o.http_status),
        latencyMs: Number(o.latency_ms),
        timedOut: Boolean(o.timed_out),
        failureReason:
          o.failure_reason === null ? null : String(o.failure_reason),
        failureCategory: (o.failure_category ??
          null) as TelemetryObservation["failureCategory"],
        resourceId: o.resource_id === null ? null : String(o.resource_id),
        providerStatus:
          o.provider_status === null ? null : String(o.provider_status),
      })),
      recoveryEvidence: [],
    };
  }
  async appendEvidence(
    incidentId: string,
    o: TelemetryObservation,
    kind: "ongoing" | "recovery",
    count: number,
  ) {
    await this
      .sql`INSERT INTO incident_evidence(id,incident_id,observation_id,evidence_kind,threshold_count) VALUES(${crypto.randomUUID()},${incidentId},${o.id},${kind},${count}) ON CONFLICT(incident_id,observation_id) DO NOTHING`;
  }
  async resolveIncident(i: IncidentSnapshot) {
    await this.inTransaction(async ({ sql: tx }) => {
      await tx`UPDATE incidents SET state='RESOLVED',resolved_at=${i.resolvedAt},updated_at=now() WHERE id=${i.id}`;
      for (let n = 0; n < i.recoveryEvidence.length; n++) {
        const o = i.recoveryEvidence[n]!;
        await tx`INSERT INTO incident_evidence(id,incident_id,observation_id,evidence_kind,threshold_count) VALUES(${crypto.randomUUID()},${i.id},${o.id},'recovery',${n + 1}) ON CONFLICT(incident_id,observation_id) DO NOTHING`;
      }
    });
  }
  async listServices() {
    return this.sql`
      SELECT s.id,s.name,s.health_url,s.created_at,
        CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'provider',r.provider,'providerAccount',r.provider_account,'region',r.region,'resourceType',r.resource_type,'providerResourceId',r.provider_resource_id,'displayName',r.display_name,'environment',r.environment,'status',r.provider_status) END AS resource
      FROM services s LEFT JOIN service_resource_bindings b ON b.service_id=s.id AND b.relationship='RUNS_ON' LEFT JOIN provider_resources r ON r.id=b.resource_id ORDER BY s.created_at`;
  }
  async getService(id: string) {
    return (
      (
        await this.sql`
      SELECT s.id,s.name,s.health_url,s.created_at,
        CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'provider',r.provider,'providerAccount',r.provider_account,'region',r.region,'resourceType',r.resource_type,'providerResourceId',r.provider_resource_id,'displayName',r.display_name,'environment',r.environment,'status',r.provider_status) END AS resource
      FROM services s LEFT JOIN service_resource_bindings b ON b.service_id=s.id AND b.relationship='RUNS_ON' LEFT JOIN provider_resources r ON r.id=b.resource_id WHERE s.id=${id}`
      )[0] ?? null
    );
  }
  async listIncidents() {
    return this.sql`
      SELECT i.id,i.service_id,i.deduplication_key,i.state,i.severity,i.started_at,i.resolved_at,i.created_at,i.updated_at,s.name AS service_name,
        CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'provider',r.provider,'providerAccount',r.provider_account,'region',r.region,'resourceType',r.resource_type,'providerResourceId',r.provider_resource_id,'displayName',r.display_name,'environment',r.environment,'status',r.provider_status) END AS resource
      FROM incidents i JOIN services s ON s.id=i.service_id LEFT JOIN service_resource_bindings b ON b.service_id=s.id AND b.relationship='RUNS_ON' LEFT JOIN provider_resources r ON r.id=b.resource_id ORDER BY i.started_at DESC`;
  }
  async getIncident(id: string) {
    return (
      (
        await this.sql`
      SELECT i.id,i.service_id,i.deduplication_key,i.state,i.severity,i.started_at,i.resolved_at,i.created_at,i.updated_at,s.name AS service_name,
        CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'provider',r.provider,'providerAccount',r.provider_account,'region',r.region,'resourceType',r.resource_type,'providerResourceId',r.provider_resource_id,'displayName',r.display_name,'environment',r.environment,'status',r.provider_status) END AS resource
      FROM incidents i JOIN services s ON s.id=i.service_id LEFT JOIN service_resource_bindings b ON b.service_id=s.id AND b.relationship='RUNS_ON' LEFT JOIN provider_resources r ON r.id=b.resource_id WHERE i.id=${id}`
      )[0] ?? null
    );
  }
  async getIncidentEvents(id: string) {
    return this
      .sql`SELECT event_id,event_type,schema_version,occurred_at,source,service_id,correlation_id,payload FROM domain_events WHERE correlation_id=${id} ORDER BY occurred_at,event_id`;
  }
  async getIncidentEvidence(id: string) {
    return this.sql`
      SELECT e.id,e.created_at AS ingested_at,e.evidence_kind,e.threshold_count,o.id observation_id,o.service_id,o.observed_at,o.healthy,o.http_status,o.latency_ms,o.timed_out,o.failure_reason,o.failure_category,o.provider_status,
        CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'provider',r.provider,'providerResourceId',r.provider_resource_id,'region',r.region,'environment',r.environment) END AS resource
      FROM incident_evidence e JOIN telemetry_observations o ON o.id=e.observation_id LEFT JOIN provider_resources r ON r.id=o.resource_id WHERE e.incident_id=${id} ORDER BY o.observed_at,e.id`;
  }
  async getIncidentTimeline(id: string) {
    return this.sql`
      SELECT occurred_at,event_type,source,payload FROM domain_events WHERE correlation_id=${id}
      UNION ALL
      SELECT o.observed_at,CASE WHEN o.healthy THEN 'HealthObservationSucceeded' ELSE 'HealthObservationFailed' END,'health-monitor',jsonb_build_object('observationId',o.id,'healthy',o.healthy,'httpStatus',o.http_status,'latencyMs',o.latency_ms,'failureCategory',o.failure_category,'providerStatus',o.provider_status,'resourceId',o.resource_id)
      FROM incident_evidence e JOIN telemetry_observations o ON o.id=e.observation_id WHERE e.incident_id=${id}
      ORDER BY occurred_at,event_type`;
  }
  async createDiagnosticSnapshot(id: string) {
    const incident = await this.getIncident(id);
    if (!incident) return null;
    const rows = await this.getIncidentEvidence(id);
    const events = await this.getIncidentEvents(id);
    const evidence: Omit<DiagnosticEvidence, "contentHash">[] = rows.map(
      (row) => ({
        id: String(row.observation_id),
        incidentId: id,
        serviceId: String(row.service_id),
        resourceId: row.resource
          ? String((row.resource as { id: string }).id)
          : null,
        source: "HEALTH_CHECK",
        type: row.healthy ? "HealthCheckSucceeded" : "HealthCheckFailed",
        observedAt: new Date(row.observed_at as string | Date).toISOString(),
        ingestedAt: new Date(row.ingested_at as string | Date).toISOString(),
        healthy: Boolean(row.healthy),
        httpStatus: row.http_status === null ? null : Number(row.http_status),
        failureCategory:
          row.failure_category === null ? null : String(row.failure_category),
        providerStatus:
          row.provider_status === null ? null : String(row.provider_status),
        provenance: "kora:health-monitor",
      }),
    );
    const recoveryVerified = events.some(
      (row) => row.event_type === "RecoveryVerified",
    );
    const incidentCreated = events.find(
      (row) => row.event_type === "IncidentCreated",
    );
    const thresholdEvidence = rows
      .filter((row) => row.evidence_kind === "trigger")
      .reduce<(typeof rows)[number] | null>((latest, row) => {
        if (!latest) return row;
        return Number(row.threshold_count) > Number(latest.threshold_count)
          ? row
          : latest;
      }, null);
    const latestEvidenceAt = evidence.at(-1)?.observedAt;
    const snapshot = buildDiagnosticSnapshot({
      incident: {
        id,
        serviceId: String(incident.service_id),
        state: String(incident.state),
        startedAt: new Date(incident.started_at as string | Date).toISOString(),
        resolvedAt: incident.resolved_at
          ? new Date(incident.resolved_at as string | Date).toISOString()
          : null,
        detectedAt: incidentCreated
          ? new Date(incidentCreated.occurred_at as string | Date).toISOString()
          : null,
        thresholdCrossedAt: thresholdEvidence
          ? new Date(
              thresholdEvidence.observed_at as string | Date,
            ).toISOString()
          : null,
      },
      resource: incident.resource
        ? {
            id: String((incident.resource as { id: string }).id),
            provider: String(
              (incident.resource as { provider: string }).provider,
            ),
            providerResourceId: String(
              (incident.resource as { providerResourceId: string })
                .providerResourceId,
            ),
            providerStatus: (incident.resource as { status: string | null })
              .status,
          }
        : null,
      evidence,
      recoveryVerified,
      createdAt:
        latestEvidenceAt ??
        new Date(incident.updated_at as string | Date).toISOString(),
    });
    if (!verifyDiagnosticSnapshot(snapshot))
      throw new Error(
        "diagnostic snapshot does not reproduce its content hash",
      );
    const snapshotId = crypto.randomUUID();
    await this
      .sql`INSERT INTO diagnostic_snapshots(id,incident_id,created_at,content_hash,snapshot) VALUES(${snapshotId},${id},${snapshot.createdAt},${snapshot.contentHash},${this.sql.json(snapshot as unknown as postgres.JSONValue)}) ON CONFLICT(incident_id,content_hash) DO NOTHING`;
    const persisted = (
      await this
        .sql`SELECT id FROM diagnostic_snapshots WHERE incident_id=${id} AND content_hash=${snapshot.contentHash}`
    )[0]!;
    return { snapshotId: String(persisted.id), ...snapshot };
  }
  async listDiagnosticSnapshots(id: string) {
    return this
      .sql`SELECT id,incident_id,created_at,content_hash FROM diagnostic_snapshots WHERE incident_id=${id} ORDER BY created_at,id`;
  }
  async getDiagnosticSnapshot(incidentId: string, snapshotId: string) {
    return (
      (
        await this
          .sql`SELECT id,incident_id,created_at,content_hash,snapshot FROM diagnostic_snapshots WHERE incident_id=${incidentId} AND id=${snapshotId}`
      )[0] ?? null
    );
  }
}
