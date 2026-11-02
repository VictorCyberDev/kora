# v7 execution ledger and honest limits

Status words follow repository truth conventions: **IMPLEMENTED** (code exists), **STUB_TESTED** (tested against a fake
provider), **LOCAL_ACCEPTED** (tests and local browser checks pass), **PRODUCTION_ACCEPTED**, **EXTERNAL_ACCEPTANCE_PENDING**,
**NOT_DONE**.

| Area                                                                                      | Status                      | Evidence                                                                                                  |
| ----------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Business Truth engine (supplied / inferred / missing / prohibited, invented-number check) | LOCAL_ACCEPTED              | `packages/creative` tests                                                                                 |
| Vertical Intelligence 2.0 (62 verticals, 13 clusters, anti-traits)                        | LOCAL_ACCEPTED              | resolver and coverage tests; golden businesses                                                            |
| Design grammars, Design Genome (30 dimensions), three-direction engine, choose-for-me     | LOCAL_ACCEPTED              | determinism, diversity and same-industry tests                                                            |
| Brand OS (versioned, append-only, hash-bound)                                             | LOCAL_ACCEPTED              | integration test: v1 -> v2 on brand change, none on content edit                                          |
| SiteSpec v3 + trusted renderer + planner + critic + structured edits                      | LOCAL_ACCEPTED              | unit, golden (18 businesses x 3 directions), browser (axe, overflow, console)                             |
| v3 publish, verify, monitor path, rollback, upgrade as new draft                          | LOCAL_ACCEPTED              | `design-v3.integration.test.ts` against Postgres                                                          |
| Type system (18 new OFL families, italics)                                                | LOCAL_ACCEPTED              | served and verified through API host                                                                      |
| ArtifactSpec + renderer (8 formats) + API + immutable storage                             | LOCAL_ACCEPTED              | `artifacts.integration.test.ts`; contact sheets                                                           |
| Print (A5, bleed)                                                                         | IMPLEMENTED                 | RGB only; not press-ready                                                                                 |
| Reference research (100+ structured entries)                                              | PARTIAL                     | 23 fetched by static HTTP, rest search leads and analyst notes; rendered re-scrape of 7 sites outstanding |
| Brand Center UI (Brand OS panel, matching set, direction labels, new-design action)       | IMPLEMENTED                 | type-checked; not browser-tested in e2e                                                                   |
| Production deployment and commissioning                                                   | EXTERNAL_ACCEPTANCE_PENDING | not deployed from this environment                                                                        |

## Not done (stated plainly)

- **Production deploy and production commissioning.** The release has not been deployed; no production acceptance is claimed.
- **Kora's own landing page** was not rebuilt with generated examples.
- **Motion and video** are not part of the artifact system; the existing motion studio is unchanged.
- **Brand OS backfill** for existing v1/v2 sites; they keep their Brand Kit.
- **Social preview images** (generated Open Graph PNGs) are not generated; the page ships `og:title`/`og:description` and `twitter:card=summary` only. Sitemap and robots files are not generated.
- **Model-assisted v3 wording** is not implemented; v3 is deterministic by design.
- **Live posting** to any channel remains NOT_CONFIGURED; artifacts are created, never posted.
- **Owner photo upload and categorisation, focal-point picker UI, logo upload**: the spec and renderer support media with provenance and focal points, but no new upload UI was built.
- **Object storage**: media remains in Postgres; no scaling issue was measured at the current volume.
- **Cross-browser and real-device testing**: Chromium only; no throttled-network LCP measurement. Budgets are byte budgets.
- **Remaining research**: rendered scrape of Duolingo, Aesop, COS, LEGO, Canva, GoDaddy, Muji after the Firecrawl allowance resets.
- **Taste learning** records evidence and reports only repeated choices; it does not yet re-rank directions.
- **Template-fatigue rotation**: `avoidGrammarIds` exists in the engine, but no per-account history feeds it yet.
