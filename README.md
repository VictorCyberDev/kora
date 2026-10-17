# Kora

**The reliability control plane for cloud infrastructure.**

Kora observes running systems, records deterministic telemetry, turns repeated failures into evidence-backed incidents, correlates exact evidence and infrastructure context, produces deterministic symptom-level diagnoses, and verifies recovery. Generative AI is deliberately outside the source-of-truth path.

## What works now

A Fastify demo workload exposes `/health`; failure injection is disabled by default. Kora periodically checks a configured endpoint, persists observations in PostgreSQL, creates one incident after a configurable consecutive-failure threshold (default 3), retains structured evidence, and resolves only after a configurable consecutive-success threshold (default 3).

A monitored service can be bound to a durable provider resource. Incident/service/evidence API responses expose that infrastructure context, `/incidents/:id/timeline` returns a deterministic chronological evidence timeline, and Milestone 3 adds immutable diagnostic snapshots that distinguish facts, supported symptom diagnoses, contradictions, evidence gaps and unknown root cause.

```mermaid
flowchart TD
  C[Cloud / Workload] --> O[Observation]
  O --> I[Incident Detection]
  I --> E[Evidence Store]
  E --> R[Correlation Engine]
  R --> D[Deterministic Diagnosis]
  D --> S[Diagnostic Snapshot]
  S -. structured immutable input .-> AI[Future AI Reasoning — NOT IMPLEMENTED]
```

Not implemented: frontend, generative AI reasoning, automatic remediation, policy evaluation, authentication/RBAC, Kubernetes, multi-cloud, distributed monitoring, or undocumented RumptyCloud discovery/status APIs.

## Quick start

Requires Node.js 22+, pnpm 10+, Docker Compose and PostgreSQL 17 for the supplied local environment.

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
# export .env values into your shell
pnpm db:migrate
pnpm --filter @kora/demo-service dev
# separate terminal
pnpm --filter @kora/api dev
```

For a controlled local incident set `DEMO_FAILURE_INJECTION_ENABLED=true` before starting the demo service, then follow `docs/runbooks/local-incident-demo.md`. Never enable it casually in production.

Common gates: `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## Provider-aware configuration

`.env.example` is the contract. `DATABASE_URL` must be PostgreSQL. To bind a monitored endpoint to a real RumptyCloud resource, set all of `RUMPTY_WORKSPACE`, `RUMPTY_REGION`, `RUMPTY_RESOURCE_TYPE`, and `RUMPTY_RESOURCE_ID`. Partial provider identity is rejected. `RUMPTY_RESOURCE_NAME` is display metadata only.

### Container image and Rumpty Cloud

The root `Dockerfile` builds one image for both services (default command: the API; the demo service runs with `node apps/demo-service/dist/server.js`). Both servers bind `0.0.0.0` and read the platform-injected `PORT` (`API_PORT`/`DEMO_PORT` win if set). Both services serve `GET /__kora`, an unauthenticated read-only self-report (`kora.runtime-claim/v1`: service, environment, commit, build time, start time, uptime). It is a claim, not proof or attestation; see ADR-009. The image records its commit from the `GIT_SHA` build argument or the build context's `.git`; `KORA_COMMIT_SHA` is the runtime fallback; otherwise the commit is `null`. See `docs/runbooks/rumpty-deploy.md` for console settings, environment variable names, database strings, migrations over `sslmode=require` and a smoke-test checklist.

### Running tests

PostgreSQL-backed tests are destructive (they delete rows) and run serially. They only start when `DATABASE_URL` names a database ending in `_test`; the name is parsed from the URL, so anything else is refused. With the compose database running:

```bash
docker compose exec postgres createdb -U kora kora_test
export DATABASE_URL=postgresql://kora:kora@localhost:5432/kora_test
pnpm db:migrate && pnpm test
```

Without `DATABASE_URL` the PostgreSQL suites are skipped.

The current adapter does not require `RUMPTY_API_KEY`; it intentionally avoids guessing undocumented machine-readable provider APIs. Future credentialed calls must obtain credentials from secret storage and must never persist or return them.

## Provider model

Provider resource identity is:

`provider + provider account/workspace + region + resource type + provider resource ID`

Display names are not identity. The common capability vocabulary includes discovery, status, health, logs, metrics, deployment metadata and future remediation operations. RumptyCloud currently advertises only `HEALTH_OBSERVATION`, because that is the capability implemented without fabricating an API response contract.

Kora keeps **fact**, **inference**, **diagnosis**, and **hypothesis** separate. An HTTP 503 proves an unhealthy HTTP observation; repeated 5xx evidence supports a service-endpoint diagnosis; neither proves a VM crash or memory exhaustion.

## Deterministic diagnosis

Milestone 3 correlates evidence by exact incident/service/resource identity and deterministic time ordering. Findings use machine-readable codes such as `SERVICE_HTTP_5XX`, `SERVICE_TIMEOUT`, `DNS_RESOLUTION_FAILURE`, `TLS_HANDSHAKE_FAILURE`, `CONNECTION_REFUSED`, and `RECOVERY_VERIFIED`. The codes `RESOURCE_REPORTED_STOPPED` and `PROVIDER_UNAVAILABLE` are defined but not yet emitted by any monitor path.

Confidence is finite and rule-based (`CONFIRMED`, `STRONGLY_SUPPORTED`, `SUPPORTED`; `INSUFFICIENT_EVIDENCE` is defined but not yet emitted), never a fabricated percentage. Provider `RUNNING` plus failed service health is preserved as a contradiction. Missing metrics, logs, provider status or deployment context are represented as explicit evidence gaps. Root cause is always `UNKNOWN` today (`IDENTIFIED` and `SUSPECTED` are defined, not yet emitted).

Diagnostic snapshots are deterministically serialized, SHA-256 hashed, persisted in PostgreSQL and immutable after creation. Equivalent evidence produces equivalent diagnostic content; diagnostically relevant changes alter the hash. See `docs/architecture/deterministic-diagnosis.md`.

## Failure classification

A failed health check is classified from the HTTP status or, for transport failures, from stable error **codes** found by walking the `fetch()` error's `cause` chain and any `AggregateError` members. Error messages are never pattern-matched.

| Category                                   | Source                                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `HTTP_5XX`, `HTTP_4XX`, `INVALID_RESPONSE` | HTTP status of a received response (`>=500`, `>=400`, other non-OK)                                                        |
| `DNS_FAILURE`                              | `ENOTFOUND`, `EAI_AGAIN`                                                                                                   |
| `CONNECTION_REFUSED`                       | `ECONNREFUSED`                                                                                                             |
| `TLS_FAILURE`                              | `CERT_*`, `DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_*CERT*`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `ERR_TLS_*`, `ERR_SSL_*`   |
| `TIMEOUT`                                  | `TimeoutError` (the monitor's timeout), `UND_ERR_CONNECT_TIMEOUT`, `UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_BODY_TIMEOUT`       |
| `UNKNOWN`                                  | anything else, including a bare `AbortError` ("health check aborted"). The reason carries the underlying code and message. |

`failureReason` includes the matched code and cause message with URL credentials and secret-like values redacted. `PROVIDER_UNAVAILABLE` and `RESOURCE_STOPPED` are defined, not yet emitted: the schema accepts them but the health monitor never produces them. Legacy Milestone 1 category values remain accepted for persisted compatibility.

## API

`GET /health`, `/services`, `/services/:id`, `/incidents`, `/incidents/:id`, `/incidents/:id/events`, `/incidents/:id/evidence`, `/services/:id/verification` (Deployment Verification, not cryptographic; see ADR-010), `/incidents/:id/timeline`, `/incidents/:id/diagnosis` (read-only, computes the current diagnosis), `/incidents/:id/snapshots`, `/incidents/:id/snapshots/:snapshotId`, and `POST /incidents/:id/diagnosis/snapshots` (persists an immutable snapshot; `201` created, `200` already exists).

Responses are JSON with `data` for resource endpoints. Unknown resources return 404; invalid boundary inputs are rejected. Requests receive request IDs and logs are structured. Service and incident responses resolve provider/resource context when a binding exists.

## Persistence and reliability semantics

PostgreSQL stores services, provider resources, service/resource bindings, telemetry observations, incidents, evidence, versioned domain events, lightweight dependencies and immutable diagnostic snapshots. A partial unique index continues to enforce one unresolved incident for the Milestone 1 deduplication key. Observations reference provider resources rather than copying mutable provider metadata into every row. Evidence remains concrete and recovery remains an observed threshold, never an action/provider success code.

## Repository

- `apps/api` — API, monitor runtime, provider adapter boundary, deterministic diagnosis and PostgreSQL access/migrations.
- `apps/demo-service` — controlled workload.
- `services/incident-engine` — deterministic pure reliability rules.
- `packages/event-schema` — event/action contracts and runtime validation.
- `packages/topology` — provider-neutral identity, capabilities and topology relationships.
- `integrations/rumptycloud` — verified provider documentation and integration boundary.
- `docs` — architecture, ADRs, security and runbooks.

## Security philosophy

Deterministic facts precede reasoning; cloud credentials never belong in evidence or an AI context; arbitrary shell execution is out of scope; future actions are typed and policy-gated. Development failure controls fail closed. SQL values are parameterized. Provider metadata is allow-listed and provider error text is redacted. Diagnostic provenance is redacted before snapshot hashing/persistence. The current API has no authentication and therefore is not suitable for unrestricted public exposure.

## RumptyCloud status

Official RumptyCloud documentation was reviewed before implementing the adapter. The documented CLI covers VM operations and non-interactive API-key authentication; GitHub deployment uses a unique VM ID and token. The currently available docs do not define a stable machine-readable discovery/status response schema, so Kora does not parse guessed CLI output or invent REST endpoints.

Credentialless CI verifies the provider contract, identity mapping, error normalization/redaction, PostgreSQL resource persistence, provider-aware incident lifecycle, timeline, deterministic diagnosis and recovery. A true RumptyCloud acceptance run remains a **DEFERRED PRE-SUBMISSION ACCEPTANCE GATE** requiring account-scoped resource identity and a deployed public test workload.

See `integrations/rumptycloud/README.md`, `docs/architecture/provider-observation.md`, and `docs/architecture/deterministic-diagnosis.md`.

## Roadmap

1. Deterministic reliability kernel — complete.
2. Provider-aware cloud observation foundation — complete; real RumptyCloud acceptance remains deferred pre-submission.
3. **Current PR:** evidence correlation and deterministic diagnosis.
4. Evidence-based AI reasoning over explicit diagnostic snapshots.
5. Blast-radius/policy engine.
6. Human-approved typed remediation.
7. Rich verification and Chaos Lab.
8. Benchmarking/evaluation.
9. Console, polish, demo and technical article.

Architecture detail: `docs/architecture/overview.md`. Decisions: `docs/adr/`. Licensed under Apache-2.0.
