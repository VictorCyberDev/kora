# Security review

Two reads: my own while building, and an **independent read by a reviewer agent** (read-only; it was given the file list
and the threat questions, not my conclusions). Its report is analysis, not authority: each finding below was checked in the
code before it was acted on. No external penetration test or human security review has been done.

## Independent review (first pass): findings and disposition after the completion pass

Every finding was verified in code before it was acted on. "Closed" means a test exists that fails when the guard is removed
(mutation-checked) unless stated.

| #   | Severity | Finding                                                                                                    | Disposition after the completion pass                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium   | A publish already in flight could set a just-deleted site back to `PUBLISHED`.                             | **Closed.** `setSiteStatus` is guarded by `deleted_at IS NULL`; `publishNow` aborts if the site was deleted; Site Host queries filter `deleted_at IS NULL`. Concurrency tests for publish-vs-delete and in-flight publish.                                                                                                                                                                                                                                                                |
| 2   | Medium   | Delete only flipped a DB flag; an external publisher would keep serving.                                   | **Closed** (first pass): `publisher.unpublish` for non-Kora hosts, `providerAction` in the response.                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | Medium   | Claim check depended on a client-declared `author`; owner attestation was self-declared.                   | **Closed as far as server-side verification can go.** The client `author` field is gone. Claim-like wording is accepted only if the owner has recorded a confirmation for that exact text (`POST /api/sites/:id/confirmations`; append-only `owner_confirmations`, text hash, user, time) and the server looks the hash up. Without it the edit fails closed. **Residual (by nature):** a confirmation is a recorded human action, not proof the statement is true.                       |
| 4   | Medium   | `replace-media` accepted forged provider provenance and URLs.                                              | **Closed.** Bundled-catalogue pictures get provenance derived on the server from the catalogue; stock pictures need a server-signed selection token bound to organisation, site, expiry and the media fingerprint, verified by `verifyStockMedia`; owner photos must belong to the organisation (`ownerMediaBelongsTo`); AI-generated media is refused; origins and credit-link hosts are validated, attribution is derived, not accepted. Forgery, expiry and cross-tenant replay tests. |
| 5   | Medium   | One account could spend the shared Unsplash allowance; selection had no limiter; `entitled()` not applied. | **Closed.** DB-backed counters (`media_rate_counters`) so limits hold across instances; per-user/per-org limits; one download event per (organisation, picture); `entitled()` and tenant checks on every media route. **Residual:** the quota reserve is a floor kept back from all callers, not a priority lane for interactive owners.                                                                                                                                                  |
| 6   | Low      | Process-local candidate and limiter maps; `select` could 410 on another instance.                          | **Closed.** Candidates are cached in `media_candidate_cache` and signed into tokens, so any instance can honour a selection; a two-instance harness test proves it.                                                                                                                                                                                                                                                                                                                       |
| 7   | Low      | Provider URL checks allowed `http:` and any download path.                                                 | **Closed** (first pass).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | Low      | Hostile `X-Ratelimit-Remaining` could overflow `::int`.                                                    | **Closed** (first pass).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9   | Low      | Domains, monitors, pending actions and other readers survive deletion.                                     | **Closed.** In one transaction deletion marks custom domains `RELEASED` (with a status event), rejects open recovery proposals, and monitoring is stopped (`stopSite`); ops, public events and owner-media routes exclude deleted sites. Restore re-checks the allowance under the same advisory lock. **Residual:** re-attaching a custom domain after restore is manual.                                                                                                                |
| 10  | Low      | `/api/media/providers` leaked configuration problems.                                                      | **Closed** (first pass).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Retention of a deleted site's enquiries

No timed purge exists and no retention period is invented. Enquiries are kept; an owner can restore the site, export the
enquiries of a deleted site, or erase them explicitly (`erased_at` records that it happened, nothing is silently purged).
A retention period and any scheduled purge need a human data-protection decision.

## Not covered by any of the above

No external penetration test and no human security review has been done. The preview iframe is sandboxed with
`allow-same-origin allow-scripts` and loads only platform-rendered output. The model-composition layer can only change
editable text fields by id, runs the claim validator and the whole-site gate, and treats owner text as data.

## Checked and found sound (by the reviewer, and by tests here)

Cross-tenant delete/impact (404 for foreign and unknown ids, ADMIN required, org-scoped `UPDATE`); media routes (MEMBER/VIEWER
via `siteFor`, candidates keyed by organisation); allowance race (advisory lock; mutation test: 3 admitted with the lock, 5
without); SQL (all parameterised, migrations additive); Unsplash key (header only; absent from every response in tests);
stored XSS/attribute injection from provider text (control characters and `<>` stripped, `esc()` on every attribute and text
node, URL regexes forbid quotes and angle brackets, CSP `default-src 'none'`); structural invariants of the new edits (home and
contact protected, links rewritten on page removal, output re-parsed, page cap enforced).

## Other trust properties

- No model call exists in any new path. Model-written text is untrusted: it must satisfy the claim check and the schema.
- CSP, immutable versions, audit log, recovery lifecycle: unchanged.
- Provider text (descriptions, creator names) is data, never instructions, and never sent to a model.
- **Enquiries and email:** enquiries are stored and shown in the owner's inbox (`/api/sites/:id/forms`) with an in-app
  notification. **No email delivery was configured or verified**, so none is claimed.
- **Retention decision needed:** deletion keeps the site row, its immutable versions and its enquiries (versions cannot be
  deleted by design; enquiries are customers' data). No purge job exists. The owner is told this in the impact text. A
  retention period and purge job need a human decision (data-protection obligations differ by region).
