# Kora

**Build your presence. Kora keeps it working — and helps it grow.**

Kora is the presence and marketing execution system for small businesses. It starts where most tools stop: it creates and publishes a website, then stays after launch. It creates and publishes a site, watches the live customer experience, explains failures from evidence, proposes safe typed fixes, asks for approval when a change needs the owner, and counts recovery only after new health observations pass.

**Live product:** https://kora-api.rumptycloud.app  
**Live customer-site host:** https://kora-site-host.rumptycloud.app  
**Authoritative production proof:** [`LIVE-ACCEPTANCE.md`](LIVE-ACCEPTANCE.md)  
**Demo:** [`DEMO.md`](DEMO.md)  
**Submission package:** [`SUBMISSION.md`](SUBMISSION.md)

## From website to presence

Everything customers see about a business (website, contact details, hours, offers, Google and social profiles, messages, reviews, posts) is read from **one factual business profile**. Kora checks it, keeps it consistent, helps the owner create and schedule content in their own brand, and tells them honestly what it can and cannot measure. The recovery story below is unchanged and is the reason an owner can trust the rest: Kora will not send customers to a site that is down, and it proves its fixes.

| Area (owner navigation)                                       | What exists                                                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Presence**: profile, health, Brand Kit, channels            | Business profile with revisions, decomposable health checks (no score), versioned Brand Kit, channel connections with typed capability matrix                    |
| **Customers**: inbox, follow-ups, reviews, memory             | Website and WhatsApp enquiries become leads exactly once; waiting-for-reply counts; follow-ups; reviews (sensitive ones are never auto-drafted); business memory |
| **Marketing**: today, create, calendar, campaigns, results    | Evidence-based suggestions, fact-bound post writing, branded images, short videos, approvals, scheduling, tracked links, campaign bundles, weekly brief          |
| **Health**: website monitoring, incidents, recovery, Passport | The reliability kernel below                                                                                                                                     |
| **More**: websites, billing, activity, settings               | Plans and feature entitlements, audit trail                                                                                                                      |

What is **not** claimed: live posting to Instagram, Facebook, Google or TikTok (adapters need approved apps and credentials; posts are handed off with a copy-ready package), live social metrics or Google reviews (tested with a sandbox provider only), WhatsApp Status or bulk messaging (unsupported by design), ad spend (never automatic), revenue or sales attribution (Kora does not see sales). See [`docs/architecture/PRESENCE-OS.md`](docs/architecture/PRESENCE-OS.md) and [`docs/integrations/CHANNELS.md`](docs/integrations/CHANNELS.md).

## The product in one line

`BUILD → PUBLISH → WATCH → EXPLAIN → AUTHORIZE → FIX → VERIFY → PROVE`

Under the owner experience is an evidence-first reliability kernel:

`OBSERVE → DETECT → CORRELATE → DIAGNOSE → PROPOSE → AUTHORIZE → EXECUTE → VERIFY → AUDIT`

AI is optional and never the authority boundary. Model output is validated input. A deterministic policy engine decides `DENY | REQUIRE_APPROVAL | ALLOW`, a typed executor performs approved changes, and only new observations can produce `RecoveryVerified`.

## What is real today

| Area                                                                                             | State                                                                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| SiteSpec v2 website generation, three design directions, editing, preview and immutable versions | Implemented                                                                       |
| Independent Site Host and verified publishing                                                    | Implemented and live on RumptyCloud                                               |
| Continuous monitoring, incidents, evidence and deterministic diagnosis                           | Implemented                                                                       |
| Owner-language Mission Control plus technical Proof mode                                         | Implemented                                                                       |
| Typed rollback, deterministic policy, approval and closed-loop recovery verification             | Implemented                                                                       |
| Incident Passport v2 and offline integrity verification                                          | Implemented                                                                       |
| Authentication, organizations, roles, tenant isolation and audit                                 | Implemented                                                                       |
| Existing-domain connection with DNS/HTTPS observation                                            | Implemented                                                                       |
| Paystack billing model, entitlements and webhook contract                                        | Implemented and tested; live Paystack is not configured                           |
| Remote/on-device AI art director and Reasoner paths                                              | Implemented with validation/fallback; no production model endpoint is configured  |
| Registrar-backed domain purchase                                                                 | Scaffold only; not claimed                                                        |
| Email delivery                                                                                   | Not implemented; notifications are in-app                                         |
| Provider VM restart/redeploy/deployment rollback as Kora actions                                 | Not implemented; Kora's proven recovery action is its own immutable site rollback |

## Production acceptance is complete

On **October 30, 2026**, Kora's real RumptyCloud deployment was exercised end to end on commit `cb871bf`:

1. A SiteSpec v2 customer site was published and its live bytes matched the stored artifact.
2. Five consecutive healthy observations were recorded.
3. A controlled HTTP 500 was applied to the live customer site; the public Site Host genuinely returned 500.
4. Kora detected the failure itself and opened exactly one incident.
5. The owner view moved to **Waiting for approval** and explained what Kora knew and did not know.
6. The Reasoner proposed `republish_site_version`; deterministic policy returned `REQUIRE_APPROVAL`.
7. After owner approval, Kora restored the previous immutable version and verified the deployed bytes.
8. Execution did **not** count as recovery. Kora waited for new observations.
9. Three new healthy observations produced `RECOVERY_VERIFIED` after about 35 seconds.
10. The exported Incident Passport v2 verified **PASS** offline.

IDs, server timestamps, evidence JSON and deployed screenshots are recorded in [`LIVE-ACCEPTANCE.md`](LIVE-ACCEPTANCE.md) and [`docs/live/`](docs/live/README.md).

## Design intelligence

SiteSpec v2 is a closed design system rather than free-form model HTML. It currently includes:

- 14 section types and multiple registered variants
- 12 hero compositions and 6 navigation patterns
- 32 industry recipes
- bundled OFL fonts and curated licensed photography
- procedural art for categories without appropriate photography
- deterministic generation plus optional model-assisted direction selection
- fact, cliché and contrast gates
- browser QA across generated businesses and mobile/desktop widths
- axe WCAG 2.1 A/AA checks in the design QA suite

Details: [`docs/design/`](docs/design/README.md) and [`ADR-019`](docs/adr/ADR-019-design-intelligence-and-site-spec-v2.md).

## Kora Presence v3

The next product layer is being developed as an **Africa-first Trusted Presence OS** rather than another generic storefront or POS product.

The thesis is simple: the website is the owned home, while Google, WhatsApp and social channels are distribution surfaces. Kora should become the control plane that keeps a business's public identity accurate, reachable, discoverable and operational — while turning real inbound/search data into grounded next actions.

The research, competitive analysis, mobile contract, visual-system decisions, pricing hypotheses and build order are locked in [`docs/research/AFRICA-PRESENCE-OS-2026.md`](docs/research/AFRICA-PRESENCE-OS-2026.md).

This direction is **not** presented as already shipped functionality. It is the post-hackathon company roadmap built on top of the proven website + reliability core.

## Architecture

- `apps/api` — Fastify control plane, auth, builder APIs, monitoring and operations
- `apps/web` — React Mission Control
- `apps/site-host` — independent customer-site runtime
- `packages/site-schema` — SiteSpec v1/v2, deterministic designer, renderer and quality gates
- `packages/site-fonts` / `packages/site-media` — bundled licensed assets
- `services/incident-engine` — deterministic incident rules
- `services/reasoner` — validated reasoning with deterministic fallback
- `services/policy-engine` — `DENY | REQUIRE_APPROVAL | ALLOW`
- `services/action-executor` — typed execution boundary
- `packages/passport` — offline Incident Passport verifier
- `integrations/rumptycloud` — provider boundary and documented capability model

The Site Host is intentionally separate from the control plane. Kora monitors the customer-serving runtime over its public URL, so the recorded failure/recovery is across a real service boundary rather than an in-process simulation.

## Run locally

Requires Node.js 22+, pnpm 10+, Docker Compose and PostgreSQL 17.

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
# export the .env values into your shell
pnpm db:migrate
pnpm build
KORA_PUBLIC_URL=http://localhost:3000 KORA_CHAOS_ENABLED=true node apps/api/dist/server.js
```

The app is then available at `http://localhost:3000`.

Common gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

PostgreSQL-backed test suites are destructive and intentionally refuse to run unless `DATABASE_URL` names a database ending in `_test`.

## Security and truthfulness

Kora separates **fact, inference, diagnosis and hypothesis**. An HTTP 500 proves an unhealthy HTTP observation; it does not prove a VM crash or memory exhaustion. Missing provider status, logs or metrics remain explicit gaps rather than invented explanations.

Cloud credentials never belong in evidence or model context. Arbitrary shell execution is outside the Kora remediation boundary. Changes are typed and policy-gated. Incident Passports are integrity-evident, not signed attestations: they prove the exported content has not changed without claiming who produced it.

The owner product uses authenticated sessions and tenant isolation. A legacy evidence API/UI remains intentionally available for compatibility and demo evidence; do not treat those legacy routes as the authorization model for the Mission Control product.

See [`SECURITY.md`](SECURITY.md), [`docs/architecture/overview.md`](docs/architecture/overview.md) and the ADRs in [`docs/adr/`](docs/adr/).

## Honest limits

The production acceptance used the deterministic designer and Reasoner because no Rumpty Inference endpoint is configured. A real Gemini Nano browser model was not available in CI; the documented Chrome Prompt API path is exercised with a stub. Customer image uploads, local image generation and WebLLM/Transformers.js are post-submission work. Live Paystack, registrar purchasing and email delivery are not claimed. A real-owner usability study and field Lighthouse/LCP data are still needed before making product-market-fit claims.

Licensed under Apache-2.0.
