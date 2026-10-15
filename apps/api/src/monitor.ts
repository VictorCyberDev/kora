import type { FastifyBaseLogger } from "fastify";
import { EVENT_SCHEMA_VERSION, type DomainEvent } from "@kora/event-schema";
import {
  deduplicationKey,
  evaluateObservation,
  initialState,
  type EngineEffect,
  type EngineState,
  type TelemetryObservation,
} from "@kora/incident-engine";
import type { KoraConfig } from "./config.js";
import { KoraStore } from "./store.js";
import { redactProviderText } from "./providers/rumptycloud.js";

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
type Category = TelemetryObservation["failureCategory"];
interface Classified {
  reason: string;
  category: Category;
  timedOut: boolean;
}
const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);
const TIMEOUT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);
const TLS_CODE =
  /^(CERT_|DEPTH_ZERO_SELF_SIGNED_CERT$|UNABLE_TO_\w*CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE$|ERR_TLS_|ERR_SSL_)/;
const MAX_CHAIN = 16;

/** The error, then its cause chain and AggregateError members, depth first. */
function errorChain(root: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();
  const visit = (e: unknown) => {
    if (!e || typeof e !== "object" || seen.has(e) || out.length >= MAX_CHAIN)
      return;
    seen.add(e);
    const node = e as Record<string, unknown>;
    out.push(node);
    visit(node.cause);
    if (Array.isArray(node.errors)) for (const x of node.errors) visit(x);
  };
  visit(root);
  return out;
}
function sanitizeReason(message: string): string {
  return redactProviderText(
    message.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1"),
  ).slice(0, 300);
}
function describe(label: string, node: Record<string, unknown>): string {
  const code = typeof node.code === "string" ? node.code : null;
  const message = typeof node.message === "string" ? node.message : "";
  const detail = message && message !== code ? `: ${message}` : "";
  return sanitizeReason(code ? `${label} (${code})${detail}` : label + detail);
}
/**
 * Classifies a failed fetch() from stable error codes found anywhere in the
 * cause chain. Messages are never pattern-matched for classification.
 */
function classify(error: unknown): Classified {
  const chain = errorChain(error);
  for (const node of chain) {
    const code = typeof node.code === "string" ? node.code : "";
    if (node.name === "TimeoutError")
      return {
        reason: "health check timed out",
        category: "TIMEOUT",
        timedOut: true,
      };
    if (TIMEOUT_CODES.has(code))
      return {
        reason: describe("health check timed out", node),
        category: "TIMEOUT",
        timedOut: true,
      };
    if (DNS_CODES.has(code))
      return {
        reason: describe("DNS resolution failed", node),
        category: "DNS_FAILURE",
        timedOut: false,
      };
    if (code === "ECONNREFUSED")
      return {
        reason: describe("connection refused", node),
        category: "CONNECTION_REFUSED",
        timedOut: false,
      };
    if (TLS_CODE.test(code))
      return {
        reason: describe("TLS failure", node),
        category: "TLS_FAILURE",
        timedOut: false,
      };
    if (node.name === "AbortError")
      return {
        reason: "health check aborted",
        category: "UNKNOWN",
        timedOut: false,
      };
  }
  // Unrecognised: surface the most specific message (undici wraps the real
  // failure in a generic "fetch failed" TypeError).
  const specific = chain.find(
    (n, i) => i > 0 && typeof n.message === "string" && n.message,
  );
  const node = specific ?? chain[0];
  if (!node)
    return {
      reason: "unknown health check error",
      category: "UNKNOWN",
      timedOut: false,
    };
  return {
    reason: describe("health check failed", node),
    category: "UNKNOWN",
    timedOut: false,
  };
}
function httpFailureCategory(
  status: number,
): TelemetryObservation["failureCategory"] {
  if (status >= 500) return "HTTP_5XX";
  if (status >= 400) return "HTTP_4XX";
  return "INVALID_RESPONSE";
}
/** Domain events for one check, built once so a replay reuses their identity. */
type EventPlan = <T extends DomainEvent>(key: string, make: () => T) => T;
function eventPlan(): EventPlan {
  const planned = new Map<string, DomainEvent>();
  return (key, make) => {
    const existing = planned.get(key);
    if (existing) return existing as ReturnType<typeof make>;
    const created = make();
    planned.set(key, created);
    return created;
  };
}
function isActiveIncidentConflict(error: unknown): boolean {
  const e = error as { code?: unknown; constraint_name?: unknown } | null;
  return (
    e?.code === "23505" && e.constraint_name === "one_active_incident_per_key"
  );
}
export class HealthMonitor {
  private state: EngineState = initialState();
  private hydrated = false;
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
  /** PostgreSQL is authoritative: the unresolved incident (same identity as
   * the one_active_incident_per_key invariant) becomes the engine's state. */
  private async loadStoredState(): Promise<EngineState> {
    const open = await this.store.getOpenIncident(
      deduplicationKey(this.serviceId),
    );
    return { ...initialState(), activeIncident: open };
  }
  async checkOnce() {
    if (!this.hydrated) {
      this.state = await this.loadStoredState();
      this.hydrated = true;
    }
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
    await this.persist(observation);
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
  /**
   * Persists one check atomically: the observation, its HealthCheck event and
   * every incident effect with its evidence and domain event commit together
   * or not at all. The candidate next engine state is computed first and
   * becomes the live state only after the commit; on failure the check is
   * lost (never half-persisted) and the error propagates to the scheduler.
   *
   * If incident creation loses to an incident another writer already holds,
   * the transaction rolls back, the stored state is reloaded and the SAME
   * observation is replayed once (no new fetch; same event identities).
   */
  private async persist(observation: TelemetryObservation) {
    const plan = eventPlan();
    let prior = this.state;
    for (let attempt = 0; ; attempt++) {
      const priorIncidentId = prior.activeIncident?.id;
      const result = evaluateObservation(prior, observation, {
        failureThreshold: this.config.MONITOR_FAILURE_THRESHOLD,
        recoveryThreshold: this.config.MONITOR_RECOVERY_THRESHOLD,
      });
      // Events are built before the transaction and reused on a replay.
      const healthEvent = plan("health", () =>
        event(
          observation.healthy ? "HealthCheckSucceeded" : "HealthCheckFailed",
          this.serviceId,
          priorIncidentId,
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
      const effects = result.effects.map((effect) => ({
        effect,
        event: plan(`${effect.type}:${effect.incident.id}`, () =>
          this.effectEvent(effect, observation),
        ),
      }));
      try {
        await this.store.inTransaction(async (tx) => {
          await tx.recordObservation(observation);
          await tx.recordEvent(healthEvent);
          for (const { effect, event: effectEvent } of effects) {
            await this.applyEffect(tx, effect, observation);
            await tx.recordEvent(effectEvent);
          }
        });
      } catch (error) {
        if (attempt === 0 && isActiveIncidentConflict(error)) {
          this.logger.warn(
            { serviceId: this.serviceId },
            "active incident exists in storage; reconciling and replaying the check",
          );
          prior = await this.loadStoredState();
          continue;
        }
        throw error;
      }
      this.state = result.state;
      for (const { effect } of effects) this.logEffect(effect);
      return;
    }
  }
  private effectEvent(
    effect: EngineEffect,
    observation: TelemetryObservation,
  ): DomainEvent {
    const { incident } = effect;
    if (effect.type === "incident_created")
      return event("IncidentCreated", this.serviceId, incident.id, {
        severity: incident.severity,
        deduplicationKey: incident.deduplicationKey,
        resourceId: this.resourceId,
        triggerObservationIds: incident.evidence.map((x) => x.id),
      });
    if (effect.type === "incident_updated")
      return event("IncidentUpdated", this.serviceId, incident.id, {
        observationId: observation.id,
        resourceId: this.resourceId,
      });
    return event("RecoveryVerified", this.serviceId, incident.id, {
      recoveryObservationIds: incident.recoveryEvidence.map((x) => x.id),
      resourceId: this.resourceId,
      resolvedAt: incident.resolvedAt,
    });
  }
  private async applyEffect(
    tx: KoraStore,
    effect: EngineEffect,
    observation: TelemetryObservation,
  ) {
    if (effect.type === "incident_created")
      await tx.createIncident(effect.incident);
    else if (effect.type === "incident_updated")
      await tx.appendEvidence(
        effect.incident.id,
        observation,
        "ongoing",
        effect.incident.evidence.length,
      );
    else await tx.resolveIncident(effect.incident);
  }
  private logEffect(effect: EngineEffect) {
    const fields = {
      incidentId: effect.incident.id,
      serviceId: this.serviceId,
      resourceId: this.resourceId,
    };
    if (effect.type === "incident_created")
      this.logger.warn(fields, "incident created");
    if (effect.type === "recovery_verified")
      this.logger.info(fields, "recovery verified");
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
