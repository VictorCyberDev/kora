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
  payload: DomainEvent["payload"],
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
      category: "TIMEOUT",
      timedOut: true,
    };
  const msg =
    error instanceof Error ? error.message : "unknown health check error";
  if (/ENOTFOUND|EAI_AGAIN|dns/i.test(msg))
    return { reason: msg, category: "DNS_FAILURE", timedOut: false };
  if (/ECONNREFUSED|connection refused/i.test(msg))
    return { reason: msg, category: "CONNECTION_REFUSED", timedOut: false };
  if (/certificate|tls|ssl/i.test(msg))
    return { reason: msg, category: "TLS_FAILURE", timedOut: false };
  return { reason: msg, category: "UNKNOWN", timedOut: false };
}
function httpFailureCategory(
  status: number,
): TelemetryObservation["failureCategory"] {
  if (status >= 500) return "HTTP_5XX";
  if (status >= 400) return "HTTP_4XX";
  return "INVALID_RESPONSE";
}
export class HealthMonitor {
  private state: EngineState = initialState();
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  constructor(
    private readonly config: KoraConfig,
    private readonly store: KoraStore,
    private readonly logger: FastifyBaseLogger,
    private readonly serviceId: string,
    private readonly resourceId: string | null = null,
    private readonly providerStatus: string | null = null,
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
        failureCategory: response.ok
          ? null
          : httpFailureCategory(response.status),
        resourceId: this.resourceId,
        providerStatus: this.providerStatus,
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
        resourceId: this.resourceId,
        providerStatus: this.providerStatus,
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
          resourceId: observation.resourceId ?? null,
          httpStatus: observation.httpStatus,
          latencyMs: observation.latencyMs,
          timedOut: observation.timedOut,
          failureReason: observation.failureReason,
          failureCategory: observation.failureCategory,
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
            resourceId: this.resourceId,
            triggerObservationIds: effect.incident.evidence.map((x) => x.id),
          }),
        );
        this.logger.warn(
          {
            incidentId: effect.incident.id,
            serviceId: this.serviceId,
            resourceId: this.resourceId,
          },
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
            resourceId: this.resourceId,
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
            resourceId: this.resourceId,
            resolvedAt: effect.incident.resolvedAt,
          }),
        );
        this.logger.info(
          {
            incidentId: effect.incident.id,
            serviceId: this.serviceId,
            resourceId: this.resourceId,
          },
          "recovery verified",
        );
      }
    }
    this.logger.info(
      {
        serviceId: this.serviceId,
        resourceId: this.resourceId,
        healthy: observation.healthy,
        httpStatus: observation.httpStatus,
        latencyMs: Math.round(observation.latencyMs),
      },
      "health check completed",
    );
    return observation;
  }
  private runScheduledCheck() {
    if (this.inFlight) return;
    this.inFlight = this.checkOnce()
      .then(() => undefined)
      .catch((err) => this.logger.error({ err }, "monitor iteration failed"))
      .finally(() => {
        this.inFlight = undefined;
      });
  }
  start() {
    if (this.timer) return;
    this.runScheduledCheck();
    this.timer = setInterval(
      () => this.runScheduledCheck(),
      this.config.MONITOR_INTERVAL_MS,
    );
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }
}
