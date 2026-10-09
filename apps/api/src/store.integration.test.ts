import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { KoraStore } from './store.js';
import type { IncidentSnapshot, TelemetryObservation } from '@kora/incident-engine';

const databaseUrl=process.env.DATABASE_URL;
const sql=databaseUrl ? postgres(databaseUrl,{max:1}) : null;
const store=sql ? new KoraStore(sql) : null;
afterAll(async()=>{if(sql) await sql.end();});

describe.skipIf(!databaseUrl)('PostgreSQL persistence',()=>{
  it('persists an incident and its structured triggering evidence',async()=>{
    const service=await store!.ensureService(`integration-${crypto.randomUUID()}`,'http://example.invalid/health');
    const serviceId=String(service.id);
    const observation:TelemetryObservation={id:crypto.randomUUID(),serviceId,observedAt:new Date().toISOString(),healthy:false,httpStatus:503,latencyMs:12,timedOut:false,failureReason:'health endpoint returned 503',failureCategory:'http'};
    await store!.recordObservation(observation);
    const incident:IncidentSnapshot={id:crypto.randomUUID(),serviceId,deduplicationKey:`${serviceId}:health-check-unhealthy`,state:'DETECTED',severity:'HIGH',startedAt:observation.observedAt,resolvedAt:null,evidence:[observation],recoveryEvidence:[]};
    await store!.createIncident(incident);
    expect((await store!.getIncident(incident.id))?.id).toBe(incident.id);
    const evidence=await store!.getIncidentEvidence(incident.id);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.evidence_kind).toBe('trigger');
    expect(evidence[0]?.observation_id).toBe(observation.id);
  });
});
