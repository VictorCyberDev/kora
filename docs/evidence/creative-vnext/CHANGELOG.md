# Changelog (vNext, unreleased, branch `claude/eloquent-turing-38283b`)

## Added

- `BusinessBlueprint`, provenance categories, versioned industry knowledge profiles (`packages/creative`).
- `digital-studio` vertical; `classifyVertical` with confidence/alternatives/evidence.
- Blueprint-driven 4-7 page planner, section builders, `fitText`, `MAX_SITE_PAGES`/`MIN_SITE_PAGES`.
- Whole-site `completenessV3` gate and bounded `repairCompleteness`; three new critic dimensions.
- Structured edits: `remove-page`, `move-page`, `section-text`, `replace-media`; optional section `eyebrow`.
- Media provider contract, Unsplash adapter, quota (memory + Postgres), candidate pool, image manifest, photo-credit footer, `POST /media/candidates|select`, `GET /media/providers`, `GET .../media-manifest`.
- `DELETE /api/sites/:id`, `GET /api/sites/:id/deletion-impact`; allowance lock; migrations 028, 029 (additive).
- Tests: 94 creative, 49 site-schema vnext, media provider + integration, lifecycle integration; scripts `scripts/creative/{matrix-report,shoot,qa}.mjs`.

## Changed

- Description minimum 12 → 3 characters (`briefSchema`, `missingBlockingDetails`): a one-word brief now generates.
- `process` section no longer limited to book/quote/enquire trades.
- Subpages no longer reuse the home hero photograph; topic pages show only pictures tagged for the topic; at most two uses of a photo per site.
- Visible copy is fitted at sentence/clause boundaries instead of cut with an ellipsis.
- Plan allowance excludes deleted sites.

## Fixed

- Kochab Studio classified as SaaS and rendered as one page; bakery classified as catering; navigation labels cut with "…"; no photo credits rendered.

## Behaviour that did not change

- Renderer, CSP, immutable versions, publish/verify, Site Host, monitoring, incident/recovery, billing logic, auth.

# Completion pass (same branch, after `4d937be`)

## Added

- Visual editor (`apps/web` Edit website): page list with reorder/add/remove up to seven, section reorder/add/remove, text and
  item editing, picture picker (Kora photos / my photos / stock), regenerate section/page, undo and restore, desktop and phone
  preview, publish, review-before-publish note. No HTML editing: every change is a validated SiteSpec operation.
- New edit operations: `add-section`, `regenerate-section`, `regenerate-page`, `add-page`, `item`, `seo`, `page-meta`, `cta-label`.
- Server-held owner confirmations (`owner_confirmations`, append-only); signed media candidate/selection tokens; shared
  (multi-instance) candidate cache, rate counters and selections; erase/export/restore for deleted-site enquiries.
- Optional model-assisted composition (`KORA_MODEL_COMPOSE`): editable-field ids only, fact validator, whole-site gate, fallback.
- Vetted catalogue 14 → 64 photographs (50 audited) with topic and recipe tags; `image-licence-audit.json`.
- Research: competitor analysis, two category design studies, `RESEARCH-APPLICATION-2026.md`.
- Migration 030.

## Changed

- Trade matching uses word boundaries ("Hair by Ngozi" is no longer an NGO); "I cut hair" reads as a barber; a bakery without
  "Bakery" in its name is a bakery; a single stated offering merges into its topic.
- Contact-led trades get the mobile quick-contact dock on every direction (`dock-policy.ts`); critic warnings follow the same rule.
- Contradictory opening hours are not published; the owner is asked.
- Deletion retires custom domains, monitoring registrations and open proposals in one transaction.
- Client-declared `author` removed from edits; claim-like wording needs a server-held confirmation.

## Fixed

- Lint errors in session-2 files; QA scripts waited for lazy images; stale documentation.

# Zero-cost local commissioning pass (same branch, after `1c34f56`)

## Added

- `scripts/commission/` (local commissioning: previous-release upgrade, migration rehearsal, HTTP journeys, browser checks, rollback rehearsal, deployment-order and image-contents rehearsals, load/memory),
  `playwright.live.config.ts` to run the repository's Playwright suite against already-running services.
- `CONFIGURATION.md`, `HOSTING-ARCHITECTURE.md`, `LOCAL-COMMISSIONING-REPORT.md`; `.env.example` entries for the release switches.
- Startup `release switches` log line and warnings for switches that would do nothing; `ConfigError` (exit 78) for invalid switches; a test that keeps every documented switch value valid.

## Changed

- Release switches and `KORA_SECRETS_KEY` are validated **before** the database is touched.
- Site Host readiness is 503 (`schema: "outdated"`) until the schema is current.
- Staging documentation: `KORA_MODEL_COMPOSE` takes `true`/`false`; two application deployments plus one database; `demo-service` not deployed (`KORA_LEGACY_MONITOR=false`).

## Fixed

- `pnpm lint` failed on the generated example sites added to the evidence directory (now excluded).
