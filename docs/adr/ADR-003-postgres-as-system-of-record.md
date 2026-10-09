# ADR-003: PostgreSQL as system of record

**Status:** Accepted

## Context

Kora needs durable services, observations, incidents, evidence and event history with consistency and useful relational queries.

## Decision

Use PostgreSQL as the authoritative store. Normalize core entities and use JSONB only for versioned event payload flexibility.

## Consequences

Kora depends on PostgreSQL availability and migrations. Strong constraints can enforce deduplication/idempotency. Local development uses Docker Compose; tests must not substitute SQLite semantics.

## Alternatives Considered

SQLite diverges from target concurrency/types. Document stores weaken relational integrity for current access patterns. Multiple stores are premature.
