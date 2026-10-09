# Kora Milestone 1 threat model

## Assets and trust boundaries

Kora protects infrastructure truth (observations/incidents/events), PostgreSQL credentials, future provider credentials and the future remediation authority. Boundaries are: untrusted user/client → Kora API; Kora monitor → untrusted demo/workload HTTP; Kora processes → PostgreSQL; and, later, Kora agent, AI reasoning provider, provider adapter and executor. Future cloud credentials belong only at the provider/executor boundary.

## Current threats and controls

- **Failure injection abuse:** `/dev/failure` and `/dev/recover` could manufacture outages. They fail closed and return 404 unless `DEMO_FAILURE_INJECTION_ENABLED=true`. Production deployment must leave it false and preferably network-restrict the demo workload.
- **Malformed identifiers/config/telemetry:** Zod validates environment configuration, API UUIDs, observations and event envelopes. Invalid event types/schema versions are rejected.
- **SQL injection:** database values use `postgres` tagged-template parameterization. The migration runner is the only `unsafe` query and executes repository-owned static SQL, never user input.
- **Secret leakage:** `.env*` is ignored except `.env.example`; examples contain only local development credentials. No provider credentials exist. Logs use selected structured fields; health response bodies and environment variables are not logged.
- **Incident/event duplication:** event IDs and evidence uniqueness are database-enforced; unresolved incident deduplication is protected by a partial unique index as well as domain correlation.
- **Error disclosure:** API responses use stable error bodies and request IDs; production does not serialize stack traces to clients. Internal errors remain in structured server logs.
- **SSRF:** `MONITOR_HEALTH_URL` is operator configuration, not an API-controlled URL. If dynamic service registration is exposed later, URL allowlisting/network policy becomes mandatory.
- **Unauthorized reads:** Milestone 1 has no authentication. Therefore the API must not be internet-exposed with sensitive infrastructure data. Authentication/RBAC is required before production multi-user exposure.
- **Arbitrary execution:** there is no shell executor. Future actions are typed; reasoning cannot submit raw commands or hold cloud credentials.

## Future-specific threats

Agent impersonation/replay requires workload identity and signed/authenticated telemetry. AI prompt injection through logs/evidence requires strict structured inputs/outputs and treating model output as untrusted recommendations. Provider credential theft requires least-privilege scoped credentials, rotation and redaction. Action replay/confused-deputy risks require action IDs, policy binding, approvals, idempotency and audit records. Partial remediation requires durable action state plus independent verification rather than trusting provider success responses.

## Availability/failure posture

PostgreSQL loss prevents durable truth, so Kora fails the affected operation loudly instead of silently buffering an authoritative incident in memory. Workload DNS/network/timeouts are observations, not Kora crashes. Future AI or RumptyCloud API outages must degrade diagnosis/action capabilities while deterministic monitoring continues.

## Residual Milestone 1 risks

No API auth, no TLS termination owned by the app, single-process in-memory consecutive counters, no distributed monitor leader election, and no restart reconstruction of threshold streaks. These are explicit deployment constraints, not hidden assumptions.
