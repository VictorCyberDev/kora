# Environment variables added by the Presence/Marketing build

All optional. A feature whose variables are missing reports `NOT_CONFIGURED`; nothing is faked.

| Variable                                                  | Effect                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `KORA_SECRETS_KEY`                                        | 32 random bytes, base64. Seals provider tokens. Without it no live channel can connect.                          |
| `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Instagram, Facebook Page and WhatsApp Business OAuth and the WhatsApp webhook.                                   |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`    | Google Business Profile and Search Console.                                                                      |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`               | TikTok.                                                                                                          |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`            | Reserved; LinkedIn is not available.                                                                             |
| `KORA_SANDBOX_CHANNELS=true`                              | Fake providers for tests and demos. Ignored when `NODE_ENV=production`.                                          |
| `KORA_FFMPEG_PATH`                                        | Path to ffmpeg (default `ffmpeg`). Video export is unavailable if it cannot run.                                 |
| `KORA_STUDIO_WORKER=true`                                 | Force the render/publish workers on in `NODE_ENV=test` (they are on otherwise).                                  |
| `KORA_PUBLISH_TICK_MS`                                    | Publish worker poll interval, default 5000.                                                                      |
| `KORA_PLANS_JSON`                                         | Production plan catalog. Plan codes containing `pro` / `plus` / `business` map to those tiers; others to Launch. |
| Build arg `WITH_FFMPEG=true`                              | Installs ffmpeg in the API image.                                                                                |
