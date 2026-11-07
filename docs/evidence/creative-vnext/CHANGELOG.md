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
