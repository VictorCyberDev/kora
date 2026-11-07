# Baseline (M0)

| Item                   | Value                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository / branch    | `VictorCyberDev/kora`, `claude/eloquent-turing-38283b` (remote `origin/main` is also `e2b62df`)                                                                                                              |
| Starting commit (HEAD) | `e2b62df7d43f58c803d6709d453c90b69e5174aa` "Reapply Kora v7: creative operating system"                                                                                                                      |
| Working tree at start  | clean                                                                                                                                                                                                        |
| Other branches / PRs   | none other than `main`; no PR inspected or touched                                                                                                                                                           |
| Migrations at start    | 001-027 (`apps/api/src/db/migrations`)                                                                                                                                                                       |
| Creative flag          | `KORA_CREATIVE_ENGINE` `v2`/`v3` (default `v2`); `KORA_COPY_ASSIST` off by default                                                                                                                           |
| Baseline `pnpm build`  | exit 0                                                                                                                                                                                                       |
| Baseline tests         | `pnpm -r test` with isolated Postgres 16 `_test` DB: exit 0; `apps/api` 51 files, 496 passed, 1 skipped; `site-schema` 241; `creative` 41 (log: `logs/baseline-test.log` is git-ignored; totals copied here) |
| Production             | not touched; production serves `main` per `docs/execution/V7-LEDGER.md`                                                                                                                                      |

## Failure reproduction

`scripts/creative/matrix-report.mjs <repo>` runs the acceptance fixtures
(`packages/creative/test/fixtures/business-matrix.json`) through the real planner. Run against a clean checkout of `e2b62df`
built in a separate worktree: `matrix-before.json`.

Kochab Studio, exact brief from the directive: **1 page, 2-3 sections** in all three directions
("Clear Signal", "The Monograph", "Precision Practice"), vertical `saas`. Bakery: 3 pages, vertical `catering`. Ambiguous
"My company provides services.": 1 page. One-word brief "Bakery": **throws** (12-character minimum).
Root causes: `docs/research/CREATIVE-ENGINE-VNEXT.md` §1.

## Architecture map (existing, verified)

| Stage                 | Where                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- |
| API                   | `apps/api/src/platform/routes.ts` `POST /api/sites/:id/generate`, `/design/directions`      |
| Interpretation        | `packages/creative/src/truth.ts` (`buildTruth`), `verticals.ts` (`resolveVertical`)         |
| Directions            | `directions.ts` `composeDirections`, `grammars.ts` (15 grammars), `genome.ts`               |
| Spec                  | `packages/site-schema/src/v3/spec.ts` (`SiteSpecV3`), `plan.ts` (`planSiteV3`)              |
| Render                | `v3/render.ts` `renderSiteV3` (deterministic, CSP, no inline script)                        |
| Critic                | `v3/critic.ts` `criticV3`, `repairV3`                                                       |
| Versions / publish    | `site_versions` (immutable by trigger), `PublishService`, Site Host serves `PUBLISHED` only |
| Monitoring / recovery | `SiteMonitors`, incident engine, policy engine, action executor (unchanged)                 |
