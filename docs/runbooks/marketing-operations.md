# Runbook: marketing workers and channels

## Workers

Two in-process workers start with the API (not in `NODE_ENV=test` unless `KORA_STUDIO_WORKER=true`). Both use Postgres `FOR UPDATE SKIP LOCKED`, so running several API instances is safe.

- **Motion render:** `motion_renders` QUEUED → RENDERING → READY/FAILED, 3 attempts, a job stuck in RENDERING for 5 minutes is re-claimed. FAILED jobs can be retried from the UI; rendering is pure so retry is always safe.
- **Publish:** `publish_jobs` QUEUED → PUBLISHING → PUBLISHED/FAILED. `UNCERTAIN` failures (network, 5xx, or a crash mid-call) are never retried automatically.

## Common situations

| Symptom                                     | Meaning                                      | Action                                                                                    |
| ------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "Video export is not available"             | no ffmpeg                                    | install ffmpeg or build with `WITH_FFMPEG=true`; previews still work                      |
| Post FAILED, class UNCERTAIN                | the provider may have posted                 | open the channel and look; if absent, use "Try again" and confirm                         |
| Post FAILED, class PERMANENT                | rejected (auth, validation)                  | reconnect the channel or fix the post and approve again                                   |
| Post stays QUEUED with a later next attempt | provider rate limit (429/503)                | none; it backs off 1 min, 5 min, 30 min                                                   |
| Channel `AUTH_EXPIRED`                      | token expired                                | owner signs in again from Channels                                                        |
| "not set up on this Kora"                   | missing credentials                          | set the variables in `ENVIRONMENT.md`                                                     |
| WhatsApp messages not arriving              | webhook not subscribed or number not claimed | check callback URL, verify token, and that the number id was connected from this business |

## Checking health

`webhook_events` shows every inbound delivery and its status (`PROCESSED`, `IGNORED`, `FAILED`). `publish_attempts` shows every provider call. The audit log records approvals, publishing, agent actions and campaign changes with the policy decision.
