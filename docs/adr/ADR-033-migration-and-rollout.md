# ADR-033: Migration and rollout of the creative engine

Status: accepted. v7.

**Decision.** `KORA_CREATIVE_ENGINE` (default `v2`) selects the engine for new designs only. Migration 025 is additive
and append-only. Existing published sites are never touched. The v3 upgrade creates a new draft and requires the owner
to publish it. The flag is rollout protection, not a permanent dual system: remove it, and retire the v2 designer, once
v3 is default and commissioned.
