# ADR-014: Authentication and tenant isolation

Passwords use scrypt (N=2^15) in a self-describing format; verification bounds the parameters and fails closed. Sessions are random 256-bit tokens stored only as SHA-256 hashes, in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production), revocable, 7-day TTL. State-changing `/api` calls require `X-Requested-With: kora` and a same-host `Origin` when present.

Every tenant-owned row carries `org_id`. Handlers resolve the object, then require a membership role in _its_ org; a non-member always gets `404`, so object existence is not revealed. Roles: OWNER > ADMIN > MEMBER > VIEWER. The original evidence routes (`/incidents`, `/services`, `/ui`) are public only when `KORA_LEGACY_PUBLIC_API=true` (default in development, off in production); otherwise they require a session and the same org check. Cross-tenant tests probe every route that names another org's objects.

Known limits: rate limiting is in-process (single node); no password reset or email verification (no email transport); no SSO/2FA.
