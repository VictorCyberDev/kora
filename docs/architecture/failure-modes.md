# Failure modes

This companion to the architecture overview makes Milestone 1 degradation semantics explicit.

| Failure | Current behavior | Future hardening |
|---|---|---|
| Service unreachable | Failed observation, network category; streak contributes to incident | richer network cause taxonomy |
| DNS failure | Failed observation, DNS category | resolver metadata where safe |
| Health timeout | Failed observation with timeout flag | per-service adaptive budgets only if justified |
| PostgreSQL unavailable | Persistence/monitor iteration fails loudly; Kora does not claim durable state | readiness distinction, bounded retry/backoff |
| Malformed telemetry/event | Zod rejects at boundary | dead-letter/quarantine only when external ingestion exists |
| Duplicate event | `event_id` primary key makes persistence idempotent | producer idempotency contracts |
| Duplicate active incident | deterministic key plus partial unique index prevents multiple unresolved rows | transactional retry for competing monitor workers |
| Late/out-of-order event | timestamp retained; no reordering policy yet | explicit ingestion/occurrence ordering semantics |
| Kora restart | durable observations/incidents/events survive; consecutive streak counters restart | reconstruct streak/active monitor state from PostgreSQL |
| AI provider unavailable | no Milestone 1 effect; deterministic monitoring remains independent | diagnosis marked unavailable/degraded |
| RumptyCloud API unavailable | no Milestone 1 effect; no provider calls exist | typed provider errors, retries/circuit breaking where safe |
| Remediation fails halfway | not implemented | durable action phases, idempotency, compensating policy, independent verification |

The most important current limitation is restart reconstruction: PostgreSQL preserves truth, but the in-memory threshold streak is intentionally not reconstructed in Milestone 1. This must be addressed before horizontally scaling the monitor or claiming seamless restart continuity.
