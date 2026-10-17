# ADR-011: Incident Passport is integrity-evident, not signed

**Status:** Accepted

## Context

An incident's evidence and diagnosis live in PostgreSQL and behind several API calls. People need to hand one incident to someone else, and later check that what they hold is what was exported. `ADR-010` is reserved by the deployment-verification work, so this is `ADR-011`.

## Decision

`GET /incidents/:id/passport` exports one incident as canonical JSON, `kora.incident-passport/v1`, with a SHA-256 `integrity.contentHash` over everything except `generatedAt` and the hash itself. `pnpm kora:verify <file>` recomputes the hashes offline (Node built-ins and `packages/passport` only) and prints `PASS` or `FAIL` with a reason. Format, hashed fields and limits are in `docs/architecture/incident-passport.md`.

## Terminology (binding in code, docs and UI text)

The Passport is **integrity-evident**: a matching hash shows the file was not changed after export. It is **not authentic** and **not signed**: it does not show who produced the file, and anyone can edit it and recompute the hashes. It is never described with stronger words than that: not as proof of origin and not as evidence about any deployment. Signing is future work and is listed as such.

## Consequences

- The verifier is a small, dependency-free package and a script, so a recipient does not need the database or the API.
- The API reuses `deterministicHash` from `diagnosis.ts`; `packages/passport` re-implements the same canonical form. Golden vectors from the original code (shared by both test suites) and end-to-end verification of real exports keep them byte-identical. Consolidating them waits until the image build includes the new package.
- A forger who recomputes every hash passes verification. Consumers must not treat `PASS` as provenance.
- Changing a covered field or its meaning requires a new `schema` version; the committed example export must keep verifying under the version that wrote it.

## Alternatives considered

- **Sign now.** Needs a key, rotation and a published trust root that do not exist; a signature without them would imply more than we can back.
- **Hash only the diagnosis snapshot.** Leaves the evidence list, timeline and gaps editable without detection.
- **Move the hash out of `diagnosis.ts` immediately.** Equivalence is proven, but the API would depend on a package the Dockerfile does not install.
