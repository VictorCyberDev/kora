# Kora — submission package

**Status: READY TO SUBMIT** (evidence: `LIVE-ACCEPTANCE.md`, `docs/live/`). Not-done items are listed there and marked post-submission.

## Name and one-line pitch

**Kora.** _Build your website. Kora keeps it running._ A website builder that stays after launch: it designs the site, watches it, explains failures from evidence, fixes what it is allowed to (with your approval), and proves recovery.

## Problem

Small businesses get a website from a builder, then nobody watches it. When it breaks, the first alert is a lost customer. The owner cannot read logs, and "AI ops" tools that act on guesses are worse than none.

## Solution

1. **Design.** Describe the business in two lines. Kora offers three genuinely different designs (not one template) built from a closed, human-designed component library; an optional AI art director may choose among them. Nothing in a customer site can be written by a model: validated spec → deterministic renderer → immutable, hashed artifact.
2. **Launch.** One-click publish to a real address; the live bytes are verified against the artifact.
3. **Operate.** Continuous health checks; incidents opened only after repeated failures; one incident per failure.
4. **Recover.** Evidence-first diagnosis ("what Kora knows / does not know"), a typed fix (restore the previous version), a deterministic policy (`DENY | REQUIRE_APPROVAL | ALLOW`), owner approval, execution — and **recovery counts only after new health observations pass**.
5. **Prove.** An Incident Passport anyone can verify offline (`pnpm kora:verify`).

## Why it is different

The AI is never the source of truth and never has authority. Model output (remote or on-device) is untrusted input: validated against a schema of existing components, checked for invented facts and clichés, and rejected on any failure, with a deterministic designer/reasoner that is a complete product by itself. A fix succeeding is never recovery. Every step is in an append-only audit trail.

## How Rumpty is used

- **RumptyCloud Web Services:** two services from one image, deployed from `main` by the GitHub integration — the **control plane** (`kora-api`: API, Mission Control, monitors) and an **independent Site Host** (`kora-site-host`: serves customer sites, read-only database role, no auth/billing/API routes). The monitor observes the Site Host over the public internet, so a Site Host failure is a real, separately observed failure.
- **RumptyCloud PostgreSQL** as the system of record (immutable versions, incidents, evidence, audit).
- Both services expose a signed-off runtime claim (`/__kora`) with the deployed commit; production reports `cb871bf`.
- Inference: Kora speaks any OpenAI-compatible endpoint (`AI_*`), including Rumpty Inference. **Not configured in the current production deployment** (needs console access); production runs the deterministic designer and reasoner.

## Live URLs

- Product (control plane + Mission Control): https://kora-api.rumptycloud.app
- Customer sites (Site Host): https://kora-site-host.rumptycloud.app — showcase: `/s/o-ko-dining-4c2c4a/`, recovery demo: `/s/fix-hub-phone-laptop-repair-9eb5cb/`
- Source: https://github.com/VictorCyberDev/kora
- The free "Trial" plan is enabled; sign up works; no payments are configured.

## Architecture (one screen)

`apps/api` control plane (Fastify, PostgreSQL) · `apps/site-host` independent runtime · `apps/web` React Mission Control · `packages/site-schema` SiteSpec v1+v2, designer, renderer, quality gate · `packages/site-fonts`, `site-media` bundled OFL fonts and licensed photographs · `services/{reasoner,policy-engine,action-executor,incident-engine}` · `packages/passport` offline verifier. See `docs/architecture/overview.md`, ADR-012…019, `docs/design/`.

## AI use

- Optional art director (Chrome built-in Prompt API on-device, opt-in, no key → any OpenAI-compatible endpoint with ordered fallbacks → deterministic designer). Output is validated and fact-gated.
- Optional incident explanation by the Reasoner, validated against the immutable diagnosis; deterministic fallback (this is what production used in the recorded recovery).
- The AI cannot publish, restore, approve or execute anything.

## Recovery demonstration (real, on RumptyCloud, 2026-10-30)

Healthy site → 5 healthy observations → controlled **HTTP 500** on the live version (public site really returns 500) → the monitor detects it itself → exactly one incident → Owner explanation → policy `REQUIRE_APPROVAL` → approval → rollback to the previous version (bytes verified) → **Checking recovery** → 3 new healthy observations → `RECOVERY_VERIFIED` in 35 s → **Recovered** → Passport v2 **PASS**. Details and ids: `LIVE-ACCEPTANCE.md`.

## Screenshots

`docs/live/screens/` (real UI run on the deployed product and the live showcase site), `docs/design/before-after/` (v1 vs v2 for eight businesses), `docs/design/diversity-sheet.jpg`, `docs/design/three-directions.jpg`.

## Demo

`DEMO.md` (2–4 minutes, with a beat-by-beat table).

## Honest limits

No real-owner study or Lighthouse field data; Chrome Prompt API tested against a stub of the documented API (no Gemini Nano in CI); WebLLM, customer image upload and local image generation are post-submission; photographs exist for restaurant/café/hospitality/phone-repair only (other categories use procedural art); custom domains, live Paystack and registrars are not claimed; Rumpty usage/cost was not inspected from this session.
