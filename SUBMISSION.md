# Kora — submission summary

**What it is.** An AI operator for your website: it builds the site from a description, publishes it, watches it, explains failures from evidence, proposes typed fixes, applies them only when a deterministic policy and (where required) a human approves, and proves recovery from new observations.

**What is different.** The AI is never the source of truth. It reads an immutable, hashed diagnosis; its output is rejected unless every reference exists; a pure policy function decides; an action's success is never recovery; every step lands in an append-only trail and an offline-verifiable Incident Passport.

**Status: NOT READY for judging as a live product.** Nothing is deployed on RumptyCloud yet; see `LIVE-ACCEPTANCE.md` for the exact blockers.

**Rumpty.** Rumpty is the target for Kora's deployment, PostgreSQL, customer-site hosting (documented `rumpty sync` to object storage) and, when configured, inference. The production design is two Rumpty Web Services from one image (control plane and an independent Site Host) plus Rumpty PostgreSQL (`docs/runbooks/site-host.md`). Kora's logic, including the cross-service closed loop, is verified locally and in CI, but **none of it has run on a real Rumpty account**. RumptyCloud documents no custom-domain binding and no inference service, so those are reported as unavailable. Rumpty documents no deployment-rollback or VM-restart interface, so Kora does not pretend to use one: its rollback republishes a previous immutable site version.

**Evidence.** `LIVE-ACCEPTANCE.md`, `DEMO.md`, `docs/architecture/overview.md`, ADR-012..017, screenshots in `docs/screens/`.
