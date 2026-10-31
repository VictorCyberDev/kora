# ADR-021: Channels foundation and Customer Hub

Status: accepted. Milestones M21–M22.

## Decisions

1. **The capability matrix is data** (`CHANNEL_MATRIX` in `@kora/growth`). UI, API guards and tests read
   the same table of what each provider can do (`supported` / `limited` / `unsupported`), the owner-facing
   limits, and any platform approval it needs. WhatsApp has no publish/schedule (no Status automation);
   TikTok publishing is `limited` until the platform audit; LinkedIn is `planned` and cannot be connected.
2. **Connection state is derived in one function** (`deriveConnectionState`) from observations: token expiry,
   granted vs required scopes, last provider call, revocation. States are `CONNECTED`, `AUTH_EXPIRED`,
   `PERMISSION_REQUIRED`, `RATE_LIMITED`, `DEGRADED`, `DISCONNECTED`, `NOT_SUPPORTED`.
3. **Runtime availability is separate from capability.** `runtimeStatus` reports `NOT_CONFIGURED` with the
   names (never values) of the missing environment variables. A provider with no credentials has no adapter;
   `connect` returns `409 not_configured`. Nothing is simulated in production.
4. **Tokens never leave the server.** They are sealed with AES-256-GCM (`KORA_SECRETS_KEY`, 32 bytes base64) in
   `channel_connections.token_ciphertext`, are not selected by any list query, and are cleared on disconnect.
   Without the key no live provider can connect.
5. **OAuth state is single-use, short-lived, and bound to the user and site that started it**
   (`oauth_states`, hash stored). The callback re-checks the signed-in user and their `ADMIN` role. An
   intercepted state does not let a different user finish the flow, and a used state cannot be replayed.
6. **WhatsApp account ownership is proven.** A phone number id is only accepted if the signed-in user's token
   can read that exact number. Inbound webhooks are routed by that id, so an unproven claim would let one
   tenant receive another's customer messages. A unique index also prevents two sites from owning one id.
7. **Webhooks are authenticated, persisted and replay-safe.** HMAC-SHA256 over the raw body with the Meta app
   secret (constant-time compare), persisted to `webhook_events` with `UNIQUE(provider, external_event_id)`
   before processing, mapped to a tenant only through a connected account, otherwise stored and `IGNORED`.
8. **Sandbox providers** exist for tests and demos (`KORA_SANDBOX_CHANNELS=true`). They never touch the
   network, are labelled "Test account" in the UI, and are forced off when `NODE_ENV=production`.
9. **Customer Hub.** `customers` (deduplicated per site by normalized phone or email), `leads` (one per
   conversation, unique on `(site_id, source, source_ref)` so retried form posts and replayed webhooks cannot
   duplicate), `lead_messages`, `follow_ups`. Website form submissions are pulled into leads on read,
   idempotently, so the existing public form route is untouched.
10. **Lead status changes live in one pure function** (`nextStatus`). A customer writing always puts the lead
    back to waiting, even if it was won or closed. A reply moves an open lead to follow-up and never reopens a
    closed one. "Waiting" means `NEW` or `NEEDS_REPLY`.
11. **Replies are recorded, not sent, in this milestone.** The owner replies from their own WhatsApp (click to
    chat) and logs it. Sending through a provider will arrive with the messaging/publishing engine and its
    approval policy; it is not faked here. The 24-hour WhatsApp service window is computed and shown.

## Consequences

Meta, Google and TikTok adapters are written against their documented OAuth endpoints and exercised against a
fake provider. They have not been run against the live providers because no app credentials exist in this
environment; see `docs/integrations/CHANNELS.md` for the exact owner actions.
