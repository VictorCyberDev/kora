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

## Owner media (logo and photographs)

`POST /api/sites/:id/media-library` accepts PNG, JPEG or WebP, decodes it with the server's image library, **re-encodes**
it (the uploaded bytes are never stored or served), strips metadata (including GPS), and stores display variants and a
thumbnail in `owner_media` (migration 026). Each picture gets a quality record (sharpness, resolution, orientation,
transparency, a score, flags such as BLURRY or LOW_RESOLUTION, and `heroReady`) with plain-language advice, a role
(product, service, portfolio, team, location, environment, process, gallery) and a focal point the owner can set. Public
URLs are content-addressed (`/api/public/sites/:id/m/<sha256>/w1280.webp`), so a removed picture stops being offered
for new designs while earlier versions and artifacts that already reference it keep working. Pictures reach a
published site only when `KORA_MEDIA_PUBLIC_URL` (or `KORA_PUBLIC_URL`) is https. The planner's image hierarchy is
owner picture, then approved stored picture, then licensed stock, then generated picture, then procedural illustration,
then typography; **composition changes with what is available** (an arch-framed portrait with a photo, a typographic
hero without one) rather than leaving an empty frame.

## Plain-language campaign proposals

`POST /api/sites/:id/campaign-proposal` turns "I need more birthday cake orders next week" into a PROPOSAL: the goal, the
thing to promote (matched against what the owner actually offers; if it is not in their profile Kora asks), a time window
resolved against today, four coordinated pieces (story, WhatsApp status, feed post, flyer) with suggested days, and a
list of what Kora still needs (a photo of their own work, any price or deadline they want mentioned). The response
carries `autoPublish: false` and `spends: false` and creates nothing; each piece is a draft body the owner submits to the
artifacts API. The wording contains only the owner's words, the business name and a contact route that exists.

## Optional model-assisted copy

`KORA_COPY_ASSIST=true` (default off) lets a configured model propose the opening headline and one sentence for a v3
site. The proposal is checked against everything the owner told Kora: every number must already appear in their facts;
prices, awards, guarantees, "best/leading" claims, testimonials, invented people, links, markup and clichés are rejected;
length is bounded. Any failure (model down, invalid JSON, wrong shape, a rejected claim) keeps the deterministic copy
that was already there, so a model can only ever make the opening more specific, never less true.

## Motion follows the brand

Motion Studio frames take a `style` derived from the Brand OS design genome (pace, whether a button overshoots, capital
headlines, corner radius, travel). A calm editorial brand does not bounce and a loud poster brand does not drift. The
preview response states which Brand OS version and hash the frames follow. Video export still needs ffmpeg and says so
when it is missing.

## Social preview, structured data, sitemap and robots

`og:image` and `twitter:card=summary_large_image` are emitted **only** from a real picture of the business (its hero
photograph, else its logo) by absolute URL; with none there is no `og:image` rather than a generated placeholder that
misrepresents it. JSON-LD (`LocalBusiness`) carries only supplied facts (name, description, phone, email, address, logo,
`sameAs` for https links) and never ratings, reviews, prices or opening hours. `sitemap.xml` and `robots.txt` are added
at publish by `finalizeForPublish`, which knows the real origin.

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
