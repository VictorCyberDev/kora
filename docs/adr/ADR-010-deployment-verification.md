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

**Persistence.** Migration `005_verification_observations.sql` (appended; 001 to 004 untouched) stores one row per observation, grouped by `check_id`. Unknown values stay `NULL`; constraints reject inconsistent rows. One check is written in a single transaction, so a failure leaves nothing from that check. `GET /services/:id/verification` reads the latest check and computes the status; it writes nothing. It returns `404 verification_not_run` until a check has run.

**Secrets.** `GITHUB_TOKEN` is optional, sent only as one `Authorization` header to the configured GitHub API, kept non-enumerable in the config and in a private field of the verifier, and never put in a URL, observation, error, log or response. Reasons never copy response bodies, headers or received values. URLs carrying credentials are rejected.

## What this is not

It is not cryptographic: nothing is signed, and neither side is authenticated to the other. A claim is whatever the workload says (ADR-009); the source head is whatever GitHub's API returned at that moment. A `MATCH` means those two statements agree, not that the code running is the code at that commit. Do not use it as an authorization input or as a deployment receipt. The provider leg, the only independent view of what the platform deployed, is not collected.

## Consequences

- Operators get an honest status, including "cannot tell", with the evidence behind it.
- Unauthenticated GitHub allows 60 requests/hour; the default interval is five minutes (`VERIFICATION_INTERVAL_MS`). Set `GITHUB_TOKEN` for a higher limit.
- Observations are append-only by convention; there is no database trigger forbidding updates.
- `GET /services/:id/verification` is unauthenticated like the rest of the API (see the threat model).

## Alternatives considered

Asking the provider what revision it deployed (no documented signal exists), signing claims with a platform-held key (needs key management and a verifier), and failing the status when compare cannot answer (hides a known difference).
