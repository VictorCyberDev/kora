# ADR-023: Content calendar, approvals and the publishing engine

Status: accepted. Milestones M26–M27.

## Decisions

1. **One state machine** (`nextItemState`): IDEA → DRAFT → APPROVAL_NEEDED → APPROVED → SCHEDULED → PUBLISHING →
   PUBLISHED / FAILED / PARTIALLY_PUBLISHED, and CANCELLED. Illegal moves throw and return `409`. Editing anything
   approved sends the post back to APPROVAL_NEEDED and records a `REVOKED` approval. Published history is never edited.
2. **Approval is bound to content.** The owner approves a hash of (words, image, channels). The schedule time is chosen
   at scheduling, itself an ADMIN-gated action, and is not part of the hash. At publish time the hash is recomputed; a
   mismatch fails the job. Approvals are append-only (`approvals`, update-blocked) and carry the policy decision.
3. **Authority model** (`decide`): AUTO_SAFE (drafts, reports, brand kit), APPROVAL_REQUIRED (schedule, publish, change
   site facts, delete), DENY (customer or review replies, bulk messaging, ad spend). DENY has no code path.
4. **Validate before and again at publish.** `checkPublishable` runs content rules against _current_ facts, channel
   capability, connection health, media, approval and adapter availability. A post approved last week for an offer that
   ended yesterday fails when it is due.
5. **The UI never calls a provider.** Only `PublishWorker` does, from `publish_jobs` (one per item × channel, unique
   idempotency key from the approved hash, `SKIP LOCKED`).
6. **Retry only when it cannot duplicate.** 429/503 retry with backoff (3 attempts). 4xx fail permanently. Network errors
   and 5xx are `UNCERTAIN`: the provider may have posted, so Kora stops, says so, and a retry needs the owner to
   confirm the post is not live. A crashed worker's in-flight job becomes `UNCERTAIN` after 5 minutes.
7. **Hand-off is first-class.** Where Kora has no way to post (WhatsApp has no posting; TikTok without audit; live
   providers whose publish adapter is not written) the owner gets a copy-ready package and records "I posted it", which
   completes the item with `method=MANUAL`.
8. A website incident does not block posting but is shown as a warning on every affected post.

## Limits

- Only the sandbox provider implements `publish` today. Live Meta/Google/TikTok publish adapters are not written: they
  need an approved app and real page tokens to develop against, and public media URLs. Until then those channels use
  hand-off, and the engine reports `not_available` honestly.
- Times are stored in UTC and shown in the viewer's timezone.
