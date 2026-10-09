# ADR-007: RumptyCloud as first provider adapter

**Status:** Accepted

## Context

The Hacktober build targets RumptyCloud, while Kora's reliability domain should survive future provider expansion. Exact RumptyCloud API/CLI contracts are not yet verified.

## Decision

RumptyCloud is the first adapter under `integrations/rumptycloud`; core domain code must not import provider-specific APIs. No client behavior is implemented until official contracts are verified.

## Consequences

Milestone 2 has a clean integration seam and avoids fabricated platform behavior. Some provider-neutral interfaces will emerge only after real requirements are known.

## Alternatives Considered

Embedding Rumpty calls in the incident engine creates lock-in. Designing a universal cloud abstraction now would be speculative and likely wrong.
