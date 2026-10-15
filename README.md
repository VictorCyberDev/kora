# Kora

**The reliability control plane for cloud infrastructure.**

Kora observes running systems, records deterministic telemetry, turns repeated failures into evidence-backed incidents, and verifies recovery from subsequent observations. Milestone 2 adds durable cloud-resource identity and provider-aware evidence without making a provider control plane or AI the source of reliability truth.

## What works now

A Fastify demo workload exposes `/health`; failure injection is disabled by default. Kora periodically checks a configured endpoint, persists observations in PostgreSQL, creates one incident after a configurable consecutive-failure threshold (default 3), retains structured evidence, and resolves only after a configurable consecutive-success threshold (default 3).

A monitored service can now be bound to a durable provider resource. Incident/service/evidence API responses expose that infrastructure context, and `/incidents/:id/timeline` returns a deterministic chronological evidence timeline.

```mermaid
flowchart LR
  RC[RumptyCloud workspace] --> R[Provider resource]
  R -->|RUNS| S[Service]
  S -->|EXPOSES| H[Health endpoint]
  M[Kora monitor] -->|MONITORS| H
  M --> O[Observation]
  O --> I[Deterministic incident engine]
  I --> P[(PostgreSQL)]
  P --> T[Evidence timeline]
  P --> A[Kora API]
  P -. structured evidence .-> AI[Future reasoning]
  AI -. typed proposal .-> PE[Future policy + executor]
```

Not implemented: frontend, AI diagnosis, automatic remediation, policy evaluation, authentication/RBAC, Kubernetes, multi-cloud, distributed monitoring, or undocumented RumptyCloud discovery/status APIs.

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

Kora keeps **observation**, **inference**, and **diagnosis** separate. An HTTP 503 proves an unhealthy HTTP observation; it does not prove a VM crash.

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

`failureReason` includes the matched code and cause message with URL credentials and secret-like values redacted. `PROVIDER_UNAVAILABLE` and `RESOURCE_STOPPED` are accepted by the schema but are not produced by the health monitor. Legacy Milestone 1 category values remain accepted for persisted compatibility.

## API

`GET /health`, `/services`, `/services/:id`, `/incidents`, `/incidents/:id`, `/incidents/:id/events`, `/incidents/:id/evidence`, `/incidents/:id/timeline`.

Responses are JSON with `data` for resource endpoints. Unknown resources return 404; invalid boundary inputs are rejected. Requests receive request IDs and logs are structured. Service and incident responses resolve provider/resource context when a binding exists.

## Persistence and reliability semantics

PostgreSQL stores services, provider resources, service/resource bindings, telemetry observations, incidents, evidence, versioned domain events and lightweight dependencies. A partial unique index continues to enforce one unresolved incident for the Milestone 1 deduplication key. Observations reference provider resources rather than copying mutable provider metadata into every row. Evidence remains concrete and recovery remains an observed threshold, never an action/provider success code.

## Repository

- `apps/api` — API, monitor runtime, provider adapter boundary, PostgreSQL access/migrations.
- `apps/demo-service` — controlled workload.
- `services/incident-engine` — deterministic pure reliability rules.
- `packages/event-schema` — event/action contracts and runtime validation.
- `packages/topology` — provider-neutral identity, capabilities and topology relationships.
- `integrations/rumptycloud` — verified provider documentation and integration boundary.
- `docs` — architecture, ADRs, security and runbooks.

## Security philosophy

Deterministic facts precede reasoning; cloud credentials never belong in evidence or an AI context; arbitrary shell execution is out of scope; future actions are typed and policy-gated. Development failure controls fail closed. SQL values are parameterized. Provider metadata is allow-listed and provider error text is redacted. The current API has no authentication and therefore is not suitable for unrestricted public exposure.

## RumptyCloud status

Official RumptyCloud documentation was reviewed before implementing the adapter. The documented CLI covers VM operations and non-interactive API-key authentication; GitHub deployment uses a unique VM ID and token. The currently available docs do not define a stable machine-readable discovery/status response schema, so Kora does not parse guessed CLI output or invent REST endpoints.

Credentialless CI verifies the provider contract, identity mapping, error normalization/redaction, PostgreSQL resource persistence, provider-aware incident lifecycle, timeline and recovery. A true RumptyCloud acceptance run still requires account-scoped resource identity and a deployed public test workload.

See `integrations/rumptycloud/README.md` and `docs/architecture/provider-observation.md`.

## Roadmap

1. Deterministic reliability kernel — complete.
2. **Current PR:** provider-aware real-cloud observation foundation and RumptyCloud acceptance boundary.
3. Real deployment/change telemetry correlation.
4. Live system graph.
5. Evidence-based AI reasoning.
6. Blast-radius/policy engine.
7. Human-approved typed remediation.
8. Rich verification and Chaos Lab.
9. Benchmarking/evaluation.
10. Console, polish, demo and technical article.

Architecture detail: `docs/architecture/overview.md`. Decisions: `docs/adr/`. Licensed under Apache-2.0.
