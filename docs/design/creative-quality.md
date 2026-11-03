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

## Final review of the golden set (current engine)

Sheets in `docs/design/v7/`: `golden-desktop-direction-1..3.png` (18 businesses x 3 directions), `golden-mobile-direction-1.png`,
`golden-enriched-with-photos.png` (same briefs with owner photographs: composition changes), `same-industry-*.png` (five
bakeries, five salons, five professional firms, five trades), `before-v2-designer.png` (the previous designer on the same
briefs), `cross-channel-*.png`, `brand-center-*.png`, `landing-*.png`.

Chromium captures with axe (WCAG 2 A/AA), overflow and console: golden 108, enriched 36, same-industry 120, **zero
problems** at 390 and 1280 px. The before set (v2 designer) shows real contrast failures (for example the plumber page),
which is part of the case for v3, not a v3 defect. Firefox and WebKit engines: 108 captures each, zero overflow.
Slow-4G with 4x CPU throttling on 18 golden sites: median LCP about 1.0 s, worst 2.5 s (a 167 KB photograph; the bundled
photo was re-encoded from 250 KB), CLS 0.

Defects found by looking and fixed in this closure: header call-to-action losing its padding and border on most
sites; "Ac install" for "AC install"; nursery language offered to builders and clinics; oversized type; hotel hero
actions misaligned; call number below the first screen. Known weaker spots, stated plainly: sibling trades share one
call-first structure (they differ in colour, type, header and layout variant, but a plumber and an electrician are
recognisably the same family), and text-only heroes without photographs are plainer than agency work with
photography. Owners are asked for photographs for this reason.
