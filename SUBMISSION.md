# Kora — submission summary

**What it is.** An AI operator for your website: it builds the site from a description, publishes it, watches it, explains failures from evidence, proposes typed fixes, applies them only when a deterministic policy and (where required) a human approves, and proves recovery from new observations.

**What is different.** The AI is never the source of truth. It reads an immutable, hashed diagnosis; its output is rejected unless every reference exists; a pure policy function decides; an action's success is never recovery; every step lands in an append-only trail and an offline-verifiable Incident Passport.

**Rumpty.** Rumpty is the target for Kora's deployment, PostgreSQL, customer-site hosting (documented `rumpty sync` to object storage) and, when configured, inference. Those live paths are implemented and tested against fakes/contracts but **have not been run against a real Rumpty account** (see `LIVE-ACCEPTANCE.md`). Rumpty documents no deployment-rollback or VM-restart interface, so Kora does not pretend to use one: its rollback republishes a previous immutable site version.

**Evidence.** `LIVE-ACCEPTANCE.md`, `DEMO.md`, `docs/architecture/overview.md`, ADR-012..017, screenshots in `docs/screens/`.
