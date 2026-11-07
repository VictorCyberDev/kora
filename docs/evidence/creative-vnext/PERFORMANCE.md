# Performance

**What was measured** (`scripts/creative/qa.mjs`, real Chromium via Playwright, real renderer; outputs
`qa-direction0.json`, `qa-direction1.json`, `qa-direction2.json`, exit codes in `logs/qa-exit-codes.txt`): 23 acceptance
businesses, **each of the 3 directions, 140 pages per direction (420 pages)**, desktop 1280 px and phone 390 px, generated with
a phone number supplied so the mobile quick-contact dock is exercised.

| Measure                                                                                                                            | Result (all three directions) |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Site code weight (HTML + CSS + JS + favicon, whole site)                                                                           | 44 KB min, 63 KB max          |
| Largest single HTML page                                                                                                           | 13 KB (repo budget: 200 KB)   |
| Horizontal overflow, either viewport                                                                                               | 0 pages                       |
| Broken images (after loading every lazy image)                                                                                     | 0                             |
| Console errors                                                                                                                     | 0                             |
| axe-core WCAG 2.0/2.1/2.2 A/AA violations, serious/critical                                                                        | 0                             |
| Contact page has a form                                                                                                            | 21 / 23 (see below)           |
| Playwright e2e (8 viewport widths for Kora's own UI, editor, brand centre, local AI, design QA incl. a third-party-request budget) | 27 passed                     |

The two sites without a form are plumber and cleaning: when a phone number is supplied, call-led trades get the call-first
contact layout, which pre-dates this work (`call-first` exists at the baseline commit). Without a phone number all 23 have a form.

**Defects found and fixed by this process:** colour contrast of card text on primary-coloured cards (4.22:1, fixed in
`parts.ts`, earlier pass); and in this pass the QA tool itself reported one broken image on a phone page that was a lazy-load
timing artefact: the check now forces and waits for every image, and a genuinely missing file would still be reported.

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
- Generation cost: no model call and no token use unless `KORA_MODEL_COMPOSE` is on (then one bounded call per generation). Planning all three directions for a business takes milliseconds
  (test suite: 22 businesses × 3 directions in well under a second). Unsplash: at most 4 searches per generation, shared
  hourly allowance, cached per query.
