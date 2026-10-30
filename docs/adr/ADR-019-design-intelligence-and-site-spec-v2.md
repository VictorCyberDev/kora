# ADR-019: SiteSpec v2 and design intelligence

Status: accepted (on branch `kora-design-v2`, not deployed).

## Context

v1 sites were correct but look alike: one skeleton, a few colours, system fonts. We want sites that look designed for the business, without letting a model write markup, and
without weakening the trust chain (validated spec → deterministic renderer → immutable artifact → hash → publish → verify → monitor → recover).

## Decision

1. Add **SiteSpec v2** next to v1; never migrate history. `parseAnySiteSpec`/`renderAnySite` dispatch on `version`; patches are validated by the edited spec's own version.
2. Design is **data over a closed vocabulary**: 14 section types x registered variants, 16 colourways, 11 font pairings. The renderer is the enforcement boundary; the schema checks contrast.
3. A **deterministic planner** with 32 industry recipes is the product. A model, if configured, may only choose registered looks/palettes/art and polish a headline; everything passes a fact/cliché/contrast gate and falls back to the planner.
4. Fonts are bundled (OFL) and served by every host at `/_kora/fonts/<exact file>`; artifacts stay text-only, so the trust model and the immutable-version trigger are untouched.
5. Provider-neutral `AI_*` configuration with ordered fallbacks; `INFERENCE_*` stays valid.
6. Standardise owner-facing status words: Healthy, Watching, Needs attention, Waiting for approval, Fixing, Checking recovery, Recovered.

## Consequences

- v1 versions keep working forever (golden hashes asserted). v1→v2→v1→v2 is covered with live-byte verification.
- The CSP forbids inline styles, so the v2 renderer uses none; the lint enforces it.
- More surface to keep visually good: the browser QA (overflow, axe, fonts, weight) runs in CI for 39 fixture sites.
- Abstract art instead of photos until an upload/storage story exists.
