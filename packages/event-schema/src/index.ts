import { z } from 'zod';

export const EVENT_SCHEMA_VERSION = 1 as const;

const id = z.string().uuid();
const isoTime = z.string().datetime({ offset: true });
const basePayload = z.record(z.string(), z.unknown());

export const eventTypes = [
  'ServiceRegistered','MetricObserved','HealthCheckSucceeded','HealthCheckFailed',
  'IncidentCreated','IncidentUpdated','DeploymentObserved','DiagnosisGenerated',
  'ActionProposed','ActionApproved','ActionRejected','ActionExecuted','ActionFailed',
  'RecoveryVerified','RecoveryFailed',
] as const;
export type EventType = (typeof eventTypes)[number];

export const domainEventSchema = z.object({
  eventId: id,
  eventType: z.enum(eventTypes),
  schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
  occurredAt: isoTime,
  source: z.string().min(1).max(100),
  serviceId: id.optional(),
  correlationId: id.optional(),
  payload: basePayload,
}).superRefine((event, ctx) => {
  const serviceRequired: EventType[] = ['ServiceRegistered','MetricObserved','HealthCheckSucceeded','HealthCheckFailed','IncidentCreated','IncidentUpdated','DeploymentObserved','RecoveryVerified','RecoveryFailed'];
  if (serviceRequired.includes(event.eventType) && !event.serviceId) {
    ctx.addIssue({ code: 'custom', path: ['serviceId'], message: `${event.eventType} requires serviceId` });
  }
});

export type DomainEvent = z.infer<typeof domainEventSchema>;

export function parseDomainEvent(input: unknown): DomainEvent {
  return domainEventSchema.parse(input);
}

export type ProposedActionType = 'restart_service' | 'redeploy' | 'rollback_deployment' | 'scale_service' | 'clear_cache' | 'run_health_check';
export interface ProposedAction {
  actionId: string;
  type: ProposedActionType;
  serviceId: string;
  parameters: Readonly<Record<string, unknown>>;
  reason: string;
}

export type PolicyDecision = 'DENY' | 'REQUIRE_APPROVAL' | 'ALLOW';
