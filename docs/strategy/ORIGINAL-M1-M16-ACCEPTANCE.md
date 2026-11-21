# Krevstudio — original M1–M16 integration and acceptance ledger

> Authority: the owner's 2026-11-21 **MASTER M1–M16 COMPLETION, INTEGRATION, QUALITY, GROWTH AND COMMERCIAL VALIDATION MANDATE**.
> This is the **original locked 24-milestone roadmap's first sixteen milestones**. Do not confuse it with the historical Transformation M0–M26 ledger or the later Creative Studio M1–M10.
>
> All statuses below are conservative: source presence is not customer acceptance. Preserve `docs/strategy/EXECUTION-LEDGER.md` and `CREATIVE-PLATFORM-LEDGER.md` as historical namespaces. Do not mark a milestone complete from an API route or one prior green run.

## Current branch and dependency

- Base: PR #43 `feature/krevstudio-graphics-acceptance` at `3238255b50244f03192893a689a9389940f07007`, historically green CI `44591696070`.
- Integration: PR #44 `feature/krevstudio-creative-m5-motion-editor`, stacked on #43. Never merge #44 to main without resolving #43 dependency.
- Historical failure: CI `44919938735` failed one Motion API assertion and Website/Motion browser workflows; Docker build passed.
- Motion API assertion was updated to inspect text across SVG nodes; Motion browser setup now waits for authenticated signup. The Website Studio trace showed an editor CSS preload failure and an external font import blocked under CSP; the Vite build now strips that optional third-party CSS import. These fixes still require **current-head CI**.
- Production API and Site Host retain historical Kora hostnames; no production deploy, data mutation, migration or live-provider commissioning is evidenced by this ledger.

## Locked acceptance map

| ID | Original identity | Current status | Existing implementation / evidence | Remaining acceptance and source targets |
| --- | --- | --- | --- | --- |
| M1 | Future System Lock | PARTIALLY IMPLEMENTED | `docs/strategy/GROUND-TRUTH-AND-TRANSFORMATION-LOCK.md`; Business Facts, Truth, Brand Genome, BrandOS, SiteSpec, creative modules, legacy growth contracts | Reconcile shared authority and adapters in executable schemas; verify no contradictory consumers and preserve older SiteSpec versions |
| M2 | Final Krevstudio Brand Identity | PARTIALLY IMPLEMENTED | `apps/web/src/krev-brand.css`, marketing pages and existing branding; README now distinguishes current identity from historic Kora | Logo/symbol final signoff, voice, typography, motion and exported/email/metadata parity; visual review |
| M3 | Landing Page / Feat of Strength | PARTIALLY IMPLEMENTED | `apps/web/src/pages/public.tsx`, `landing-v7.tsx`, public audit | Genuine multi-Studio outputs, CTA-to-first-asset conversion, pricing/forms/mobile/SEO/accessibility and browser screenshots |
| M4 | Onboarding and Business Profile | PARTIALLY IMPLEMENTED | Signup, identity, factual provenance; new goal-first signup path creates a draft workspace for non-website goals | Verify all six goals, returning-user restoration, partial drafts, errors, progressive brief, mobile; avoid relying on website publication |
| M5 | Brand Genome | PARTIALLY IMPLEMENTED | `packages/growth/src/genome.ts`, `packages/creative/src` BrandOS | One owner-approved version authority, immutable linkage, edit diff and approval propagation to every Studio |
| M6 | Creative Direction Engine | PARTIALLY IMPLEMENTED | `packages/growth/src/artdirection.ts`, `packages/creative/src/artdirection.ts` | Compatibility contracts, distinctness comparisons, cross-Studio consistency and bounded rendered evaluation |
| M7 | Website Engine vNext | PARTIALLY IMPLEMENTED | SiteSpec v3, Puck editor, immutable versions, Site Host | Verify repaired browser acceptance, seven-page edit/save/reload/publish/rollback, responsive render parity and v1/v2 survival |
| M8 | Quality System | PARTIALLY IMPLEMENTED | `docs/design/creative-quality.md`, structured critics, benchmarks and screenshots | Integrated defects across *actual* exported formats, blocking gates, measurable before/after fixes, human signoff |
| M9 | Campaign Object | PARTIALLY IMPLEMENTED | Campaign briefs, content bundle, calendar, hashes, Creative Campaign OS | Complete Meridian seven-day campaign with actual editable assets, approval invalidation, scheduling vs manual handoff, measurement |
| M10 | Studio vNext | PARTIALLY IMPLEMENTED | Website, Graphics, Logo, Motion, Media, agency workspaces in PRs #43–44 | One shared customer entry/project lifecycle; real PNG/SVG/MP4, revision/restore, imports and asset reuse |
| M11 | Today / Dashboard vNext | PARTIALLY IMPLEMENTED | `packages/growth/src/today-actions.ts`, `apps/web/src/pages/today.tsx` | Evidence/priority/expected effect, execute correct workflows, truthful completion status and updated state |
| M12 | Discovery | PARTIALLY IMPLEMENTED | `packages/growth/src/discovery.ts`, public audit, metadata/GBP checks | Verified live observations where authorized, source provenance, safe fetch, indexing readiness and actionable fixes |
| M13 | Performance | PARTIALLY IMPLEMENTED | `packages/growth/src/performance.ts`, `analytics.ts`, tracking links and enquiries | Reliable channel-period comparisons, provider freshness, no double counting, source provenance and conversion event linkage |
| M14 | Learning and Business Memory | PARTIALLY IMPLEMENTED | `packages/growth/src/learning.ts`, `memory.ts`, owner taste labels | Persistence-backed rejected-trait regression across restart, feedback influences all Studios and Today; owner correction |
| M15 | Sharing and Acquisition Loop | PARTIALLY IMPLEMENTED | Signed public audit links; new `packages/growth/src/acquisition.ts` reducer with privacy, dedup and tenant isolation | Durable server event capture, actual share→visit→signup→activation→first export attribution, explicit consent, cross-tenant tests |
| M16 | Commercial Pilot | PARTIALLY IMPLEMENTED | `packages/growth/src/pilot.ts`; new `pilot-evaluation.ts` and tests | Store consented participants, instrument lifecycle, recruit >=10 actual businesses, observed costs/retention/quality/payments, validated willingness to pay |

## Architectural authority to validate in M1

1. **Facts vs preferences:** Business Facts + Truth Engine remain authoritative for factual claims and provenance. Owner-approved Brand Genome / BrandOS versions are authoritative for creative constraints; inferred preferences never mutate verified facts.
2. **Creative output:** SiteSpec v3 is authoritative for new websites; existing SiteSpec v1/v2 are compatibility inputs, not disposable records. Puck is an editor, not the published rendering authority.
3. **Studio assets:** Current document, logo, motion and agency stores remain format-specific implementations; one customer-facing library and project history should project them consistently, not spawn duplicate editors.
4. **Campaign and publish:** Content-hash approval invalidates upon substantive edits. Publishing has real PUBLISHED/UNKNOWN/FAILED/manual handoff states; no outbound provider action is inferred from draft generation.
5. **Memory and performance:** Actual source events carry freshness/provenance and tenant scope. Preference feedback may alter future suggestions but cannot invent business facts or sales.
6. **Acquisition:** Public share tokens grant only the intended report view. Referral measurements require separate consent, deduplication, attribution and tenant-safe storage. Pure funnel evaluation alone is not an operational acquisition system.
7. **Pilot:** Engineering instrumentation and real-world commercial validation are distinct outcomes; no simulated participant or synthetic receipt qualifies as a paying customer.

## Release gate and continuation contract

- Fix latest-head failures; format, lint, typecheck, build, unit, fresh + upgrade + rerun migration, API/DB, Playwright, security, Docker.
- Run the owner's entire 46-step Meridian Bakes integrated browser journey and capture real evidence for **each** step.
- Check old published sites, backups, rollback, staging provider/billing configuration, human visual quality, usage/cost.
- Record for each milestone: source SHA; implementation; tests; CI run; browser exports/screenshots; security; unresolved defect; external blocker; status. A blocker on one item must **not** suspend independently executable engineering on the others.
- Production deployment, customer outreach, billing and public publishing require their own applicable authorization. Never claim evidence not recorded.
