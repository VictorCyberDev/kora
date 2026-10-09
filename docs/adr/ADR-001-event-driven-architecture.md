# ADR-001: Event-oriented reliability history
**Status:** Accepted

## Context
Kora must explain what was observed, when an incident formed, and how recovery was verified. Future reasoning and remediation need the same evidence without becoming the source of truth.
## Decision
Use versioned typed domain events persisted in PostgreSQL alongside normalized operational state. Milestone 1 uses no external broker.
## Consequences
Audit history is durable and replay-friendly; schemas require compatibility discipline. PostgreSQL transaction boundaries matter. A broker can be added only when delivery/scale requirements justify it.
## Alternatives Considered
Direct mutable state only loses causal history. Kafka now adds operational complexity without a current requirement. In-process events alone are not durable.
