# ADR-032: Reference policy and creative model boundaries

Status: accepted. v7.

**References.** The corpus is design memory with stated evidence levels (`fetched`, `search-lead`, `analyst`). No
third-party layout, copy, imagery, mark or motion is reproduced; no brand appears as an enum value (`typeVoice:
"editorial-luxury"`, never `theme: "aesop"`). Counts are asserted in tests.

**Models.** The v3 path is deterministic: Business Truth, Brand Strategy, directions, planner and copy are produced by
Kora's engine, so provider outages cannot degrade it. Models may in future suggest wording only through the same schemas
and checks (clichés, invented figures, unsupported claims, unknown components). Natural-language edits resolve to
validated operations by rules; unmatched requests change nothing. Business text is untrusted and has no path to
authority.

**Media provenance.** Every media object carries source type, provider, licence, attribution and review status; a
generated image is unusable until the owner approves it.
