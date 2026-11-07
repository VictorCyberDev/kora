# Performance

**What was measured** (`scripts/creative/qa.mjs`, real Chromium via Playwright, real renderer; outputs
`qa-direction0.json`, `qa-direction1.json`, `qa-direction2.json`): 22 acceptance businesses, **each of the 3 directions,
130 pages per direction (390 pages)**, desktop 1280 px and phone 390 px. The table below is direction 0; directions 1 and 2
had no overflow, broken images or console errors either, with site weight at most 53 KB and 50 KB.

**Defect found and fixed by this check:** the first run of direction 1 reported 4 serious colour-contrast violations on one
site (small chops, "Handmade Modern"): card descriptions at 85% opacity on the primary-coloured card measured 4.22:1 against
the 4.5:1 minimum. The descriptions are new in this change, so they exposed a latent style. Fixed in `parts.ts`; the re-run is
`qa-direction1.json` (0 violations).

| Measure                                                     | Result                             |
| ----------------------------------------------------------- | ---------------------------------- |
| Site code weight (HTML + CSS + JS + favicon, whole site)    | 39 KB min, 46 KB median, 62 KB max |
| Largest single HTML page                                    | 14 KB (repo budget: 200 KB)        |
| Horizontal overflow, either viewport                        | 0 pages                            |
| Broken images after scrolling the page                      | 0                                  |
| Console errors                                              | 0                                  |
| axe-core WCAG 2.0/2.1/2.2 A/AA violations, serious/critical | 0                                  |
| Contact page has a form                                     | 22 / 22                            |

Images are lazy-loaded below the fold, the hero is `fetchpriority=high`, fonts are preloaded and self-hosted (pre-existing
renderer behaviour, unchanged).

**What was NOT measured, and must not be inferred from the above:**

- No Lighthouse run, no LCP/INP/CLS lab numbers for these new sites, and **no field data of any kind**. The Core Web
  Vitals targets (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1) are therefore unverified for vNext output. The previous v7 study
  (`docs/design/creative-quality.md`) measured 18 older golden sites on throttled slow-4G; it does not cover this code.
- Photograph weight is not in the table: bundled catalogue photographs are 1600 px WebP (roughly 150-250 KB each) and
  Unsplash hotlinks are requested at `w=1600&fm=webp&q=75`. Responsive `srcset` for catalogue photographs was not added.
- axe-core finds a subset of accessibility problems; keyboard-only and screen-reader walkthroughs were not performed.
  axe was run on every page of every direction at both viewports; it does not test hover/focus states or text over photographs.
- Generation cost: no model call, no token use. Planning all three directions for a business takes milliseconds
  (test suite: 22 businesses × 3 directions in well under a second). Unsplash: at most 4 searches per generation, shared
  hourly allowance, cached per query.
