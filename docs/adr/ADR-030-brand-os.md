# ADR-030: Brand OS extends the Brand Kit; it does not replace it

Status: accepted. v7.

**Decision.** A versioned, append-only `brand_os_versions` row records strategy, genome, palette, voice, media rules,
channel rules and do/don't. It is written only when the brand changes. `deriveBrandKit` understands v3 specs, so the
existing Brand Kit, studios and campaign bundles keep working from the same identity. Specs and artifacts record the
Brand OS version and hash they were made from.

**Consequences.** Changing the brand never restyles earlier work. Taste learning is evidence-based (repeated choices
only). Legacy v1/v2 sites have no Brand OS until they adopt a v3 design; their Brand Kit still works.

**Rejected.** Duplicating Brand Kit/Genome tables; mutating a brand row in place.
