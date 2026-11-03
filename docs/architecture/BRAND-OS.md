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

## Design memory, taste and template fatigue

Every design decision is stored in design terms, not as words: `creative_feedback.detail.traits` holds the design
language (`grammarId`), type voice, colour set and composition of the direction that was chosen, and of the other
directions that were on screen and passed over (only when the owner actually picked one of three; a Kora default is
never counted as a choice). `BrandOsStore.designHistory(orgId)` reads a year of it per organisation (migration 027
adds the index).

- **Template fatigue.** `fatigueAvoid` weights each remembered choice by recency (half-life 45 days). A design
  language whose weighted use reaches 1.2 (two recent choices, or one very recent plus an older one) is passed to the
  engine's existing `avoidGrammarIds`, so the next three directions rotate away from it. At most two languages are
  avoided, so three genuinely different directions always remain. An account with no history gets exactly what it
  got before.
- **Taste.** Nothing is claimed from fewer than three judgements (ADR-028). From three, `tasteSignals` reports repeated
  preferences (design language, type voice) and repeated passes (weighted 1.5 or more). `rerankByTaste` only moves
  which direction is _recommended_, by at most +1.5 / -1.5 on a fit score whose own spread for a poor match is larger:
  taste can break a near tie, never recommend a bad fit, and the owner can always pick any of the three. The reason
  shown says so ("it is close to the directions you have chosen before, and it still fits what you told us").
- `GET /api/sites/:id/brand-os` returns `designMemory` (number of decisions, languages being rotated away from, taste)
  so the owner can see what Kora remembers and why.

## Backfill for older sites

`POST /api/sites/:id/brand-os/backfill` writes Brand OS version 1 for a site whose newest version is v1 or v2. Colours
and type are **read from the site** (v2 palette and pairing; v1 primary and accent), strategy and voice come from the
facts on the site, and the record is marked `provenance.createdBy = "inferred-from-site"` with
`provenance.inferred.unknown` listing what could not be known (whether the colours were chosen on purpose, the logo,
what the owner would never say). It never republishes, never edits the old version and never overwrites an existing
Brand OS. "Try a new Kora design" backfills first, so the before/after comparison in the upgrade response is against a
recorded brand: history then reads version 1 (inferred) and version 2 (new).

## Owner-friendly changes

Beyond the original four (premium, bolder, calmer, playful) the owner can ask for warmer, cooler, darker, lighter, more
editorial, product first and more minimal, in the buttons or in plain words ("make it warmer"). Colour changes pick
another colour set **from the same design language**, so the brand keeps its voice and every text pair stays legible;
if the language has nothing warmer or darker, the owner is told so rather than the brand being bent. Structure changes
move the genome only within its vocabulary and never touch the facts.

## Owner surface

Brand page: the essence, positioning, swatches, type, signature device, always/never rules, the change buttons above,
history, "Tell Kora what you need" (a plain-language campaign proposal, see CREATIVE-OS.md), the matching-set creator,
the logo and photo library, and for older sites a button that writes down their brand from their website. Advanced
fields stay hidden.

## Not done

The Brand Center does not edit individual genome fields (the nudges and the structured edit API do).
