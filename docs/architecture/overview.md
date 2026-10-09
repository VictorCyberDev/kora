# Kora architecture

## Problem and principles

Kora is a reliability control plane for cloud infrastructure. It separates fact collection from interpretation and action: deterministic components collect observations and detect incidents; future AI reasons only over structured evidence; policy gates typed actions; executors act with constrained credentials; observed health verifies recovery.

```mermaid
flowchart LR
  D[Demo workload] -->|GET /health| M[Health monitor]
  M --> O[(PostgreSQL observations)]
  M --> I[Deterministic incident engine]
  I --> E[(Incidents + evidence + events)]
  E --> A[Kora API]
  E -. future .-> R[Reasoning engine]
  R -. recommendations .-> P[Policy]
  P -. typed approved action .-> X[Executor / provider adapter]
  X -. outcome .-> V[Verifier]
  V -. observed health .-> E
```

## Current responsibilities

`apps/demo-service` supplies a real controllable health endpoint. `apps/api` owns HTTP API, PostgreSQL persistence and the Milestone 1 monitor runtime. `services/incident-engine` is deterministic, state-transition logic independent of I/O. `packages/event-schema` defines the v1 durable event envelope. `packages/topology` establishes lightweight dependency contracts. PostgreSQL is the system of record.

## Event and incident flow

Each check persists a structured observation and HealthCheckSucceeded/Failed event. Three failures by default create one incident. The deduplication key is `<service UUID>:health-check-unhealthy`; PostgreSQL also enforces one unresolved incident per key. Continued failures attach evidence to that incident. Three successes by default confirm recovery, persist recovery evidence, resolve the incident and record RecoveryVerified. Thresholds are configuration.

Lifecycle vocabulary is `DETECTED → INVESTIGATING → ACTION_PROPOSED → AWAITING_APPROVAL → REMEDIATING → VERIFYING → RESOLVED|FAILED`; Milestone 1 intentionally uses only DETECTED and RESOLVED. Severity is deliberately small: threshold detection is HIGH; twice-threshold sustained detection can be CRITICAL in domain logic. It is not a risk score.

Evidence is structured and references immutable observations: time, status, latency, timeout, reason/category and threshold count. It is not generated prose. This makes future diagnoses traceable.

## System graph direction

Topology currently models components and explicit `depends_on` relationships only. Future graph enrichment can add provider resources, instances and runtime edges without introducing graph algorithms prematurely.

## Provider and AI boundaries

Core packages do not import RumptyCloud code. Provider-specific behavior belongs in `integrations/rumptycloud`; no API is fabricated in Milestone 1. Future reasoning consumes incident evidence, topology, deployments and recent changes and returns a structured diagnosis: likely cause, confidence, evidence references, affected components, recommended typed action and risk notes. It receives neither unrestricted cloud credentials nor an arbitrary command execution primitive. If AI is unavailable, monitoring and deterministic incident detection continue.

Future remediation is `ProposedAction → Policy(DENY|REQUIRE_APPROVAL|ALLOW) → typed executor → observation window → RecoveryVerified|RecoveryFailed`. HTTP 200 from an action is never proof of recovery.

## Trust boundaries

Clients are untrusted at the API boundary. Health responses are untrusted telemetry. PostgreSQL is trusted durable state but may be unavailable. Future agents, reasoning providers and provider APIs are separate trust zones. Cloud credentials terminate at provider/executor boundaries, not reasoning.

## Failure behavior

Unreachable/DNS/timeout checks become failed observations with categories. Malformed boundary data is rejected by Zod. Event IDs are idempotency keys in PostgreSQL. Late/out-of-order event handling is not solved yet; timestamps are retained for future ordering rules. On PostgreSQL failure the current monitor iteration fails loudly rather than claiming state was persisted. Restart reconstruction of in-memory consecutive counters is a known Milestone 1 limitation; durable incidents/evidence remain. Future AI/provider outages must not stop deterministic detection. Half-completed remediation will require explicit action state and verification in later milestones.

## Current limitations

Single configured monitored service per API process; in-memory threshold counters; no authentication/RBAC; no AI, executor, policy implementation, provider API client, console or autonomous remediation. These are deliberate scope boundaries.
