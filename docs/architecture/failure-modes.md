# Failure modes

This companion to the architecture overview makes Milestone 1 degradation semantics explicit.

| Failure                     | Current behavior                                                                                                                                                                     | Future hardening                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Service unreachable         | Failed observation; connection refused is `CONNECTION_REFUSED`, other transport failures are classified by error code or `UNKNOWN`; streak contributes to incident                   | richer network cause taxonomy                                                     |
| DNS failure                 | Failed observation, `DNS_FAILURE` (from `ENOTFOUND`/`EAI_AGAIN`)                                                                                                                     | resolver metadata where safe                                                      |
| Health timeout              | Failed observation with timeout flag                                                                                                                                                 | per-service adaptive budgets only if justified                                    |
| PostgreSQL unavailable      | The check's transaction rolls back and the error is logged; nothing from that check is kept in storage or memory; the next tick runs normally                                        | readiness distinction, bounded retry/backoff                                      |
| Malformed telemetry/event   | Zod rejects at boundary                                                                                                                                                              | dead-letter/quarantine only when external ingestion exists                        |
| Duplicate event             | `event_id` primary key makes persistence idempotent                                                                                                                                  | producer idempotency contracts                                                    |
| Duplicate active incident   | deterministic key plus partial unique index prevents multiple unresolved rows; a losing creation rolls back, reloads the stored incident and replays the same check once             | locking/leader election for competing monitor workers                             |
| Late/out-of-order event     | timestamp retained; no reordering policy yet                                                                                                                                         | explicit ingestion/occurrence ordering semantics                                  |
| Kora restart                | the unresolved incident and its full evidence are reloaded before the first check; pre-incident failure streaks restart at zero; recovery needs the full success count after restart | persist pre-incident streaks if ever required                                     |
| AI provider unavailable     | no Milestone 1 effect; deterministic monitoring remains independent                                                                                                                  | diagnosis marked unavailable/degraded                                             |
| RumptyCloud API unavailable | no Milestone 1 effect; no provider calls exist                                                                                                                                       | typed provider errors, retries/circuit breaking where safe                        |
| Remediation fails halfway   | not implemented                                                                                                                                                                      | durable action phases, idempotency, compensating policy, independent verification |

## Restart and conflict semantics

Restart reconstruction (fixed in R0; see ADR-008):

- PostgreSQL is authoritative. Before its first check the monitor loads the unresolved incident for the service's deduplication key (`deduplicationKey(serviceId)` with `resolved_at IS NULL`, the identity enforced by `one_active_incident_per_key`) together with its full trigger and ongoing evidence, so `threshold_count` continues monotonically.
- Pre-incident failure streaks are **not** persisted. After a restart a not-yet-incident streak restarts at zero.
- With an open incident, recovery requires the full configured consecutive-success count observed **after** startup. Successes observed before the restart do not count.
- If incident creation hits `one_active_incident_per_key` (another writer already holds the incident), the check's transaction rolls back, the stored incident is loaded and the **same** observation (same id and `observedAt`, same event ids) is replayed once. No second network check is made. If the replay also fails, the error is logged, in-memory state stays at the last committed state, and the next tick proceeds normally.

Per-check atomicity: the observation, its `HealthCheck*` event and every incident effect (create, update, resolve) with its evidence and domain event commit in one transaction. The in-memory engine state advances only after the commit. A failed transaction loses that check rather than persisting part of it.

Remaining limitations: two monitors running at once for the same service are reconciled by the unique index but are not coordinated; pre-incident streaks are not durable; a lost check is not retried.
