# Security

Report vulnerabilities privately to the repository owner. See `docs/security/threat-model.md` and ADR-014.

Operating rules: set `KORA_COOKIE_SECURE`/HTTPS in production; keep `KORA_CHAOS_ENABLED=false` anywhere customer sites live; provide `PAYSTACK_SECRET_KEY`, `INFERENCE_API_KEY` and `RUMPTY_API_KEY` only through the platform's secret store; leave `KORA_LEGACY_PUBLIC_API` off in production. Known gaps: in-process rate limiting, no 2FA/SSO, no password reset, no email verification.
