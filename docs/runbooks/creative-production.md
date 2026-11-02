# Runbook: creative engine in production

## Enable (commissioning)

1. Deploy the release with `KORA_CREATIVE_ENGINE` unset (default `v2`). Migration 025 is additive
   (`brand_os_versions`, `creative_feedback`) and runs with the existing migrator.
2. Verify the unchanged paths first: health, an existing published site, publish, monitor, rollback.
3. Set `KORA_CREATIVE_ENGINE=v3`, redeploy. New designs now use v3; existing sites are unchanged.
4. Create a test business, compare the three directions, choose one, publish, load the public URL and
   `/_kora/fonts/<file>.woff2`, confirm `verification.status` is `MATCH`, confirm monitoring picked it up.
5. Make a matching set from Brand and confirm PNGs download.

## Roll back

Set `KORA_CREATIVE_ENGINE=v2`. Existing v3 versions keep rendering and publishing; only new designs change. To retire
one customer's v3 version use the normal rollback to the previous version.

## Cost and abuse controls

Previews call no model or image provider. Artifact renders are metered (`IMAGE_RENDER`) and gated by `brand.studio`.
Preview tokens expire after 30 minutes and are bound to the requesting user.

## Troubleshooting

| Symptom                             | Likely cause                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| 409 `needs_brand_os` on artifacts   | the site has no v3 version yet; use "Try a new Kora design"                        |
| 409 `creative_engine_disabled`      | flag is `v2`                                                                       |
| 422 `media_not_approved`            | generated picture not yet approved by the owner                                    |
| Artifact text in the wrong typeface | font files missing from the image; check `packages/site-fonts/ttf` is copied       |
| 422 `artifact_rejected`             | text does not fit the format, or Kora-composed copy contained an unsupplied figure |
