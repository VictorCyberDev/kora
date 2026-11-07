# Release readiness (completion pass)

**Verdict: a reviewable release candidate for staging, not for production.** Nothing was deployed, merged, migrated in any
shared database, or configured on RumptyCloud. No production secret was read, set or requested. Real Unsplash and a real
language model were never called.

## What is ready (evidence in this directory)

- Kochab Studio: six pages in every direction (`digital-studio`), no invented clients, awards or testimonials.
  Before/after screenshots in `screens/`.
- Sweet Crumbs Bakery ("I bake cakes and small chops."): cakes and small-chops pages, gallery, form, 15-18 photo placements
  from 10-11 distinct photographs, never more than two uses of one photo, none unrelated.
- "I cut hair.": six pages, one "Haircuts" offering, no duplicate page (thin by nature; see KNOWN-LIMITATIONS.md).
- 23 businesses × 3 directions: 6-7 pages each, 0 blocking issues; 420 pages × 2 viewports with 0 overflow, 0 broken images,
  0 console errors, 0 axe serious/critical.
- Exit codes: install, format, lint, typecheck, build, `pnpm -r test` (`logs/exit-codes.txt`); web build and 27 Playwright e2e
  tests including the visual-editor journey (`logs/e2e-exit-codes.txt`); QA runs (`logs/qa-exit-codes.txt`).
- The ten findings of the independent security review are closed or bounded with tests, several mutation-checked
  (SECURITY-REVIEW.md); safe deletion, restore, explicit enquiry export/erase.
- Owners can edit through a visual editor with validated operations, undo and restore; no HTML editor.
- Optional model composition cannot change structure, links or design and falls back to the deterministic site.
- Research done and applied where it changed code, and recorded where it did not (`docs/research/RESEARCH-APPLICATION-2026.md`).
- Migrations 028-030 additive; rollback by flag or redeploy (MIGRATION-PLAN.md, ROLLBACK-PLAN.md).

## What is NOT done or not validated (read before deciding)

1. **Real Unsplash:** pending operator credentials and a caching decision (MEDIA-COMPLIANCE.md). Keep `KORA_MEDIA_UNSPLASH` off until then.
2. **Real language model:** composition tested with stubs only. Keep `KORA_MODEL_COMPOSE` off until a real model's output has been read by a person.
3. **Performance:** no Lighthouse, Core Web Vitals or field data; no visual-regression pixel baseline.
4. **Accessibility beyond axe:** no screen-reader or keyboard-only walkthrough; no real devices.
5. **Copy:** industry knowledge and fallback wording are first-party editorial text not reviewed by anyone outside this work.
6. **Retention:** no retention period or purge exists; a human data-protection decision is needed. Custom domains of a restored site must be re-attached by hand.
7. **Owner confirmation** is a recorded human action, not proof of truth.
8. **Catalogue audit:** 50 of 64 photographs audited this pass by reading each Pexels page; the other 14 are the earlier set.
9. **Research limits:** page-text fetches only (no typography/colour/phone-layout observation); thin evidence for photographer, medical, small chops.
10. **Not rehearsed:** migrations on a production-sized dataset; end-to-end monitoring of a generated site by the new code.
11. `KORA_CREATIVE_ENGINE` still defaults to `v2`: nothing changes anywhere until the flag is set to `v3`.

## Exact next authorised action

Human review of branch `claude/eloquent-turing-38283b` (diff against `e2b62df`). If accepted for staging, with explicit
authorisation: follow STAGING-RELEASE-INSTRUCTIONS.md (migrations 028-030 on a **staging** database, deploy with
`KORA_CREATIVE_ENGINE=v3`, commissioning script, live generation of the three mandatory briefs, editor walkthrough). Production
deployment, merge to `main`, enabling Unsplash and enabling model composition each need their own approval.
