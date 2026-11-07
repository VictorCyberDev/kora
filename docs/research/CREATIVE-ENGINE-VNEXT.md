# Creative Engine vNext: research, findings and architecture decision

Branch `claude/eloquent-turing-38283b`, starting commit `e2b62df`. Written 2026-11-07.
Nothing here was deployed. Everything below distinguishes **observed in this repository / this session**, **read from a
primary source this session**, and **not done**.

## 1. Existing implementation findings (observed, reproduced)

Pipeline traced in code: brief → `POST /api/sites/:id/generate` (`apps/api/src/platform/routes.ts`) →
`SiteAuthor.generateV3` (`author.ts`) → `planDirectionsV3` (`packages/site-schema/src/v3/plan.ts`) →
`composeDirections` (`packages/creative/src/directions.ts`) → `planSiteV3` → `parseSiteSpecV3` → `renderSiteV3` →
immutable `site_versions` row → publish → Site Host (`status='PUBLISHED'`) → monitors.

**The Kochab Studio failure was reproduced against the real planner** (script `scripts/creative/matrix-report.mjs`, output
`docs/evidence/creative-vnext/matrix-before.json`): every direction produced **one page of two or three sections** (hero,
contact). Root causes, each verified in code and not inferred from appearance:

| #   | Cause                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | **Misclassification.** `resolveVertical` scored by the longest, earliest regex match. "software" and "startup" (`saas`) beat the owner's actual self-description, "creative technology agency". No vertical matched "creative technology", "motion graphics" or "marketing automation".                                 | `resolveVertical` returned `saas` for Kochab.                                                        |
| 2   | **Sparse-content suppression.** `saas` has `singlePageSuffices: true`; `wantSub = !(v.singlePageSuffices && !truth.can.photos && services.length < 4)` was false, so no subpage was created. Each remaining page kind also required extracted services, supplied photos or a contact method before it would be created. | `plan.ts` L910-L1020 (before).                                                                       |
| 3   | **Service extraction missed the owner's words.** `extractServicesV2` only recognised "we provide/offer/do…". "We combine software development, design, motion graphics, and marketing automation" yielded no services, so the offer section was also dropped.                                                           | Kochab produced zero services.                                                                       |
| 4   | **Truncation by ellipsis.** Visible copy was cut with `cap()` (`slice(...)+"…"`): hero subheading, About body, SEO description, and navigation labels.                                                                                                                                                                  | Observed in screenshots ("…" in nav labels).                                                         |
| 5   | **Bakery misclassified as catering.** "small chops" (longer, equal-position match) outscored "bake/cakes".                                                                                                                                                                                                              | `resolveVertical("Sweet Crumbs Bakery I bake cakes and small chops.")` returned `catering` (before). |
| 6   | **Twelve-character brief floor.** `briefSchema`/`missingBlockingDetails` rejected descriptions under 12 characters, so a one-word brief ("Bakery") returned 422 / threw.                                                                                                                                                | `matrix-before.json` `one-word` row.                                                                 |
| 7   | **Subpages repeated the home hero photograph**, and a topic page could show a photo of a different offering (cake photos on a "Small chops" page).                                                                                                                                                                      | Seen in Chromium screenshots of the new engine during development; fixed (see ARCHITECTURE.md §5).   |
| 8   | **No photo credits were rendered anywhere**, which would breach Unsplash's attribution rule the moment a provider photo is placed.                                                                                                                                                                                      | `grep attribution render.ts` empty.                                                                  |
| 9   | **No website deletion existed**; `site_versions` rejects DELETE by trigger, and the plan allowance counted every row ever created.                                                                                                                                                                                      | No `DELETE /api/sites/:id` route; `billing.ts` `COUNT(*) FROM sites`.                                |

Not a cause (checked): the AI provider (v3 generation is fully deterministic; `KORA_COPY_ASSIST` only proposes a headline);
the renderer (it rendered every page it was given); API mapping and version storage; a preview-vs-final mismatch (both call
the same `planSiteV3`, and the stored artifact is what publishes).

Baseline suite (commit `e2b62df`, isolated `_test` Postgres 16): all packages pass; `apps/api` 51 files, 496 passed, 1
skipped; `site-schema` 241 passed.

## 2. Competitor research: **NOT DONE**

The directive asked for a study of Wix, Webflow, Framer, Squarespace, Durable, Hostinger, Relume, Lovable and v0. That
study was **not performed** in this session. I will not report competitor capabilities from memory as if verified, and the
brief's own warning (verified capability vs marketing claim) applies. What exists instead, and is cited by the design work:

- `docs/research/SITE-OBSERVATIONS-2026.md` and `docs/research/data/*.jsonl`: 182 real sites rendered and measured (pre-existing).
- `docs/design/vertical-intelligence.md`, `docs/design/design-intelligence.md`, `docs/design/reference-atlas-v2.md` (pre-existing).

Follow-up needed: a dated, source-linked competitor comparison, kept separate from this implementation.

## 3. Website design research: **partially covered by existing material, not redone**

The page architectures in `packages/creative/src/knowledge.ts` are editorial judgements about how each trade is bought
(customer intent, what to ask, what to include in an enquiry). They were **not** derived from a fresh review of professional
sites in the fourteen named categories. They are labelled `validation: editorial-reviewed` (first-party editorial, by this
session) or `cluster-default` and carry no claim of external validation.

## 4. Technical research

Read from a primary source this session:

- **Unsplash API Guidelines** (help.unsplash.com, fetched 2026-11-07) and **API documentation** (unsplash.com/documentation,
  first 100,000 of ~139,000 characters read). Findings used: hotlink `photo.urls` for every display; keep `ixid` in image
  URLs; credit the photographer **and** Unsplash with links carrying `utm_source=<app>&utm_medium=referral`; call
  `links.download_location` when a person picks a photo; demo mode is 50 requests/hour, production 1,000/hour after
  approval; only `api.unsplash.com` requests count; `X-Ratelimit-Limit/Remaining` headers; `Authorization: Client-ID …`;
  the API is "for non-automated, high-quality, authentic experiences"; users must not need developer accounts.
  **Not stated on the pages read:** caching rules, AI-training prohibition (the brief lists it; the pages read were silent
  on it, so Kora simply never sends Unsplash content to any model; see MEDIA-COMPLIANCE.md).
- Pexels licence (already used by the curated catalogue; `packages/site-media/LICENSES.md`). Pexels CDN was reachable.

Decisions made from reasoning rather than a survey (stated as such): deterministic generation with schema validation over
free-form LLM output; a deterministic critic and bounded repair loop over a multi-agent critique loop (testable, free,
no provider dependency); no embedding-based image retrieval (the catalogue is 14 photographs; tagged topics are exact).
Visual-regression, Core Web Vitals field data and prompt-injection defences: see PERFORMANCE.md and SECURITY-REVIEW.md for
what was actually measured.

## 5. Architecture alternatives and decision

| Option                                                                      | Verdict                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. LLM writes each page's copy and layout from the one-line brief           | Rejected as the base: cost on every preview, non-determinism, fabrication risk, and a provider outage would reduce output to nothing. Kept as an optional later layer.       |
| B. Keep the planner, loosen its gates                                       | Rejected: the gates encode a real rule (never invent) but conflate "owner typed little" with "no content is possible".                                                       |
| **C. Business Blueprint → page architecture → validated SiteSpec (chosen)** | A typed, deterministic understanding of the business (provenance-tagged), versioned industry knowledge, blueprint-driven pages, whole-site quality gate with bounded repair. |

Selected: **C**, added beside the existing lifecycle (SiteSpec → deterministic renderer → immutable artifact → publish →
verify → monitor → recover), which is unchanged.

## 6. Risks and constraints

- **Photography supply is the binding constraint**, not the planner. The curated catalogue has 14 photographs (3 for
  bakeries, none of small-chops). The engine now refuses to show an unrelated or repeated photo, so a bakery gets 6
  placements of 3 distinct photographs, **not** the 10 the acceptance case wants. Reaching 10+ distinct relevant photos
  needs owner photos, owner-approved Unsplash picks (production key), or additional vetted catalogue photographs.
- Unsplash terms: automated placement is not permitted by the guidelines as read; the integration only proposes candidates.
- Knowledge text is general, not business-specific, but it is first-party editorial content that nobody outside this
  session has reviewed.
- Cost: no model call is required for any part of generation, preview, or editing implemented here; the only metered
  external calls are Unsplash searches (hard-capped at 4 per generation, shared hourly allowance with reserve).

## 7. Milestone plan and acceptance criteria

See `docs/evidence/creative-vnext/ACCEPTANCE-MATRIX.md` for each criterion, its status and the command that proves it.
