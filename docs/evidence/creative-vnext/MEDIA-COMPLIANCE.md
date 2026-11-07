# Media compliance

## Source hierarchy as implemented

1. Owner-supplied photos (existing owner-media pipeline, unchanged).
2. Kora curated catalogue (`packages/site-media`, 64 Pexels-licence photographs; topic-tagged, bundled, served from Kora's own origin). Licence audit below.
3. Approved stock provider: **Unsplash**, proposals only (below).
4. AI-generated editorial art: schema value `ai-generated` exists; **no generator is wired in this change**.
5. Procedural graphics ("plates") and 6. type-led layout: used wherever a photo would be irrelevant or repeated.

## Unsplash: requirement by requirement (guidelines read 2026-11-07)

| Requirement                                  | Implementation                                                                                                                                                                                                                                       | Proof                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Hotlink the URLs the API returns             | `displayUrl` is the provider's `urls.raw` with sizing params added; existing params (incl. `ixid`) kept; hosts must be `*.unsplash.com`                                                                                                              | `media-providers.test.ts` (ixid kept; foreign-host dropped) |
| Credit photographer and Unsplash with UTM    | `creatorUrl`/`sourceUrl` get `utm_source=<UNSPLASH_APP_NAME>&utm_medium=referral`; footer renders `Photos: <creator> on <Unsplash>`                                                                                                                  | `media.integration.test.ts` (published HTML asserted)       |
| Track a download when a person picks a photo | `recordSelection` calls `download_location` only inside `POST /media/select`; never on search                                                                                                                                                        | tests assert zero `/download` calls after search            |
| Keep the Access Key confidential             | backend-only env var; sent only in `Authorization`; never in URLs, responses or logs                                                                                                                                                                 | tests assert key absent from every response                 |
| 50 requests/hour (demo)                      | `UNSPLASH_RATE_LIMIT` (default 50), `UNSPLASH_RESERVE` (default 10); atomic shared counter in Postgres; `X-Ratelimit-Remaining` honoured; 429 exhausts the window                                                                                    | 80 concurrent spends over two counters admit exactly 40     |
| Few searches                                 | at most 4 grouped intents per generation; results cached per query so the other two directions cost nothing                                                                                                                                          | pool tests                                                  |
| "Non-automated" use                          | candidates are `placement: "owner-approval"`; nothing is placed without a person selecting it. The selection is a server-signed token (organisation, site, expiry, media fingerprint) that the edit verifies; a forged or replayed object is refused | route design; tests                                         |
| No bulk download / scraping / AI training    | no images are copied into Kora storage; only candidate metadata is cached (24h, shared in `media_candidate_cache` so every API instance agrees); Unsplash content is never sent to a model                                                           | by construction (no call path exists)                       |
| Do not use "Unsplash" in the app name        | the app name is configuration; documented as the registered application's name                                                                                                                                                                       | contract below                                              |

**Unverified / for the operator to confirm with Unsplash:** the permitted cache duration for search metadata (the 24h
in-memory TTL is a conservative choice, not a quoted rule), and whether a production-approved key changes the "automated"
position. The pages read did not state a caching rule or an AI-training rule.

## Deployment configuration contract (names only; no values appear anywhere in this repository)

```
KORA_MEDIA_UNSPLASH=on            # default off
UNSPLASH_ACCESS_KEY=<secret>      # backend only
UNSPLASH_APP_NAME=<registered application name>
UNSPLASH_RATE_LIMIT=50            # default 50 (demo)
UNSPLASH_RESERVE=10               # default 10
```

`GET /api/media/providers` reports `AVAILABLE` / `NOT_CONFIGURED` and any configuration problems. With nothing set the
provider is off and every other path works. This session did not read, set or request any production secret and did not
touch RumptyCloud.

## Image licence audit (catalogue)

`image-licence-audit.json` records, for 54 candidate photographs, the Pexels page read on 2026-11-07, the photographer named on
that page against the creator in the catalogue, the licence statement shown ("Free to use"), and whether a link-back is
required. Result: 54 verified, 0 unverified, 0 problems, with creator-name corrections applied where the catalogue differed.
**Three photographs were excluded after review** and are not shipped: one whose Pixabay/CC label was unclear, and two whose
photographers ask for a link-back. 50 audited photographs ship; the other 14 of the 64 are the original curated photographs
covered by `packages/site-media/LICENSES.md` and were **not** re-audited in this pass. Every photograph is used with the
credit line "Photo: <creator> / Pexels" in provenance, and the site footer says photography is illustrative. Method limit:
the pages were read by tool (text extraction), not opened by a person; Pexels' licence terms were not re-read as a legal
document. This is an audit of the catalogue, not legal advice.

## Bakery result

With the expanded catalogue the bakery acceptance case now has **15-18 photo placements from 10-11 distinct photographs**
across the three directions (never more than 2 uses of one photo, no cake photo on the small-chops page, relevance by topic
tag). Source: `matrix-after.json` (`imagePlacements`, `distinctImages`). Owner photos and owner-selected Unsplash pictures
add to this but were not needed to reach the target.

## Not validated

Real Unsplash was never called (no credentials were available to this work and none were requested): the adapter, quota,
cache, tokens, attribution and download tracking are tested against a local fake server only. Pending operator credentials
and an operator decision on the cache duration.
