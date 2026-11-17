# Kora M1 + M2 — Engineering acceptance ledger

Scope: [original M1/M2 mandate](../../README.md), implementation in PR #40.
This ledger is intentionally evidence-based; a green test on an earlier commit never certifies a later change.

## Source architecture

| Area | Implementation |
| --- | --- |
| Approved design skills | `packages/creative/src/design-rules.ts` and `skill-registry.ts`; pinned provenance in `third_party/manifest.json` |
| Creative brief / BrandOS | Existing typed design brief, direction composition, BrandOS; augmented runtime guidance in `packages/creative/src/directions.ts` |
| Site generation | `packages/site-schema/src/v3/plan.ts` and `render.ts`; seven-page limit with legacy v1/v2 compatibility |
| Media | Approved owner library, client focal points, Pexels fallback, optional Unsplash server-side search/attribution/quota logic |
| Deterministic critique | `packages/site-schema/src/v3/critic.ts`; bounded repairs run during `SiteAuthor.generateV3` |
| Screenshot QA | `e2e/visual-observe.ts`, `e2e/vision-critic.ts`, `e2e/website-studio-benchmark.spec.ts` |
| Studio | `apps/web/src/pages/website-studio.tsx`, Puck 0.24.0, existing authenticated API and immutable version store |
| Media isolation | `apps/api/src/platform/studio-media-guard.ts`: validates resulting canonical edit across all operations |
| Release and rollback | Existing Site Host, publish/restore API, plus explicit Studio confirmation and live link |

The Puck canvas is an interactive, branded structural representation of the site. **Only the saved iframe preview is a byte-equivalent view of the published renderer.** Do not confuse the two.

## Evidence from the first complete 20-industry run

- Commit: `fc25ab2ea6366f45791d69590cc1cc74212ebefd`.
- [GitHub Actions #44052123574](https://github.com/VictorCyberDev/kora/actions/runs/44052123574): quality **PASS**, E2E **PASS**, Docker build **PASS**.
- Artifact: `kora-studio-benchmark-screenshots` (40 real desktop and mobile images, `visual-review.json`).
- Screenshot reports: 40/40 passed blocking geometry gates; 20 mobile runs reported the nonblocking `SMALL_TOUCH_TARGET` warning. The follow-up CSS fix and stricter gate were committed **after this run**, not yet demonstrated successful here.
- Optional vision review was **NOT EXECUTED** on this run (no configured vision endpoint/credential).
- Several no-photo businesses use geometric plates rather than relevant customer or stock imagery. Visual aesthetics have **not** received independent human acceptance.

## Completion/verification matrix

| Acceptance gate | Source | Evidence status |
| --- | --- | --- |
| Licensed versioned skill registry | Installed, activated in direction and generation engines | Implemented; latest-head tests pending |
| Creative brief + Brand DNA | Existing shared schemas and persisted BrandOS | Implemented; integration present |
| Three different art directions | Production planner + existing previews | Browser-covered; visual diversity still requires review |
| Responsive multi-page generation | v3 PageSpec, routes, metadata, navigation | Tested on baseline; final-head coverage pending |
| Owner uploads + provenance | Media library, server-side provenance checks | Unit tests added; final-head tests pending |
| Unsplash API | Optional rate-aware hotlinking, attribution and download event tracking | Mock tests; **live API and quota not verified** |
| Deterministic design critique + bounded repair | Production author and v3 critic | Integrated; final-head verification pending |
| Screenshot critique + bounded repair | Real Playwright rendered PNGs and DOM measurements | 40 screenshots from baseline; stricter acceptance pending |
| AI vision critique | Optional vision adapter invoked on captured PNGs | **Not verified with an actual provider** |
| Puck editor properties, sections, media, BrandOS | Studio source and auth API | Implemented; full customer editing acceptance pending |
| Publish, verify, restore | Existing Site Host + new Studio controls | Earlier publisher browser tests passed; latest combined UI test pending |
| Accessibility and performance | Playwright design QA and axe / browser checks | Existing tests; new mobile target findings need retest |
| Security / tenant isolation | Auth API, test guard, version persistence | Tests added; final-head test pending |
| Provider reconciliation PR #39 | Main changed six non-overlapping provider files | Incorporated in merge commit `4fcf1470`; combined CI pending |
| Production deployment | Deferred until complete acceptance | **Not deployed** |
| Live production credentials / paid services | Not altered | No new recurring costs |

## Product acceptance scenario

The required bakery journey is partially automated through:
- `e2e/critical-flow.spec.ts`: sign-up, choose direction, preview, edit, publish, public URL, monitor, fault, recovery, audit.
- `e2e/website-studio-flow.spec.ts`: v3 generation, create page, save immutable version, reload, preview, UI publish, live URL, rollback, wrong-tenant image rejection, editor and public screenshot evidence.
- `e2e/website-studio-benchmark.spec.ts`: twenty verticals, real renderer, per-page route/SEO checks, responsive screenshots and visual review.

These are complementary tests. A full real-human trial of every Puck control, specific bakery image replacement and final aesthetics is not yet evidenced.

## Release decision

**HOLD / DRAFT.** Do not mark M1/M2 accepted, merge PR #40, deploy customer sites or claim AI visual review has run until all of the following are true:

1. Final branch head is green across formatting/lint, typechecks, all unit/integration tests, complete browser E2E, Docker.
2. New editor publish/rollback and media-security tests actually pass.
3. Mobile touch warnings clear and the actual screenshots are inspected (not merely created).
4. Customer edits a real image, section, page and brand setting, saves and reloads, previews and publishes the verified result.
5. Brand imagery and quality for the target launch industries are approved, including a compliant Unsplash live check if that provider is enabled.
6. Optional model-vision feature is either configured and independently tested or explicitly excluded from an approved release scope.
7. Existing published v1/v2 sites, monitoring and incident recovery remain unchanged.

## Operations

No new database migrations are introduced by this PR. The optional Unsplash secret is server-only (`KORA_UNSPLASH_ACCESS_KEY`); if absent, production uses its existing licensed media. Optional test-only screenshot-vision environment keys are documented in `.env.example`. No credentials are stored in source. The latest provider contracts merged into main through PR #39 were brought into the branch without overwriting either workstream.
