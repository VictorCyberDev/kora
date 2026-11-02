# Brand OS

The Brand OS is the versioned, owner-facing brand system that every Kora artifact consumes. It extends, and does not
replace, the existing Brand Kit and Brand Genome: `deriveBrandKit` now understands v3 specs, so the older studios keep
working from the same identity.

## Object (`kora.brand-os/1`)

| Area     | Content                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strategy | essence, audience, positioning, value promise, personality, voice, tone, emotional goal, visual tension, differentiation, trust strategy, conversion mood, anti-traits, rationale, and a `basis` block that separates owner-supplied facts, inferences, design decisions and missing information |
| Visual   | colourway, mode, five brand colours, type voice, signature motif, shape, typographic wordmark (replaceable; never presented as a trademark)                                                                                                                                                      |
| Genome   | 30 first-party dimensions (composition mode, grid, density, type contrast, radius, buttons, hero, rhythm, motion, mobile strategy, signature motif, and more)                                                                                                                                    |
| Voice    | tone, headline style, CTA language, words to avoid (banned clichés plus owner words)                                                                                                                                                                                                             |
| Media    | structured image briefs and the source priority                                                                                                                                                                                                                                                  |
| Channels | how the brand behaves on website, social, story, flyer, WhatsApp and banner                                                                                                                                                                                                                      |
| Rules    | dos and don'ts                                                                                                                                                                                                                                                                                   |

## Versioning

`brand_os_versions` (migration 025) is append-only (`kora_immutable_rows` trigger), tenant-scoped through
`(site_id, org_id)`, and unique on `(site_id, version)`. A version is written only when the brand changed:
a content edit (phone number, headline) keeps the version and the design byte-identical; a brand edit (premium,
bolder, colour set, type voice) writes version N+1. Each v3 spec embeds `osVersion` and `osHash`; each artifact stores the
brand version in `media_assets.brand_version` and the full ArtifactSpec (with the hash). Changing the brand never mutates an earlier
artifact or version.

## Taste learning

`creative_feedback` records direction chosen or rejected, regeneration, image rejected, palette or font changed,
artifact approved. `learnedTaste` only reports a preference when a choice has repeated at least three times; one event is a
data point. The UI says "Not enough choices yet to say what you prefer" until then.

## Owner surface

Brand page: the essence, positioning, swatches, type, signature device, always/never rules, one-tap nudges
(premium, bolder, calmer, playful), history, and the matching-set creator. Advanced fields stay hidden.

## Not done

Brand OS for sites that are still v1/v2 is not backfilled (their Brand Kit continues to work); the Brand Center does
not yet edit individual genome fields (nudges and the structured edit API do); logo upload exists as a reference field
only.
