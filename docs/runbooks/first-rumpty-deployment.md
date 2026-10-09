# First RumptyCloud deployment — preparation runbook

This is a Milestone 2 plan, not a claim that deployment commands are known.

## Components and infrastructure

Deploy the Kora API/monitor and demo service as separate Node.js applications/processes, plus managed PostgreSQL. Node.js 22+ and outbound HTTP from Kora to the demo `/health` endpoint are required. The API needs inbound access only from intended operators/demo clients. The demo `/health` endpoint must be reachable by Kora. Failure controls must remain disabled unless a tightly controlled demonstration explicitly enables them.

PostgreSQL must be persistent, backed up according to platform capability, and reachable only by Kora/admin paths. Required application variables are documented in `.env.example`; production `DATABASE_URL` is a secret and local example credentials must never be reused. No Rumpty credentials are currently required by Milestone 1 because there is no provider client.

Health endpoints: Kora `GET /health`; demo `GET /health`. Persistent application disk is not required in Milestone 1 because authoritative state is PostgreSQL.

## Expected GitHub flow

The known product context says RumptyCloud supports GitHub-integrated deployments. Before execution, verify the official UI/docs for repository authorization, branch/build/start configuration, environment secret injection, deployment logs and rollback behavior. Do not infer commands from this document.

## Information still required

Verify: official authentication model and CLI/API docs; Node runtime/build image behavior; managed PostgreSQL version, TLS/CA and connection-string format; private networking/DNS between apps and database; firewall defaults; GitHub deployment triggers; health-check configuration; log retention; secret storage/redaction; backup/snapshot/restore procedure; deployment identity/change-history API; monitoring API; rate limits and error/idempotency semantics.

## Pre-execution gates

Run repository quality gates; create production secrets through the verified platform mechanism; deploy PostgreSQL and apply migration; deploy demo with injection disabled; deploy Kora with the demo health URL; validate health and persistence; only then schedule a controlled failure experiment. Any CLI/API step remains blocked until official RumptyCloud syntax is verified.
