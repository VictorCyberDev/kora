# Full-platform baseline (Checkpoint A)

Recorded before any behaviour change.

| Item             | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| Repository       | `VictorCyberDev/kora`                                                                   |
| Real `main` HEAD | `c38e34b4e478901166b299df6969dcc15f444aca` (matches the mandate's last-verified SHA)    |
| Execution branch | `ccr-c679ee1d-481m3b` (branched from that SHA)                                          |
| Open PRs         | #12 (draft) `live-0b-rumpty-auth-verification` — read-only Rumpty machine bridge        |
| Other branches   | Historical milestone branches, all already merged into `main`; none carry unmerged work |
| CI on `main`     | `ci.yml` (quality + docker image); one-shot format-repair workflows exist but are inert |

## Baseline gate results (Node 22.22, pnpm 10.18.3, PostgreSQL 16, `kora_test`)

| Gate                | Result                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check` | pass                                                                                                                      |
| `pnpm lint`         | pass                                                                                                                      |
| `pnpm typecheck`    | pass                                                                                                                      |
| `pnpm build`        | pass                                                                                                                      |
| `pnpm db:migrate`   | 001–006 applied                                                                                                           |
| `pnpm -r test`      | api 343 passed / 1 skipped; passport 88; runtime-claim 27; demo-service 14; incident-engine 6; topology 4; event-schema 2 |

## Existing routes (all unauthenticated at baseline)

`GET /health`, `GET /__kora`, `GET /services`, `/services/:id`, `/services/:id/verification`,
`GET /incidents`, `/incidents/:id`, `/incidents/:id/events|evidence|timeline|diagnosis|snapshots`,
`GET /incidents/:id/snapshots/:snapshotId`, `POST /incidents/:id/diagnosis/snapshots`,
`GET /incidents/:id/passport` (+ passport routes), `GET /ui` (read-only evidence page).

## Migrations

`001_initial` … `006_verification_observations_append_only`. These are never edited; all new schema is added as new numbered files.

## Compatibility constraints carried forward

- Event schema v1 (`schemaVersion: 1`) stays parseable. New event types extend the same enum (additive); historical rows still parse.
- Passport `kora.incident-passport/v1` stays verifiable by the offline verifier. Action/policy data is added only in a new explicit schema version, with both versions accepted.
- Single-service monitor semantics (atomic persistence, restart hydration, one active incident per key) are reused per site, not reimplemented.
- `buildApi(store, nodeEnv, logLevel, options)` keeps its signature; legacy routes stay public by default for existing tests and are guarded by configuration in the production server.
- Existing tests are not weakened or removed.

## Provider state known from repository evidence

- Rumpty workspace `kora-01a11b00` is referenced by the LIVE-0B workflow (PR #12). No deployment URL, VM ID or credential is present in this repository or in this execution environment.
- **LIVE-0B is pending**: it needs the repository secrets `RUMPTY_API_KEY` and `RUMPTY_WORKSPACE`, and the workflow must exist on the default branch to be dispatchable. The workflow is carried into this branch unchanged (read-only, manual, fails closed when secrets are absent).
- No PASS is claimed for any live Rumpty check in this document.

## Documented Rumpty interfaces (docs.rumptycloud.com, read 2026-10-30)

- CLI commands: `login`, `logout`, `ssh`, `sync`, `copy`, `exec`, `expose`, `unexpose`, `vm {ls,start,stop,reboot,delete,expose ls}`, `workspaces`. Auth by `RUMPTY_API_KEY`; workspace by `RUMPTY_WORKSPACE`.
- **No documented structured (JSON) output mode** and **no documented deployment, redeploy or rollback CLI command.** Deployments are created from GitHub in the console; rollback is console-only as far as the docs show.
- `rumpty sync <folder> <bucket>[/prefix] [--public] [--delete]` uploads a folder to object storage incrementally. The public URL format of a bucket is not documented.

Consequences for Kora (enforced in code, not just prose): provider deploy/rollback/redeploy report `REQUIRES_MANUAL_PROVIDER_ACTION`; VM restart is attempted only through an allow-listed argument-array invocation and its result is never treated as recovery; site rollback is Kora-owned (republish the previous immutable version).

## Correction (2026-10-30, later)

The Rumpty docs list **Inference** as a product (inference projects with an OpenAI-compatible endpoint and API key for hosted models; Billing documents a free token pool per cycle and opt-in overage). The CLI reference also documents `vm start|stop|reboot|delete`, `copy`, `exec` and `expose`; only their argument syntax is unpublished. Earlier statements in this document that deny these were incomplete.
