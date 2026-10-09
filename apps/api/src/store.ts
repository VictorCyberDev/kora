import postgres from 'postgres';
import { parseDomainEvent, type DomainEvent } from '@kora/event-schema';
import type { IncidentSnapshot, TelemetryObservation } from '@kora/incident-engine';

export class KoraStore {
  constructor(private readonly sql: postgres.Sql) {}
  async ensureService(name: string, healthUrl: string) {
    const rows = await this.sql`INSERT INTO services (id,name,health_url) VALUES (${crypto.randomUUID()},${name},${healthUrl}) ON CONFLICT(name) DO UPDATE SET health_url=EXCLUDED.health_url RETURNING id,name,health_url,created_at`;
    return rows[0]!;
  }
  async recordObservation(o: TelemetryObservation) { await this.sql`INSERT INTO telemetry_observations(id,service_id,observed_at,healthy,http_status,latency_ms,timed_out,failure_reason,failure_category) VALUES(${o.id},${o.serviceId},${o.observedAt},${o.healthy},${o.httpStatus},${Math.round(o.latencyMs)},${o.timedOut},${o.failureReason},${o.failureCategory}) ON CONFLICT(id) DO NOTHING`; }
  async recordEvent(event: DomainEvent) { const e=parseDomainEvent(event); await this.sql`INSERT INTO domain_events(event_id,event_type,schema_version,occurred_at,source,service_id,correlation_id,payload) VALUES(${e.eventId},${e.eventType},${e.schemaVersion},${e.occurredAt},${e.source},${e.serviceId ?? null},${e.correlationId ?? null},${this.sql.json(e.payload)}) ON CONFLICT(event_id) DO NOTHING`; }
  async createIncident(i: IncidentSnapshot) { await this.sql.begin(async tx => { await tx`INSERT INTO incidents(id,service_id,deduplication_key,state,severity,started_at,resolved_at) VALUES(${i.id},${i.serviceId},${i.deduplicationKey},${i.state},${i.severity},${i.startedAt},${i.resolvedAt})`; for (let n=0;n<i.evidence.length;n++) { const o=i.evidence[n]!; await tx`INSERT INTO incident_evidence(id,incident_id,observation_id,evidence_kind,threshold_count) VALUES(${crypto.randomUUID()},${i.id},${o.id},'trigger',${n+1}) ON CONFLICT(incident_id,observation_id) DO NOTHING`; } }); }
  async appendEvidence(incidentId:string,o:TelemetryObservation,kind:'ongoing'|'recovery',count:number) { await this.sql`INSERT INTO incident_evidence(id,incident_id,observation_id,evidence_kind,threshold_count) VALUES(${crypto.randomUUID()},${incidentId},${o.id},${kind},${count}) ON CONFLICT(incident_id,observation_id) DO NOTHING`; }
  async resolveIncident(i: IncidentSnapshot) { await this.sql`UPDATE incidents SET state='RESOLVED',resolved_at=${i.resolvedAt},updated_at=now() WHERE id=${i.id}`; for(let n=0;n<i.recoveryEvidence.length;n++) await this.appendEvidence(i.id,i.recoveryEvidence[n]!,'recovery',n+1); }
  async listServices() { return this.sql`SELECT id,name,health_url,created_at FROM services ORDER BY created_at`; }
  async getService(id:string) { return (await this.sql`SELECT id,name,health_url,created_at FROM services WHERE id=${id}`)[0] ?? null; }
  async listIncidents() { return this.sql`SELECT id,service_id,deduplication_key,state,severity,started_at,resolved_at,created_at,updated_at FROM incidents ORDER BY started_at DESC`; }
  async getIncident(id:string) { return (await this.sql`SELECT id,service_id,deduplication_key,state,severity,started_at,resolved_at,created_at,updated_at FROM incidents WHERE id=${id}`)[0] ?? null; }
  async getIncidentEvents(id:string) { return this.sql`SELECT event_id,event_type,schema_version,occurred_at,source,service_id,correlation_id,payload FROM domain_events WHERE correlation_id=${id} ORDER BY occurred_at`; }
  async getIncidentEvidence(id:string) { return this.sql`SELECT e.id,e.evidence_kind,e.threshold_count,o.id observation_id,o.observed_at,o.healthy,o.http_status,o.latency_ms,o.timed_out,o.failure_reason,o.failure_category FROM incident_evidence e JOIN telemetry_observations o ON o.id=e.observation_id WHERE e.incident_id=${id} ORDER BY o.observed_at`; }
}
