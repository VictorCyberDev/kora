import { describe, expect, it } from 'vitest';
import { buildDemoService } from './app.js';

describe('demo failure controls', () => {
  it('are disabled by default', async () => { const app=buildDemoService({NODE_ENV:'test'}); const r=await app.inject({method:'POST',url:'/dev/failure'}); expect(r.statusCode).toBe(404); expect((await app.inject('/health')).statusCode).toBe(200); await app.close(); });
  it('work only when explicitly enabled', async () => { const app=buildDemoService({NODE_ENV:'test',DEMO_FAILURE_INJECTION_ENABLED:'true'}); expect((await app.inject({method:'POST',url:'/dev/failure'})).statusCode).toBe(200); expect((await app.inject('/health')).statusCode).toBe(503); await app.inject({method:'POST',url:'/dev/recover'}); expect((await app.inject('/health')).statusCode).toBe(200); await app.close(); });
});
