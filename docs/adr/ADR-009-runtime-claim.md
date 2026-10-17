# ADR-009: Runtime claim (`GET /__kora`)

**Status:** Accepted

## Context

An operator, and later Kora itself, needs to ask a running service "what are you?" without credentials: which service, which environment, which commit, since when. Rumpty Cloud documents no such endpoint, and no spec existed in this repository, so the shape is defined here.

## Decision

Both `kora-api` and `demo-service` serve `GET /__kora`. It is unauthenticated, read-only (other methods return 404), uncacheable (`cache-control: no-store`) and returns only these fields, `schema` `kora.runtime-claim/v1`:

```json
{
  "schema": "kora.runtime-claim/v1",
  "service": "kora-api | demo-service",
  "environment": "KORA_ENVIRONMENT, default development",
  "commit": "40 lower-case hex | null",
  "commitSource": "build-info | env | unavailable",
  "builtAt": "ISO-8601 | null",
  "startedAt": "ISO-8601 (process start)",
  "uptimeSeconds": 0
}
```

**Commit sourcing, in order:** (1) `build-info.json` written during the image build from the `GIT_SHA` build argument, else from `HEAD` of the build context's `.git` (detached HEAD, loose branch ref or `packed-refs`); (2) the `KORA_COMMIT_SHA` environment variable; (3) otherwise `commit` is `null` and `commitSource` is `unavailable`. Anything that is not exactly 40 hex characters is ignored, never repaired or echoed. A value is never invented. The image build never fails because the commit is unknown.

The logic lives in the `@kora/runtime-claim` package and is read once at process start. No environment value other than the ones above is read into the response.

## This is a claim, not attestation

The response is a **self-report** by the process. It is not signed, not bound to the platform, and not verified by anything. Anyone who can set an environment variable or a build argument can make it say anything. It must not be used as evidence that a particular commit is running, as a deployment receipt, or as an authorization input. It only lets a human or a future verifier compare "what the service says" with "what the platform says". Strong attestation (signed, platform-verified) is a separate, later capability and is not implemented.

## Consequences

- A service that does not know its commit says so (`null` / `unavailable`) instead of guessing.
- The endpoint exposes the commit, environment name and uptime to anyone who can reach the service; it carries no secrets. Treat the environment name and commit as non-sensitive or do not expose the service.
- Changing a field or its meaning requires a new `schema` version.

## Alternatives considered

Embedding the commit at runtime from the platform (not documented by Rumpty) and signing the response (needs key management and a verifier). Both are deferred.
