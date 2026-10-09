import type { FastifyBaseLogger } from "fastify";
import { EVENT_SCHEMA_VERSION, type DomainEvent } from "@kora/event-schema";
import {
  evaluateObservation,
  initialState,
  type EngineState,
  type TelemetryObservation,
} from "@kora/incident-engine";
import type { KoraConfig } from "./config.js";
import { KoraStore } from "./store.js";

function event(
  eventType: DomainEvent["eventType"],
  serviceId: string,
  correlationId: string | undefined,
  payload: Record<string, unknown>,
): DomainEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    schemaVersion: EVENT_SCHEMA_VERSION,
    occurredAt: new Date().toISOString(),
    source: "kora-api",
    serviceId,
    ...(correlationId ? { correlationId } : {}),
    payload,
  };
}
function classify(error: unknown): {
  reason: string;
  category: TelemetryObservation["failureCategory"];
  timedOut: boolean;
} {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
    return {
      reason: "health check timed out",
      category: "timeout",
      timedOut: true,
    };
  const msg =
    error instanceof Error ? error.message : "unknown health check error";
  if (/ENOTFOUND|EAI_AGAIN|dns/i.test(msg))
    return { reason: msg, category: "dns", timedOut: false };
  return { reason: msg, category: "network", timedOut: false };
}
export class HealthMonitor {
  private state: EngineState = initialState();
  private timer: NodeJS.Timeout | undefined;
  constructor(
    private readonly config: KoraConfig,
    private readonly store: KoraStore,
    private readonly logger: FastifyBaseLogger,
    private readonly serviceId: string,
  ) {}
  async checkOnce() {
    const started = performance.now();
    let observation: TelemetryObservation;
    try {
      const response = await fetch(this.config.MONITOR_HEALTH_URL, {
        signal: AbortSignal.timeout(this.config.MONITOR_TIMEOUT_MS),
      });
      observation = {
        id: crypto.randomUUID(),
        serviceId: this.serviceId,
        observedAt: new Date().toISOString(),
        healthy: response.ok,
        httpStatus: response.status,
        latencyMs: performance.now() - started,
        timedOut: false,
        failureReason: response.ok
          ? null
          : `health endpoint returned ${response.status}`,
        failureCategory: response.ok ? null : "http",
      };
    } catch (error) {
      const c = classify(error);
      observation = {
        id: crypto.randomUUID(),
        serviceId: this.serviceId,
        observedAt: new Date().toISOString(),
        healthy: false,
        httpStatus: null,
        latencyMs: performance.now() - started,
        timedOut: c.timedOut,
        failureReason: c.reason,
        failureCategory: c.category,
      };
    }
    await this.store.recordObservation(observation);
    await this.store.recordEvent(
      event(
        observation.healthy ? "HealthCheckSucceeded" : "HealthCheckFailed",
        this.serviceId,
        this.state.activeIncident?.id,
        {
          observationId: observation.id,
          httpStatus: observation.httpStatus,
          latencyMs: observation.latencyMs,
          timedOut: observation.timedOut,
          failureReason: observation.failureReason,
        },
      ),
    );
    const result = evaluateObservation(this.state, observation, {
      failureThreshold: this.config.MONITOR_FAILURE_THRESHOLD,
      recoveryThreshold: this.config.MONITOR_RECOVERY_THRESHOLD,
    });
    this.state = result.state;
    for (const effect of result.effects) {
      if (effect.type === "incident_created") {
        await this.store.createIncident(effect.incident);
        await this.store.recordEvent(
          event("IncidentCreated", this.serviceId, effect.incident.id, {
            severity: effect.incident.severity,
            deduplicationKey: effect.incident.deduplicationKey,
            triggerObservationIds: effect.incident.evidence.map((x) => x.id),
          }),
        );
        this.logger.warn(
          { incidentId: effect.incident.id, serviceId: this.serviceId },
          "incident created",
        );
      }
      if (effect.type === "incident_updated") {
        await this.store.appendEvidence(
          effect.incident.id,
          observation,
          "ongoing",
          effect.incident.evidence.length,
        );
        await this.store.recordEvent(
          event("IncidentUpdated", this.serviceId, effect.incident.id, {
            observationId: observation.id,
          }),
        );
      }
      if (effect.type === "recovery_verified") {
        await this.store.resolveIncident(effect.incident);
        await this.store.recordEvent(
          event("RecoveryVerified", this.serviceId, effect.incident.id, {
            recoveryObservationIds: effect.incident.recoveryEvidence.map(
              (x) => x.id,
            ),
            resolvedAt: effect.incident.resolvedAt,
          }),
        );
        this.logger.info(
          { incidentId: effect.incident.id, serviceId: this.serviceId },
          "recovery verified",
        );
      }
    }
    this.logger.info(
      {
        serviceId: this.serviceId,
        healthy: observation.healthy,
        httpStatus: observation.httpStatus,
        latencyMs: Math.round(observation.latencyMs),
      },
      "health check completed",
    );
    return observation;
  }
  start() {
    if (this.timer) return;
    const run = () =>
      void this.checkOnce().catch((err) =>
        this.logger.error({ err }, "monitor iteration failed"),
      );
    void this.checkOnce().catch((err) =>
      this.logger.error({ err }, "monitor iteration failed"),
    );
    this.timer = setInterval(run, this.config.MONITOR_INTERVAL_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
