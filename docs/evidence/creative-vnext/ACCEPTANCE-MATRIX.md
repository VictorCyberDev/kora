# Acceptance matrix

Status words: **MET** (executed evidence), **PARTIAL**, **NOT MET**, **NOT DONE**. Each row names the evidence. Commands and
exit codes are in `logs/` (`install`, `format`, `lint`, `typecheck`, `build`, `test`: all `EXIT=0` on the final code except
where noted); the baseline run is summarised in `BASELINE.md`.

## Directive §23 journey (20 steps)

| #   | Step                                        | Status    | Evidence / limit                                                                                                                                        |
| --- | ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | New user creates an account                 | MET       | `lifecycle.integration.test.ts` (real API, isolated DB)                                                                                                 |
| 2   | Enters only name + one sentence             | MET       | same; one-word briefs also generate (`platform.integration.test.ts`)                                                                                    |
| 3   | Kora understands the business               | MET       | 22-case classification matrix test; Kochab → `digital-studio`, bakery → `bakery`; ambiguous → "General business"                                        |
| 4   | Three clearly different directions          | MET       | `vnext.test.ts` (≥ 2 of 5 design dimensions differ between every pair, 3 businesses); screenshots reviewed by eye. Not a human preference study         |
| 5   | User selects a direction                    | PARTIAL   | `generate` takes `direction` (existing); selection UI not touched                                                                                       |
| 6   | Complete coherent 4-7 page site             | MET       | 22 businesses × 3 directions: 5-6 pages, 0 blocking issues (`matrix-after.json`; before: 1-3 pages)                                                     |
| 7   | Appropriate licensed/owner imagery          | PARTIAL   | catalogue photos only where honestly relevant; never repeated more than twice; **bakery 6 placements / 3 distinct photos, target 10 NOT MET**           |
| 8   | Useful non-fabricated content               | MET       | `assertKnowledgeSafe`, claim/number checks over all generated text for the matrix; no prices, hours, reviews, places, years                             |
| 9   | Navigation and CTAs work                    | MET       | link validation in the gate; 130 pages × 2 viewports loaded in Chromium, 0 console errors; published pages fetched in integration test                  |
| 10  | Owner edits text or replaces an image       | MET (API) | `section-text`, `replace-media`, `remove-page`, `move-page` through `POST /edit`; **no editing UI built**                                               |
| 11  | Design identity preserved                   | MET       | edits never touch the genome; direction preview and final use the same `planSiteV3`; spec carries brand hash                                            |
| 12  | Mobile and desktop preview                  | PARTIAL   | existing preview route serves the stored artifact; both viewports were checked by QA script; no new preview UI                                          |
| 13  | Passes generation quality gates             | MET       | `completenessV3` + bounded repair run inside `generateV3`; tested incl. failing cases                                                                   |
| 14  | Owner publishes                             | MET       | integration test publishes; `verification.status === "MATCH"`                                                                                           |
| 15  | Published site matches the approved version | MET       | MATCH verification (existing mechanism) asserted                                                                                                        |
| 16  | Visitor submits a real enquiry              | MET       | public form endpoint → 201                                                                                                                              |
| 17  | Owner sees the enquiry                      | MET       | `GET /api/sites/:id/forms`. **Email notification is NOT configured or claimed**                                                                         |
| 18  | Kora monitors site health                   | UNCHANGED | existing monitors/incident engine untouched; full existing suite passes. Not re-exercised end to end by new tests                                       |
| 19  | Rollback and recovery guarantees intact     | MET       | existing recovery tests pass (`apps/api` 532 passed, 1 skipped); no change to that code                                                                 |
| 20  | Safe delete and reuse of allocation         | MET       | integration tests: confirm-name, audit row, public 404, form 404, allowance restored, idempotent, cross-tenant 404, concurrency lock (mutation-checked) |

## Directive §17 test matrix

| Item                                                                 | Status              | Note                                                                                                      |
| -------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| 20 business types (bakery … ambiguous)                               | MET                 | `business-matrix.json` has 22 cases (adds Kochab and a one-word case)                                     |
| One-word / one-sentence / detailed descriptions                      | PARTIAL             | one-word and one-sentence covered; a long "detailed" brief was only exercised via Kochab                  |
| Owner-supplied imagery                                               | NOT RE-TESTED       | existing owner-media tests still pass; not re-run against the new page architecture                       |
| No imagery                                                           | MET                 | most matrix businesses have none                                                                          |
| Missing contact information                                          | MET                 | form-only contact, asserted no `tel:` and no map                                                          |
| No AI provider                                                       | MET                 | the engine never calls one                                                                                |
| Unsplash rate-limit exhaustion / provider outage / hostile responses | MET                 | mocks only; **no real Unsplash call was made** (no key; none requested)                                   |
| Invalid model responses                                              | N/A                 | no model in the new paths                                                                                 |
| Conflicting facts                                                    | NOT DONE            | no test with contradictory owner facts                                                                    |
| Mobile-only usage                                                    | PARTIAL             | phone viewport QA; no real devices                                                                        |
| Existing historical site versions                                    | MET                 | single-page and eight-page specs parse/render; nine pages rejected                                        |
| Special test A (Kochab), B (bakery), C (ambiguous)                   | A, C MET; B PARTIAL | B: 6 pages, cake and small-chops pages, gallery, form, no invented facts; **10 image placements NOT MET** |

## Directive milestones

| Milestone | Status                                                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | MET (reproduced; **competitor and design-category research NOT DONE**)                                                                                                                          |
| M1        | MET                                                                                                                                                                                             |
| M2        | MET                                                                                                                                                                                             |
| M3        | PARTIAL: provider abstraction, Unsplash adapter (mock-tested), quota, cache, manifest, credits done; curated catalogue **not expanded**; no AI image provider; HMAC candidate binding not built |
| M4        | PARTIAL: direction diversity verified, bakery/agency grammar fit fixed; no new grammars, typography or responsive work beyond defects found in review                                           |
| M5        | PARTIAL: deletion/quota/enquiry journey and four new edits done; **no section/page regeneration, no add-section, no editor UI**                                                                 |
| M6        | PARTIAL: whole-site gate, repair loop, security/accessibility/browser checks done; **no visual-regression baseline, no Lighthouse/CWV**                                                         |
| M7        | PARTIAL: 22 businesses × 3 directions, before/after, QA results; screenshots were viewed during development but only a small sample is committed                                                |

Before/after, measured from `matrix-before.json` and `matrix-after.json` (3 directions per business):

| Measure                           | Before (`e2b62df`)            | After      |
| --------------------------------- | ----------------------------- | ---------- |
| Sites generated                   | 63 (the one-word brief threw) | 66         |
| Pages per site                    | 1 to 3                        | 5 to 6     |
| Sites under four pages            | 63 of 63                      | 0 of 66    |
| Average visible words per site    | 30                            | 404        |
| Copy fields cut with an ellipsis  | 3                             | 0          |
| Blocking issues from the new gate | not applicable                | 0          |
| Contact page with a form          | not measured                  | every site |

Word count is a crude proxy: the extra words are mostly industry-general guidance, FAQ answers and enquiry prompts, not
business-specific copy. It shows the sites are no longer empty, not that the writing is excellent.
