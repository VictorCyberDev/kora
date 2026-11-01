# Go-live checklist (owner actions)

What the code can and cannot do for you. Everything here is a setting on RumptyCloud or a provider account; the repo cannot set them.

## 1. Production plans

Set `KORA_PLANS_JSON` to the contents of `deploy/plans.production.json`. It keeps the current trial unchanged and adds **Pro, NGN 100,000 per month** (`amountMinor` is kobo, so `10000000`). A test (`plans-production.test.ts`) parses that file with the real loader. Taking payment also needs the Paystack settings (`PAYSTACK_SECRET_KEY` and a `paystackPlanCode` on the plan); the file has none yet.
After a restart, `GET /api/billing/plans` must list `trial` and `pro-monthly`.

## 2. Live posting

Each channel reports `NOT_CONFIGURED` until its variables exist: `KORA_SECRETS_KEY` (32 random bytes, base64), then `META_APP_ID` / `META_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET`, `TIKTOK_CLIENT_KEY` / `_SECRET`. Having the credentials is not enough for Instagram, Facebook, WhatsApp or TikTok: each platform reviews the app before it can post for other businesses. **Live publish adapters are not written** (sandbox only), so even with credentials Kora hands over finished posts for you to send. See `docs/integrations/CHANNELS.md`.

## 3. Generated images and video

Set `HF_TOKEN` (Hugging Face, FLUX.1-schnell, Apache-2.0) and/or `KORA_SDWEBUI_URL` (your own Stable Diffusion WebUI with `--api`). Nothing is generated and nothing is charged without one of them; the Studio "Images" tab says "Not set up yet". Verified with a stub server only, never against a live provider. Video from `KORA_HF_VIDEO=true` is the least verified path. Motion videos from the studio keep using the open-source resvg + ffmpeg path, which needs the image built with `WITH_FFMPEG=true`.

## 4. After every deploy

`node scripts/live-creative-check.mjs https://kora-api.rumptycloud.app` and `node scripts/live-presence-check.mjs https://kora-api.rumptycloud.app`. The app sleeps when idle; the creative check waits for it.
