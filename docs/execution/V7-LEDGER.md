# v7 execution ledger and honest limits

## Authenticated recovery update — 2026-11-04

The owner completed console sign-in. The failed main deployment's startup log
shows `ECONNREFUSED` to PostgreSQL at `10.107.249.99:5432`; the image build
completed. The configured internal host and `sslmode=require`, port 8080 and
`/health` readiness match the documented settings. An API restart was requested,
but no running instance was observed and the API remained HTTP 503.

The database is READY and read-only SQL succeeds. `brand_os_versions` and
`owner_media` exist; `creative_feedback` has three indexes. This is schema
presence evidence, not full migration acceptance. Snapshot requests did not
produce a confirmation or a listed snapshot, so **no backup is claimed**.
Do not redeploy the migration start command or change the database until a
backup is verified. No application, environment or database contents were edited.

CI on recovery documentation head `9b1caa6` is not green: Docker image checks
passed, quality failed in `src/ui/ui.integration.test.ts:177` (expected four
decision cards, received zero). API: 495 passed, 1 failed, 1 skipped; creative:
41 passed; site-schema: 241 passed; growth: 149 passed. E2E was still running at
inspection. These counts do not certify a later head. Local suites: 0 run;
commissioning phases: 0 run. See `docs/live/v7-recovery-2026-11-04.json`.

## Initial production gate — 2026-11-04

**EXTERNAL_ACCEPTANCE_PENDING.** Read-only preflight of main
`e2b62df7d43f58c803d6709d453c90b69e5174aa` found:

- API `/health` and `/__kora`: HTTP 503, RumptyCloud "This app did not start".
- Site Host, after waking: `/health` HTTP 200 with `database: ok`; `/__kora`
  HTTP 200 claiming that exact main commit from `build-info`.
- Console sign-in is required. The secure authentication request was declined;
  runtime logs, environment settings, memory limits and migration state were not inspected.
- No production setting, database row, release or feature flag was changed.
- Tests run in this recovery session: **0**. Commissioning phases run: **0**.
  No visual review, Docker rehearsal or CI acceptance is claimed for this head.

Evidence: `docs/live/v7-preflight-2026-11-04.json`. The historical acceptance
table below has **not been revalidated** by this preflight. Its unmerged-PR
production description is stale: git history shows merge `79c29ff`, revert
`70f3a68`, then reapplication `e2b62df`.

Resume with authenticated console access and the API startup log. Establish the
failure before proposing a fix; verify database backup before any database
change. Confirm both services healthy on main, then resume the requested
audit, production-image rehearsal and baseline/v3/rollback commissioning.
Do not merge or enable v3 while this gate remains unresolved.

Status words follow repository truth conventions: **IMPLEMENTED** (code exists), **STUB_TESTED** (tested against a fake
provider), **LOCAL_ACCEPTED** (tests and local browser checks pass), **PRODUCTION_ACCEPTED**, **EXTERNAL_ACCEPTANCE_PENDING**,
**NOT_DONE**. Exact test counts and the head they were run on are in the PR description and `__TESTS__` below.

| Area                                                                                             | Status                          | Evidence                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Business Truth, Vertical Intelligence (62 verticals, 13 clusters), grammars, Design Genome       | LOCAL_ACCEPTED                  | `packages/creative` tests; golden and same-industry sets                                                       |
| Three-direction engine, choose-for-me, suitability (no cartoon language for builders etc.)       | LOCAL_ACCEPTED                  | `different never means unsuited` tests; sheets                                                                 |
| Brand OS (append-only, hash-bound), nudges incl. warmer/darker/lighter/editorial/product/minimal | LOCAL_ACCEPTED                  | integration + `e2e/brand-center.spec.ts`                                                                       |
| Brand OS backfill for v1/v2 (inferred, no republish) and upgrade comparison                      | LOCAL_ACCEPTED                  | `design-v3.integration.test.ts`; rehearsal                                                                     |
| SiteSpec v3 + renderer + planner + critic + structured edits                                     | LOCAL_ACCEPTED                  | unit, golden (18 x 3), Chromium/Firefox/WebKit engine runs                                                     |
| Owner logo and photos (validation, re-encode, roles, focal points, quality, hierarchy)           | LOCAL_ACCEPTED                  | `owner-media.integration.test.ts`; Brand Center e2e upload; rehearsal                                          |
| ArtifactSpec (8 formats), artifact edit, cross-channel consistency, logo/photo/focal             | LOCAL_ACCEPTED                  | `artifacts.integration.test.ts`; sheets                                                                        |
| Motion follows the Brand OS (pace, overshoot, capitals, radius, brand version recorded)          | LOCAL_ACCEPTED                  | `motion-style.test.ts`, `studio.integration.test.ts`; video export still needs ffmpeg                          |
| Plain-language campaign proposal (never posts or spends)                                         | LOCAL_ACCEPTED                  | `proposal.test.ts`, artifacts integration, e2e                                                                 |
| Template-fatigue rotation and taste re-ranking (>= 3 judgements)                                 | LOCAL_ACCEPTED                  | `history.test.ts`, integration                                                                                 |
| Optional model-assisted copy with facts validator and deterministic fallback                     | STUB_TESTED                     | stub model only; flag `KORA_COPY_ASSIST` off by default; no real model was called                              |
| og:image only from real pictures, factual JSON-LD, sitemap, robots                               | LOCAL_ACCEPTED                  | `v3.test.ts`                                                                                                   |
| Kora's own landing rebuilt with real v7 output                                                   | LOCAL_ACCEPTED                  | `docs/design/v7/landing-*.png`; axe, overflow, console clean                                                   |
| Research: 182 sites rendered and measured (desktop + phone), classes stated                      | LOCAL_ACCEPTED                  | `docs/research/SITE-OBSERVATIONS-2026.md`, `data/*.jsonl`, pinned by tests                                     |
| Performance, throttled slow-4G + 4x CPU, 18 golden sites                                         | LOCAL_ACCEPTED                  | see creative-quality.md; lab data, not field data                                                              |
| Cross-browser: Firefox and WebKit engines                                                        | LOCAL_ACCEPTED (engines)        | 108 captures each, 0 overflow; **not real devices**, not Safari on iOS                                         |
| Migrations 025-027 (strengthened suite: order, byte-stability, upgrade from 024, schema)         | LOCAL_ACCEPTED                  | `migrations.integration.test.ts`                                                                               |
| v3 recovery (bad release, approval, rollback, verified recovery, passport) and v3 attribution    | LOCAL_ACCEPTED                  | `site-host.integration.test.ts`, `intelligence.integration.test.ts`                                            |
| Security matrix for the v7 surface                                                               | LOCAL_ACCEPTED                  | `v7-security.integration.test.ts`                                                                              |
| Docker image build from the repo Dockerfile, run, 27 migrations applied to an empty database     | LOCAL_ACCEPTED                  | build log and rehearsal (below); the build caught one real type error                                          |
| Commissioning rehearsal with the production image (flag v2 -> v3 -> v2)                          | LOCAL_ACCEPTED                  | `scripts/commission-v7.mjs`, `scripts/commission-rehearsal.sh`; evidence in PR                                 |
| **Production deployment and commissioning**                                                      | **EXTERNAL_ACCEPTANCE_PENDING** | production still serves `main` (`7ce64c2`, observed 2026-11-03 via `/__kora`); PR not merged, no deploy access |

## Production: what remains, exactly

Production deploys from `main` through the RumptyCloud GitHub integration. The mandate forbids merging #37 yet, and this
environment has no deploy credentials, so the exact head has **not** been deployed and nothing is labelled
PRODUCTION_ACCEPTED. After merge and deploy, on the real URL:

1. `node scripts/commission-v7.mjs https://kora-api.rumptycloud.app baseline --expect-commit <merged sha> --out baseline.json`
   with `KORA_CREATIVE_ENGINE` unset (v2).
2. Set `KORA_CREATIVE_ENGINE=v3` and `KORA_MEDIA_PUBLIC_URL=https://<media origin>`; redeploy; run the `v3` phase
   (adds owner logo/photos, publish and MATCH, monitoring, controlled failure and recovery, artifacts, brand-version test).
3. Run the `rollback` phase after setting the flag back to `v2`.
4. File the three evidence JSONs under `docs/live/` and only then update this ledger.

## Honest limits

- Live posting to any social platform is NOT_CONFIGURED; artifacts are created, never posted.
- Print is RGB (A5 with bleed), not press-ready CMYK.
- Real-device testing was not done; Firefox/WebKit runs are desktop engines on Linux.
- Object storage is not needed at current volume (pictures live in Postgres); revisit when uploads grow.
- Model-assisted copy has only been exercised against a stub model.
- Video export depends on ffmpeg being present in the deployment (`WITH_FFMPEG`).
- The research study is one page per site (the home page), measured with a lab browser.
