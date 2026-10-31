# Presence OS and Marketing Execution OS: architecture

Strategy lives in `docs/research/MARKETING-EXECUTION-OS-2026.md`. This file records what is built, how it fits together and where it stops.
Decisions are in ADR-020 to ADR-025.

## Two loops, one rule

```
Reliability  OBSERVE → DETECT → CORRELATE → DIAGNOSE → PROPOSE → AUTHORIZE → EXECUTE → VERIFY → AUDIT
Marketing    OBSERVE → UNDERSTAND → PROPOSE → AUTHORIZE → CREATE → VALIDATE → PUBLISH → OBSERVE RESULT → LEARN → AUDIT
```

Nothing public or sensitive happens without an authorization step, and every public action is validated again at the moment it
happens. The two loops meet in three places: a website incident produces a "hold promotion" suggestion and a warning on every post;
the website and marketing share one profile, and an ended offer is flagged wherever it still appears; and Kora's own audit trail covers both.

## Packages and services

| Where                                 | What                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/growth` (pure, no I/O)      | Facts schema, Presence Graph, health checks, Brand Kit, tier→feature map, channel capability matrix, lead state machine, content writer + validators, asset layout, motion frames, calendar state machine, authority policy, publish validation, agent rules, growth brief, bundle planner, attribution, metric normalization, review rules, memory, intent |
| `apps/api/src/growth/*`               | Stores (Postgres), routes, provider adapters and sandbox, secrets box, rasterizer (resvg + ffmpeg), workers (motion render, publish)                                                                                                                                                                                                                        |
| `apps/web/src/pages/*`                | Presence, Brand, Channels, Customers, Create, Calendar, Today, Campaigns, Results, Reviews, Memory, billing features                                                                                                                                                                                                                                        |
| `packages/site-schema` (`SITE_JS_V2`) | v2-only site script for tracked-link events; v1 output unchanged (golden hashes)                                                                                                                                                                                                                                                                            |

## Data model (migrations 013–020, all new, all idempotent)

Org-scoped everywhere; any row that names a site also carries `org_id` and a composite foreign key `(site_id, org_id) → sites`.
`business_profiles`, `business_profile_revisions`\*, `brand_kits`\*, `presence_checks`, `presence_issues`, `channel_connections`, `oauth_states`,
`webhook_events`, `customers`, `leads`, `lead_messages`, `follow_ups`, `content_drafts`, `media_assets`\*, `motion_renders`, `calendar_items`,
`approvals`\*, `publish_jobs`, `publish_attempts`, `marketing_recommendations`, `recommendation_evidence`, `growth_briefs`\*, `campaigns`,
`campaign_channels`, `attribution_links`, `attribution_events`, `social_metrics`, `reviews`, `review_replies`, `business_memory`.
(\* update-blocked by trigger.) Usage is metered in the existing `usage_events` (`CONTENT_DRAFT`, `IMAGE_RENDER`, `VIDEO_RENDER`, `POST_PUBLISHED`, `CAMPAIGN_BUNDLE`); there are no hard limits and no credits.

## Invariants that tests enforce

- Tokens never reach the browser; they are AES-256-GCM sealed and cleared on disconnect.
- OAuth state is single-use, short-lived and bound to user and site; WhatsApp numbers are claimed only with proof of access.
- Webhooks are authenticated (HMAC), persisted, replay-safe and tenant-mapped.
- A post cannot go out unless approved, and the approval is bound to a hash of its words, image and channels; editing voids it.
- Retries happen only when the provider certainly did not post; ambiguous failures stop and ask.
- Kora never replies to customers or reviews, never sends bulk messages, never spends money.
- Brand Kit changes never alter an existing asset; approvals, briefs and assets are append-only.
- Cross-tenant requests return 404 on every new route (each milestone has a probe test).
- Sandbox providers cannot exist in production, and their data is labelled and excluded from reports.
- Numbers shown to owners are measured; what Kora cannot measure is listed with the reason.

## Plans

`TIER_FEATURES` (`packages/growth/src/tiers.ts`) is the only place that says what a plan includes; the API resolves plan → tier once
(`growth/entitlements.ts`). Trial includes everything. An expired or cancelled plan blocks writes and keeps reads. Prices are
commercial hypotheses seeded for development only; production plans come from `KORA_PLANS_JSON`.

## Known limits (also in the final report)

- Live provider adapters for posting, metrics and reviews are not written; they need approved apps and real tokens to build against.
- Video export needs ffmpeg on the server (`--build-arg WITH_FFMPEG=true`); previews always work.
- No model is configured in production; the deterministic writer and rules are the live path. Model output, when added, passes the
  same schema and business-rule validation.
- Voice is a router (text always works; speech uses the browser's recognizer where present).
- Assets are stored in Postgres; move to object storage if volume grows.
