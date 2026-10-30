# Visual QA

## What runs (CI: `npx playwright test`, spec `e2e/design-qa.spec.ts`)

For 13 fixture briefs (`packages/site-schema/test/fixtures/briefs.ts`) x 3 directions = **39 generated sites**, rendered by the production renderer and loaded in Chromium:

- at 375, 390, 768, 1024 and 1440 px: no horizontal overflow, exactly one `h1`, one `main`, no image without `alt`, 1-5 bundled fonts loaded, **zero failed requests, zero console errors**;
- axe-core WCAG 2.1 A/AA on every site: **0 violations**;
- keyboard: skip link is the first tab stop, the phone menu opens with Enter;
- weight: < 90 KB of HTML+CSS+JS, ≤ 5 font files, < 150 KB of fonts, no third-party requests.

Unit tests (`packages/site-schema/test`, 150 tests): v1 golden hashes unchanged; schema refusals; palette contrast for every colourway at every hue shift; every font file exists;
lint-clean and quality-clean output for all 39 sites; anti-fabrication (no invented section/number/claim); markup in owner text is escaped; diversity floors; no single look dominates;
visual controls; upgrade v1→v2; the AI path refuses clichés/invented facts/unknown components.

Set `DESIGN_QA_SHOTS=dir` to write desktop/tablet/phone screenshots.

## Results (this branch)

- Fixture sites: 13, directions: 39, viewports: 5 → 195 page loads, all pass. Axe: 39 sites, 0 violations (after fixing real contrast failures it found: accent colour used as text, WhatsApp green).
- Diversity (direction A, 13 sites): 11 hero compositions, 6 header styles, 9 type pairings, 11 palettes, 13 distinct component-variant sequences. Matrix: [diversity-matrix.md](diversity-matrix.md); picture: `diversity-sheet.jpg`.
- Weight: HTML+CSS 31-55 KB per site, fonts 28-81 KB.
- Before/after (v1 vs v2) for an interior studio, local repair, SaaS, restaurant and consultant: `before-after/`.

## Known limits (stated, not hidden)

- Judgement of taste is mine and the screenshots'. They show visibly different, coherent sites; they are not a claim that every business's site is award-quality, and there has been no study with real owners.
- Two of 13 fixtures (a consultant and an interior studio) share a look (`portfolio-reel`) with different colour and type; the test allows at most two per look.
- Imagery is abstract art unless the owner supplies an image. There is no stock-photo provider and no upload storage yet (`source: "upload"` is reserved), by design: no unlicensed or broken photos.
- Scroll-reveal depends on `animation-timeline: view()`; browsers without it show content statically.
- Lighthouse/CrUX field metrics were not measured; budgets above are byte budgets plus zero-JS, not measured LCP.
- The experimental Rumpty bucket publisher does not serve bundled fonts.
