# Channels: setup, state and limits

Kora connects to each provider only with credentials the **operator** (the person running this Kora deployment)
adds. Until then the provider shows **Not set up yet** and cannot be connected. Nothing is simulated in
production.

## Environment variables

| Variable                                               | Purpose                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `KORA_SECRETS_KEY`                                     | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts provider tokens at rest. Required for any live provider.        |
| `KORA_PUBLIC_URL`                                      | Public base URL. The OAuth redirect URI is `${KORA_PUBLIC_URL}/api/oauth/callback`; register exactly that with each provider. |
| `META_APP_ID`, `META_APP_SECRET`                       | Meta app (Instagram, Facebook Pages, WhatsApp Business).                                                                      |
| `WHATSAPP_VERIFY_TOKEN`                                | Any secret string; entered in Meta's webhook configuration for the verification handshake.                                    |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Business Profile and Search Console.                                                                                   |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`            | TikTok.                                                                                                                       |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`         | Reserved; LinkedIn is not available yet.                                                                                      |
| `KORA_SANDBOX_CHANNELS`                                | `true` enables fake providers for tests/demos. Ignored when `NODE_ENV=production`.                                            |

## Owner actions that only a human can do

- **Meta:** create a Meta app, add Instagram, Facebook Login and WhatsApp products, complete app review for
  `instagram_content_publish`, `pages_manage_posts` and messaging, and complete WhatsApp Business onboarding and
  message-template approval. Point the WhatsApp webhook at `${KORA_PUBLIC_URL}/api/webhooks/whatsapp` with the
  verify token above and subscribe to `messages`.
- **Google:** create an OAuth client, enable the Business Profile and Search Console APIs, and request Business
  Profile API access.
- **TikTok:** register an app; public posting requires TikTok's Content Posting audit. Until approved Kora only
  prepares content for manual posting.
- **Each customer:** sign in to the provider from Channels. Kora cannot do this for them.

## Connection states

`CONNECTED`, `AUTH_EXPIRED` (sign in again), `PERMISSION_REQUIRED` (grant the missing permission),
`RATE_LIMITED` (provider is slowing requests), `DEGRADED` (provider errors), `DISCONNECTED`,
`NOT_SUPPORTED`. `POST /api/sites/:id/channels/:provider/check` refreshes a token that is within 24 hours of
expiry, probes the provider and records the resulting state.

## What each provider can and cannot do

Source of truth: `CHANNEL_MATRIX` in `packages/growth/src/channels.ts`, shown to owners on the Channels page.
Notably: no WhatsApp Status automation, no bulk or unsolicited WhatsApp messaging, Instagram has no native
scheduling (Kora holds and publishes at the chosen time), TikTok public posting needs audit.

## Webhooks

`GET/POST /api/webhooks/whatsapp`. The POST body is verified with `X-Hub-Signature-256` (HMAC-SHA256, Meta app
secret) before anything is read. Every message id is stored once; a replay changes nothing. Messages for a phone
number id no connected business owns are stored and marked `IGNORED`.

## Live publishing status

- **Facebook Pages:** implemented for an owner-selected Page using a verified Page access token and Meta's Page Photos endpoint. PNG/JPEG images are validated before upload. App review, live credentials and a controlled owner-approved Page test are still required before production commissioning.
- **Instagram professional accounts:** OAuth account verification is implemented, but media publishing remains manual handoff. Meta requires a publicly reachable media URL and approved `instagram_content_publish` access; Krevstudio does not expose private tenant assets merely to make this pass.
- **TikTok:** connect and health contracts exist. Direct Post remains handoff-only until the application passes TikTok's audit and implements its creator-info/consent/upload flow.
- **Google Business Profile:** connect and health contracts exist. Posting remains handoff-only until API access is approved and a location-selection flow is commissioned.
- **WhatsApp:** Status posting is not supported. Messaging follows the existing opt-in/template boundary.

All unsupported publishing uses the calendar handoff package. A prepared package is never recorded as published; the owner must explicitly confirm a manual post.

## Provider references checked for this implementation

- Meta Graph API Page Photos and Page Feed, v27.0.
- Meta Instagram professional-account content publishing.
- TikTok Content Posting API Direct Post and Upload flows.
- Google Business Profile `accounts.locations.localPosts`.

## Known limitations

- Live provider calls are covered by deterministic provider fixtures. Real commissioning remains externally blocked until credentials, provider review and controlled test accounts are supplied.
- Instagram/Facebook inbound messages are not ingested yet (WhatsApp is).
