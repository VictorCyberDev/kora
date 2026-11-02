# Creative quality system (v3)

## Critic

`criticV3(spec)` returns structured issues (`code`, `severity`, `dimension`, `message`, `repairable`) rather than one
score. Codes: HERO_WEAK_HIERARCHY, HERO_NO_ACTION, CTA_TOO_GENERIC, TOO_MANY_CARD_GRIDS, REPEATED_SECTION,
EXCESSIVE_RADIUS, BRAND_TOO_GENERIC, IMAGE_STYLE_INCONSISTENT, IMAGE_SOURCE_MIXED, IMAGE_ALT_MISSING, TYPE_PAIRING_WEAK,
MOBILE_ACTION_BURIED, COPY_CLICHE, INVENTED_NUMBER (block), UNSUPPORTED_CLAIM (block), MEDIA_UNREVIEWED (block),
IMAGE_HEAVY, THIN_PAGE. Twelve dimensions: brandDistinctiveness, businessFit, conversionClarity, hierarchy, typography,
artDirection, composition, mobile, accessibility, performance, truthfulness, crossChannelConsistency.
`repairV3` applies only safe repairs (generic CTA, excessive radius, missing signature device) and returns a new spec.
`GET /api/sites/:id/versions/:id/quality` returns issues, dimensions and budget breaches for v3.

## Anti-sameness

`similarityV3` weighs what a designer notices first (hero family, header, section sequence, type voice, palette
behaviour, mode, radius, service layout, motif, genome distance). `diversityReport` gives max and mean.
Test results on the 18 golden businesses: mean pairwise similarity < 0.3; no pair at or above 0.72; any pair at or
above 0.6 differs in type voice or colourway. Five bakeries with different feels land on at least four distinct
typefaces and at least four distinct grammars.

## Visual QA

`scripts/design-qa/v7-golden.mjs` renders the golden businesses (three directions each); `v7-shoot.mjs` serves them
with the real font and media routes and captures 390 px and 1280 px screenshots with axe (WCAG 2 A/AA), horizontal
overflow, console and failed-request checks; `v7-artifacts.mjs` renders the cross-channel set with geometry gates and
`v7-art-sheet.mjs` / `v7-sheet.mjs` build contact sheets. This loop found and fixed real defects: a contrast bug in the
colour engine on mid-tone brand colours, a mid-word headline break, a placeholder graphic that out-shouted a quiet
brand, a mis-classified photographer showing a restaurant interior, headline clipping and CTA overlap on posts, and
font name tables that made the server rasteriser fall back to Inter.

## Budgets (asserted in tests)

Per generated site across the 54 golden renders: home HTML < 45 KB, CSS < 48 KB, `site.js` < 3 KB, at most six font
files per site, no executable inline script, bundled stock < 260 KB each. No WebGL, no scroll JavaScript, no third-party
requests.

## Honest limits of visual QA

Pixel-diff regression is not implemented (dynamic images make it brittle); the stable guarantees are layout metrics,
contrast, overflow and the budgets above. The screenshots are a point-in-time artefact, not a CI baseline.
