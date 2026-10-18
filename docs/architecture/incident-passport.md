# Incident Passport

An **Incident Passport** is one incident exported as a single canonical JSON file, together with a SHA-256 over its content, so it can be checked offline later.

## What it is, and what it is not

The Passport is **integrity-evident**. It is not authentic and it is not signed.

- A SHA-256 over the content shows that **the file was not changed after it was exported**. If any byte of the covered content differs, `pnpm kora:verify` prints `FAIL`.
- It does **not** show who produced the file, which Kora instance produced it, or that the data in it was true when exported. Anyone who can run the hash function can edit a Passport and recompute every hash it carries; the result prints `PASS`. The tests state this limit explicitly (`documents the limit: a forger who recomputes every hash passes`).
- Nothing in the Passport proves anything about a deployment. It carries no deployment verification.

Treat `PASS` as "unchanged since the hash was computed", never as "produced by Kora" or "true".

## Export

`GET /incidents/:id/passport` on the API.

- Read-only: it writes nothing (no snapshot row, no event). Repeating it yields the same document and the same `contentHash`; only `generatedAt` differs.
- `400` for an id that is not a UUID, `404` for an unknown incident, `503` with `retry-after: 1` if the incident kept changing while it was being read (at most three attempts, so the document never mixes two states).
- The response body is the Passport itself, not wrapped in `{ data }`; `curl` it into a file and verify that file.
- Secret-looking text is redacted with the diagnosis engine's existing pattern (any string matching `authorization|bearer|api key|token|password|secret`, or any string under a key that matches, becomes `[REDACTED]`) in `failureReason`, `service.healthUrl` and timeline payloads. This is best-effort pattern matching, not a guarantee that no sensitive text is present.

```sh
curl -fsS http://localhost:3000/incidents/$ID/passport -o passport.json
pnpm kora:verify passport.json
```

## Schema `kora.incident-passport/v1`

| Field         | Content                                                                                                                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`      | `"kora.incident-passport/v1"`                                                                                                                                                                                                                                                                                                                 |
| `incident`    | `id, serviceId, deduplicationKey, state, severity, startedAt, resolvedAt, createdAt, updatedAt`                                                                                                                                                                                                                                               |
| `service`     | `id, name, healthUrl, createdAt`                                                                                                                                                                                                                                                                                                              |
| `resource`    | The provider resource bound to the service (`id, provider, providerAccount, region, resourceType, providerResourceId, displayName, environment, status`), or `null`                                                                                                                                                                           |
| `evidence`    | Every persisted evidence item, ordered by `observedAt` then id: `id, observationId, serviceId, kind (trigger/ongoing/recovery), thresholdCount, observedAt, ingestedAt, healthy, httpStatus, latencyMs, timedOut, failureReason, failureCategory, providerStatus, resourceId`, plus a per-item `contentHash` (SHA-256 of the item without it) |
| `timeline`    | Domain events and health observations, `occurredAt, eventType, source, payload`, in a content-determined order                                                                                                                                                                                                                                |
| `diagnosis`   | The deterministic diagnosis snapshot, embedded unchanged. It is self-verifying: its own `contentHash` is the SHA-256 of the snapshot without `createdAt`, `contentHash` and `snapshotId`; its evidence items carry per-item hashes                                                                                                            |
| `gaps`        | Each item that is `UNKNOWN` or `NOT COLLECTED`, with `item`, `status` and a `reason`                                                                                                                                                                                                                                                          |
| `integrity`   | `{ algorithm: "sha256", canonicalization: "kora-stable-json/v1", contentHash }`                                                                                                                                                                                                                                                               |
| `generatedAt` | When the export ran. **Not covered by the hash.**                                                                                                                                                                                                                                                                                             |

`gaps` always lists what Kora does not know, for example `rootCause` (UNKNOWN), `resourceMetrics`, `applicationLogs`, `deploymentContext` (NOT COLLECTED), `lastKnownHealthyAt` and `recoveryVerification` when absent, and always `producer` (UNKNOWN: the Passport is not signed).

### What the hash covers

`integrity.contentHash` is the SHA-256 of the canonical form of the whole document **except** `generatedAt` and `integrity.contentHash`. Everything else is covered, including the rest of `integrity` and the diagnosis `createdAt`. Adding, removing or renaming any field changes the hash.

### Canonical form `kora-stable-json/v1`

UTF-8 JSON with no whitespace; object keys sorted ascending by UTF-16 code unit; arrays in order; strings and numbers written as `JSON.stringify` writes them. Values JSON cannot represent (`undefined`, `NaN`, `Infinity`, `Date`, `bigint`, cycles) are refused rather than hashed. The form is byte-identical to the serialisation the diagnosis engine already used for every snapshot hash it ever stored; `packages/passport/test-fixtures/golden-vectors.json` pins 48 hashes produced by that original code, and both implementations are asserted against the same file. The hash is stable across a PostgreSQL JSONB round trip, including fractional numbers.

## Verify offline

`pnpm kora:verify <file>` (builds `packages/passport`, then runs it). It uses only `node:` built-ins and `packages/passport`: no network, no database, nothing from `apps/api`. A test fails if the verifier's imports ever stray from that.

It recomputes, and reports `PASS` or `FAIL` with the reason for:

1. `structure`: the schema, `integrity.algorithm` and `integrity.canonicalization` are the ones it knows;
2. `content-hash`: the whole-document hash;
3. `evidence-hashes`: every evidence item against its own hash;
4. `diagnosis-hash`: the embedded snapshot against its own `contentHash`;
5. `diagnosis-evidence-hashes`: the snapshot's evidence items against theirs.

Exit codes: `0` PASS, `1` FAIL (including an unreadable file or invalid JSON), `2` usage.

## Limits

- Integrity only. No signature, no origin, no freshness: `generatedAt` is outside the hash and anyone can change it without detection.
- The verifier does not check that the content is _consistent_ (for example that the diagnosis follows from the evidence), only that it is unchanged since hashing. The exporter keeps the evidence and the diagnosis from one reading of the incident; a forger who rehashes everything can make them disagree and still pass.
- The export contains operational data (service names, health URL, provider account and resource ids, failure text). Redaction is pattern-based. Treat a Passport as sensitive.
- The API computes hashes with `deterministicHash` from `apps/api/src/diagnosis.ts`, not with `packages/passport`: the image's Dockerfile installs only the packages it names, so the API cannot take a new workspace dependency without changing it. The two are tied together by the shared golden vectors and by tests that verify real API exports with the built CLI. `diagnosis.ts` was therefore left unchanged.

## Future work

- **Signing.** Sign `contentHash` with a key held by the Kora deployment (and publish the verification key) so a Passport can show who produced it. Needs key management, rotation and a trust root; none exists yet, and until it does a Passport must not be described as authentic.
- Moving `deterministicHash` in `diagnosis.ts` onto `packages/passport` once the image build includes that package.
- Evidence beyond health checks (logs, metrics, deployments) once Kora collects it; today those appear as `NOT COLLECTED` gaps.
