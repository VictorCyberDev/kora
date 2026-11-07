# Release readiness

**Verdict: not ready to ship as "the transformation". Ready for human review of an isolated branch.**
Nothing was deployed, merged, migrated in any shared database, or configured on RumptyCloud. No production secret was read,
set or requested.

## What is ready (evidence in this directory)

- The Kochab failure (1 page) is fixed: 5-6 complete pages in every direction; bakery, ambiguous and 19 other cases likewise.
- Every generated site passes a whole-site gate (pages, substance, truncation, links, contact path, claims, numbers).
- All repository checks exit 0 on the final code: `format`, `lint`, `typecheck`, `build`, `pnpm -r test` (see `logs/`).
- Browser QA across 22 businesses × 3 directions × all pages × 2 viewports: no overflow, broken images, console errors,
  or serious/critical axe violations (one defect found and fixed during this; see PERFORMANCE.md).
- Safe deletion (idempotent, audited, tenant-isolated, race-safe) and allowance restore, with integration tests; an
  independent security review was run and its verified findings fixed (SECURITY-REVIEW.md).
- Additive migrations 028 and 029 only; rollback by flag or redeploy (MIGRATION-PLAN.md, ROLLBACK-PLAN.md).

## What is NOT done or NOT met (read before deciding)

1. **Bakery image target (10 relevant placements) is not met** from curated photos: 6 placements, 3 distinct photos. Needs
   owner photos, owner-selected Unsplash picks, or more vetted catalogue photographs. The engine now prefers fewer honest
   images over repeats and unrelated ones.
2. **Unsplash was never called for real.** Only a local fake server was used. The integration needs the operator's key and
   an operator decision on caching (MEDIA-COMPLIANCE.md). Do not enable `KORA_MEDIA_UNSPLASH` until the key is configured.
3. **Research gaps:** no competitor study, no fresh design-category study (RESEARCH.md).
4. **Owner control gaps:** no editor UI; no section or page regeneration; no add-section; no undo UI (version restore exists).
5. **Quality gaps:** no Lighthouse / Core Web Vitals / field data; no visual-regression baseline; no real-device or
   screen-reader testing; no test of conflicting owner facts; owner-photo flows not re-tested against the new architecture;
   the page copy is first-party editorial text that no one outside this session has reviewed.
6. **Security residuals** (SECURITY-REVIEW.md): owner-attestation of edit text is self-declared; media objects are not
   cryptographically bound to a server-held candidate; deleted sites' custom-domain rows and monitors are not retired;
   a retention period for enquiries and a purge job need a human decision; no email delivery exists or is claimed.
7. Multi-instance caveat: the candidate list offered to an owner is process-local; with several API instances a selection may
   need a fresh search (the quota counter itself is shared).
8. `KORA_CREATIVE_ENGINE` still defaults to `v2`: nothing changes in production until the flag is set to `v3`.

## Exact next authorised action

Human review of branch `claude/eloquent-turing-38283b` (diff against `e2b62df`). If accepted for staging, with explicit
authorisation: apply migrations 028 and 029 to a **staging** database, deploy the branch with `KORA_CREATIVE_ENGINE=v3`,
and run the existing commissioning script (`scripts/commission-v7.mjs`) plus one live generation of the Kochab and bakery
briefs. Production deployment, merge to `main`, and enabling Unsplash each need their own approval.
