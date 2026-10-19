# ADR-010: Deployment Verification (not cryptographic)

**Status:** Accepted

## Context

ADR-009 gives each service a self-reported runtime claim at `GET /__kora`. A claim alone says what a workload says about itself. Operators also need to know whether that matches what the source repository says should be running, and to be told plainly when Kora cannot tell.

## Decision

Kora compares two legs and reports one status. The name of the check is **Deployment Verification (not cryptographic)**.

- **Source leg:** the head commit of `GITHUB_BRANCH` in `GITHUB_REPO`, read from the GitHub REST API (`GET /repos/{owner}/{repo}/git/ref/heads/{branch}`). Public repositories need no token.
- **Workload leg:** the workload's runtime claim from `MONITOR_CLAIM_URL` (default: the health URL's origin plus `/__kora`), validated strictly against `kora.runtime-claim/v1`. An unknown schema, an extra field or a malformed value makes the claim unreadable; a valid claim whose `commit` is `null` is recorded as a claim with no commit.
- **Relation:** when both commits exist and differ, GitHub's compare API (`/compare/{claimed}...{head}`) says how they relate: identical, claimed behind by N, claimed ahead, or diverged. If that call fails, only "differs" is recorded.
- **Provider leg:** always reported as `NOT COLLECTED`, with the reason "Rumpty exposes no documented deployment revision signal". Kora does not guess a provider revision.

A pure, deterministic function maps the observations to exactly one status, checked in this order:

| Status                | Meaning                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAIM_UNREACHABLE`   | The claim could not be read or did not validate (or was not collected). Nothing can be compared.                                                                 |
| `CLAIM_HAS_NO_COMMIT` | The claim is valid but carries no commit.                                                                                                                        |
| `SCM_UNKNOWN`         | The source head could not be determined (network, 401/403/404, bad payload).                                                                                     |
| `MATCH`               | The claimed commit equals the source head.                                                                                                                       |
| `BEHIND`              | The claimed commit is N commits behind the head (N is reported).                                                                                                 |
| `DIVERGED`            | The commits differ and the claim is not shown to be behind: GitHub reports diverged or claim ahead, or the compare call failed (relation reported as `differs`). |

Every status lists the evidence it used by observation id. Every failure is recorded as `UNKNOWN` with a short fixed-vocabulary reason; nothing throws.

**Persistence.** Migration `005_verification_observations.sql` stores one row per observation, grouped by `check_id`. Unknown values stay `NULL`; constraints reject inconsistent rows. Migration `006_verification_observations_append_only.sql` makes the table append-only in the database, mirroring 003 and 004: `BEFORE UPDATE` and `BEFORE DELETE` row triggers and a statement-level `BEFORE TRUNCATE` trigger (which also stops `TRUNCATE services CASCADE`) raise an exception, while `INSERT` is unchanged. 005 was written before this guard and its header comment still says "append-only by convention"; 006 supersedes that comment. One check is written in a single transaction, so a failure leaves nothing from that check. `GET /services/:id/verification` reads the latest check and computes the status; it writes nothing. It returns `404 verification_not_run` until a check has run.

**Secrets.** `GITHUB_TOKEN` is optional, sent only as one `Authorization` header to the configured GitHub API, kept non-enumerable in the config and in a private field of the verifier, and never put in a URL, observation, error, log or response. Reasons never copy response bodies, headers or received values. URLs carrying credentials are rejected.

## GitHub rate limits

Unauthenticated GitHub REST calls are limited to 60 per hour **per source IP address**. A platform that shares egress IPs between customers (Rumpty documents no dedicated egress address) can exhaust that allowance before Kora makes its first call, so an unauthenticated check can fail with HTTP 403 from the first request.

- **Classified, not hidden.** A `429`, or a `403` whose `x-ratelimit-remaining` header is `0`, is recorded with the reason `rate_limited`; every other `403` stays `http_status_403`. `safe-fetch` reads that one header as a boolean. No header, body or error text is copied into an observation or a log. `SCM_UNKNOWN` then says the source was rate limited and that setting `GITHUB_TOKEN` raises the limit.
- **Fewer calls.** Kora keeps the last `ETag` per URL in memory and sends `If-None-Match`. On `304` it reuses the previous validated result for that URL, recorded as `OBSERVED` with the new `observed_at` and `http_status` 304; GitHub does not count `304` answers against the limit. The cache is bounded, never persisted, holds no token, and starts empty after a restart. An invalid payload or an unusable ETag is not cached.
- **No retry storm.** Kora makes no retry. A check calls GitHub once for the head and, only when the commits differ, once for compare; after a `rate_limited` result nothing more is sent until the next scheduled interval.
- **Not solved by Kora.** An optional `GITHUB_TOKEN` (see the runbook) raises the limit; it is the remedy, not a requirement.

## What this is not

It is not cryptographic: nothing is signed, and neither side is authenticated to the other. A claim is whatever the workload says (ADR-009); the source head is whatever GitHub's API returned at that moment. A `MATCH` means those two statements agree, not that the code running is the code at that commit. Do not use it as an authorization input or as a deployment receipt. The provider leg, the only independent view of what the platform deployed, is not collected.

## Consequences

- Operators get an honest status, including "cannot tell", with the evidence behind it.
- Rate limits and request volume are handled as described in "GitHub rate limits" below.
- Observations are append-only, enforced by database triggers (migration 006). This stops application code and accidental statements; a role that owns the table can still drop or disable the triggers, so it is not protection against a database administrator.
- `GET /services/:id/verification` is unauthenticated like the rest of the API (see the threat model).

## Alternatives considered

Asking the provider what revision it deployed (no documented signal exists), signing claims with a platform-held key (needs key management and a verifier), and failing the status when compare cannot answer (hides a known difference).
