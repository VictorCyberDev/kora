# ADR-008: Atomic per-check persistence and restart hydration

**Status:** Accepted

## Context

The monitor wrote the observation, its event, and each incident effect as separate statements and advanced in-memory engine state before persisting them. A failure between statements left orphan observations, incidents without `IncidentCreated`, or resolved incidents without `RecoveryVerified`. After a restart the engine started empty, tried to create a second incident, hit `one_active_incident_per_key`, kept a phantom incident in memory and never resolved the real one.

## Decision

- **Atomic check.** One transaction covers the observation, its `HealthCheck*` event, and every incident effect (create, update, resolve) with its evidence and domain event. The candidate next engine state is computed first and assigned to the live state only after the commit.
- **Event identity.** Domain events (`eventId`, `occurredAt`, `correlationId`) are built before the transaction and reused on a replay. The health event correlates to the incident active before the observation was evaluated; `Incident*` and `RecoveryVerified` events correlate to their incident.
- **Restart hydration.** PostgreSQL is authoritative. Before its first check the monitor loads the unresolved incident for the deduplication key (`resolved_at IS NULL`) with its full trigger and ongoing evidence. Pre-incident failure streaks are not persisted and restart at zero; recovery of a reloaded incident requires the full configured success count observed after startup.
- **Single-retry reconciliation.** If creation hits `one_active_incident_per_key`, the transaction rolls back, stored state is reloaded and the same observation is replayed once without a new network check. If that fails, the error is logged and in-memory state stays at the last committed state.

## Consequences

A failed transaction **loses that check** instead of persisting it partially; the next tick proceeds normally. Auditing never sees half a check. No outbox, new tables or event replay are introduced. Concurrent monitors for one service are tolerated by the unique index but not coordinated.

## Alternatives Considered

An outbox or event-sourced rebuild gives retry of lost checks but is a larger redesign. Persisting pre-incident streaks adds state that is cheap to recompute and not needed for correctness.
