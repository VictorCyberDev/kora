import { describe,expect,it } from 'vitest';
import { buildApi } from './app.js';
const known=crypto.randomUUID();
const store={listServices:async()=>[],getService:async(id:string)=>id===known?{id}:null,listIncidents:async()=>[],getIncident:async(id:string)=>id===known?{id}:null,getIncidentEvents:async()=>[],getIncidentEvidence:async()=>[]} as any;
describe('API contracts',()=>{it('returns an incident through API',async()=>{const app=buildApi(store,'test');const r=await app.inject(`/incidents/${known}`);expect(r.statusCode).toBe(200);expect(r.json().data.id).toBe(known);await app.close();});it('returns 404 for unknown incident',async()=>{const app=buildApi(store,'test');const r=await app.inject(`/incidents/${crypto.randomUUID()}`);expect(r.statusCode).toBe(404);await app.close();});it('rejects invalid IDs',async()=>{const app=buildApi(store,'test');const r=await app.inject('/incidents/not-a-uuid');expect(r.statusCode).toBe(500);await app.close();});});
