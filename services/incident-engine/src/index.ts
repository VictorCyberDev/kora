import { z } from "zod";

export const failureCategorySchema = z.enum([
  "HTTP_4XX",
  "HTTP_5XX",
  "TIMEOUT",
  "CONNECTION_REFUSED",
  "DNS_FAILURE",
  "TLS_FAILURE",
  "INVALID_RESPONSE",
  "PROVIDER_UNAVAILABLE",
  "RESOURCE_STOPPED",
  "UNKNOWN",
  // Legacy Milestone 1 values remain accepted for persisted compatibility.
  "http",
  "timeout",
  "dns",
  "network",
  "invalid_response",
  "unknown",
]);

export const observationSchema = z.object({
  id: z.string().uuid(),
  serviceId: z.string().uuid(),
  observedAt: z.string().datetime({ offset: true }),
  healthy: z.boolean(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  latencyMs: z.number().nonnegative(),
  timedOut: z.boolean(),
  failureReason: z.string().nullable(),
  failureCategory: failureCategorySchema.nullable(),
  resourceId: z.string().uuid().nullable().optional(),
  providerStatus: z.string().nullable().optional(),
});
export type TelemetryObservation = z.infer<typeof observationSchema>;
export type IncidentState =
  | "DETECTED"
  | "INVESTIGATING"
  | "ACTION_PROPOSED"
  | "AWAITING_APPROVAL"
  | "REMEDIATING"
  | "VERIFYING"
  | "RESOLVED"
  | "FAILED";
export type Severity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";
export interface IncidentSnapshot {
  id: string;
  serviceId: string;
  deduplicationKey: string;
  state: IncidentState;
  severity: Severity;
  startedAt: string;
  resolvedAt: string | null;
  evidence: TelemetryObservation[];
  recoveryEvidence: TelemetryObservation[];
}
export interface EngineState {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  activeIncident: IncidentSnapshot | null;
  pendingFailureEvidence: TelemetryObservation[];
  pendingRecoveryEvidence: TelemetryObservation[];
}
export interface EngineConfig {
  failureThreshold: number;
  recoveryThreshold: number;
}
export type EngineEffect =
  | { type: "incident_created"; incident: IncidentSnapshot }
  | { type: "incident_updated"; incident: IncidentSnapshot }
  | { type: "recovery_verified"; incident: IncidentSnapshot };

export const initialState = (): EngineState => ({
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  activeIncident: null,
  pendingFailureEvidence: [],
  pendingRecoveryEvidence: [],
});
export const deduplicationKey = (serviceId: string) =>
  `${serviceId}:health-check-unhealthy`;
export const severityFor = (
  failureCount: number,
  threshold: number,
): Severity => (failureCount >= threshold * 2 ? "CRITICAL" : "HIGH");

export function evaluateObservation(
  state: EngineState,
  observation: TelemetryObservation,
  config: EngineConfig,
): { state: EngineState; effects: EngineEffect[] } {
  observationSchema.parse(observation);
  if (config.failureThreshold < 1 || config.recoveryThreshold < 1)
    throw new Error("thresholds must be positive");
  if (!observation.healthy) {
    const failures = state.consecutiveFailures + 1;
    const pending = [...state.pendingFailureEvidence, observation].slice(
      -config.failureThreshold,
    );
    if (state.activeIncident) {
      const incident = {
        ...state.activeIncident,
        evidence: [...state.activeIncident.evidence, observation],
      };
      return {
        state: {
          ...state,
          consecutiveFailures: failures,
          consecutiveSuccesses: 0,
          activeIncident: incident,
          pendingFailureEvidence: [],
          pendingRecoveryEvidence: [],
        },
        effects: [{ type: "incident_updated", incident }],
      };
    }
    if (failures >= config.failureThreshold) {
      const incident: IncidentSnapshot = {
        id: crypto.randomUUID(),
        serviceId: observation.serviceId,
        deduplicationKey: deduplicationKey(observation.serviceId),
        state: "DETECTED",
        severity: severityFor(failures, config.failureThreshold),
        startedAt: pending[0]?.observedAt ?? observation.observedAt,
        resolvedAt: null,
        evidence: pending,
        recoveryEvidence: [],
      };
      return {
        state: {
          consecutiveFailures: failures,
          consecutiveSuccesses: 0,
          activeIncident: incident,
          pendingFailureEvidence: [],
          pendingRecoveryEvidence: [],
        },
        effects: [{ type: "incident_created", incident }],
      };
    }
    return {
      state: {
        ...state,
        consecutiveFailures: failures,
        consecutiveSuccesses: 0,
        pendingFailureEvidence: pending,
        pendingRecoveryEvidence: [],
      },
      effects: [],
    };
  }
  if (!state.activeIncident)
    return {
      state: {
        ...state,
        consecutiveFailures: 0,
        consecutiveSuccesses: state.consecutiveSuccesses + 1,
        pendingFailureEvidence: [],
        pendingRecoveryEvidence: [],
      },
      effects: [],
    };
  const successes = state.consecutiveSuccesses + 1;
  const recoveryEvidence = [
    ...state.pendingRecoveryEvidence,
    observation,
  ].slice(-config.recoveryThreshold);
  if (successes >= config.recoveryThreshold) {
    const incident = {
      ...state.activeIncident,
      state: "RESOLVED" as const,
      resolvedAt: observation.observedAt,
      recoveryEvidence,
    };
    return {
      state: {
        consecutiveFailures: 0,
        consecutiveSuccesses: successes,
        activeIncident: null,
        pendingFailureEvidence: [],
        pendingRecoveryEvidence: [],
      },
      effects: [{ type: "recovery_verified", incident }],
    };
  }
  return {
    state: {
      ...state,
      consecutiveFailures: 0,
      consecutiveSuccesses: successes,
      pendingFailureEvidence: [],
      pendingRecoveryEvidence: recoveryEvidence,
    },
    effects: [],
  };
}
