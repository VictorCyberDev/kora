# Demo (about 4 minutes, all real)

Start: `KORA_PUBLIC_URL=http://localhost:3000 KORA_CHAOS_ENABLED=true KORA_LEGACY_PUBLIC_API=true node apps/api/dist/server.js` (after `pnpm build && pnpm db:migrate`).

1. Sign up, describe a business, watch the first version appear (no AI key needed: the deterministic builder uses only what you wrote).
2. Ask for "Make the primary colour red"; publish v1, then publish v2. Open the public URL.
3. Overview shows **Online**. In _Chaos Lab_ start the **Controlled test** (HTTP 500). The live version really fails.
4. Within seconds: **Needs attention**. Open the incident: plain-language cause, what changed (timing only), what is unknown, recommended "restore previous version", **approval required**.
5. Approve. The page says **Fix applied — verifying**, then **Website restored** only after two new healthy checks.
6. Switch to **Proof**: diagnosis, policy code, approval, executor trace, recovery verification; load the Passport and run `pnpm kora:verify <file>`.
