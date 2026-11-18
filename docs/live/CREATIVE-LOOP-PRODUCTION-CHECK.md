# Production check: creative loop (M0–M26), 2026-11-01

Target: https://kora-api.rumptycloud.app. Runtime claim: commit `7446d384a79b1243bf4bd65c465326c9de810516` (PR #32, squash). Migrations 022–024 applied on startup.

| Script                            | Result                                           |
| --------------------------------- | ------------------------------------------------ |
| `scripts/live-creative-check.mjs` | 25 passed, 0 failed                              |
| `scripts/live-presence-check.mjs` | 24 passed, 0 failed                              |
| `scripts/live-recovery-check.mjs` | RECOVERY_VERIFIED (verified by new observations) |

The creative check included a real audit of a public page (`https://example.com`, 5 of 10 checks) and refusals of `file://` and the link-local metadata address.

## State of the deploy that this check also shows

- Plans on production: `trial` only. `KORA_PLANS_JSON` is not set, so the NGN 100,000 Pro plan in `deploy/plans.production.json` is not live.
- Channels: all seven `NOT_CONFIGURED`. No live posting.
- Media generation: not configured (`HF_TOKEN` / `KORA_SDWEBUI_URL` unset); the endpoint answers 503 `not_configured`.
- Each run created one throwaway trial account and site on production. Nothing was posted or sent to any third party.
