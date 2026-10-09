import { describe, expect, it } from 'vitest';
import { parseDomainEvent } from '../src/index.js';

describe('domain event validation', () => {
  it('accepts a valid health event', () => {
    expect(parseDomainEvent({
      eventId: crypto.randomUUID(), eventType: 'HealthCheckSucceeded', schemaVersion: 1,
      occurredAt: new Date().toISOString(), source: 'telemetry', serviceId: crypto.randomUUID(), payload: {},
    }).eventType).toBe('HealthCheckSucceeded');
  });

  it('rejects invalid events at runtime', () => {
    expect(() => parseDomainEvent({ eventType: 'MadeUp', schemaVersion: 99 })).toThrow();
  });
});
