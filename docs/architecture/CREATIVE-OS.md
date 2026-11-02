# Creative OS architecture (v7)

Keep the trust core, replace the creative ceiling. The creative layer may change radically; the operational trust
boundaries do not.

```
owner input
  -> Business Truth        (supplied / inferred / decided / missing / prohibited)
  -> Vertical Intelligence (intent, trust barrier, pages, proof, anti-traits)
  -> Brand Strategy        (before any visual design)
  -> three Creative Directions (design grammars, deterministic selection)
  -> Design Genome + Art Direction (first-party vocabulary)
  -> SiteSpec v3           (closed, validated contract)  -> trusted renderer -> immutable version
  -> publish -> verify -> monitor -> recover               (unchanged)
  -> ArtifactSpec          (flyer, post, story, status, banner, carousel) -> trusted renderer -> PNG
```

## Packages

| Package             | Role                                                                                                                                           | Depends on       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `@kora/creative`    | Truth, verticals, grammars, genome, strategy, directions, Brand OS, art direction, copy discipline, ArtifactSpec and renderer, reference atlas | `zod` only       |
| `@kora/site-schema` | SiteSpec v1/v2/v3, planners, renderers, critic, structured edits, version routing (`renderAnySite`)                                            | `@kora/creative` |
| `@kora/growth`      | Brand Kit bridge (`deriveBrandKit` understands v3), studios                                                                                    | both             |
| `apps/api`          | Flag, routes, Brand OS store, artifact routes, migration 025                                                                                   | all              |

## Trust boundaries (unchanged and extended)

- A model is never the publishing authority and never emits HTML, CSS or script. v3 generation is **deterministic**:
  no model is called, so an unavailable provider cannot make the product worse. Natural-language edits are matched to
  validated operations by rules; an unmatched request changes nothing.
- Every field is an enum or a validated string. No unknown component, font, colour, motion, link scheme or media
  origin can enter a spec; the renderer escapes all text; `lintArtifact` still gates every published file. The only
  linter change is that an inline `<script type="application/ld+json">` data block is permitted (its `<` is escaped and
  the linter rejects markup inside it). CSP is unchanged.
- Business descriptions are untrusted: they feed text fields only. Text such as "ignore previous instructions" has no
  path to authority.
- Previews are rendered in memory, held for 30 minutes, never persisted, never call a model or image provider, and have
  forms stripped. Choosing a direction creates the site, as in v6.

## Compatibility

v1 and v2 specs, renderers and golden hashes are untouched. `renderAnySite` dispatches on `version`. No site is converted
automatically: "Try a new Kora design" creates a **new v3 draft** from the facts a version already states; the live
version keeps serving until the owner publishes, and rollback is the existing path.

## Feature flag

`KORA_CREATIVE_ENGINE=v2|v3` (default `v2`). It chooses the engine for **new** designs only: direction previews,
generate, and the v3 upgrade route (409 `creative_engine_disabled` when off). Existing v3 versions render regardless
of the flag. Remove the flag when v3 is the default and the v2 designer is retired.

## Cost control

Direction previews call no model and no image provider. Artifact renders are metered as `IMAGE_RENDER` and gated by the
existing `brand.studio` entitlement. Generated pictures are produced by the existing media pipeline (with its own caps)
and are usable in artifacts only after the owner approves them.
