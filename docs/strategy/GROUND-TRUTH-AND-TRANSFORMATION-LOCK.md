# Kora Ground Truth & Transformation Lock Report

Date: 2026-10-31. Author: Claude Code (autonomous execution under the owner's Company Transformation mandate).
Status: M0 (ground-truth freeze) and M1 (architecture lock). Every claim below is from the repo or a cited artifact; where something is unknown it is marked UNKNOWN.

## 1. Repository ground truth
- Repo `VictorCyberDev/kora`; default branch `main`; HEAD `99a7e62` (docs(live) #31); product code last changed at `b29226c` (M35–M40, #30).
- pnpm monorepo, ~835 tracked files, ~54k lines TS/TSX.
  - apps: `api` (Fastify control plane), `web` (React), `site-host` (customer-site runtime), `demo-service`.
  - packages: `growth`, `site-schema` (SiteSpec v1+v2), `site-fonts`, `site-media`, `site-serving`, `passport`, `runtime-claim`, `topology`, `event-schema`.
  - services: `reasoner`, `policy-engine`, `action-executor`, `incident-engine`.
- Docs: ADR-001…025, architecture, design, execution, integrations, live, research, runbooks, screens, security, ui.
- Migrations 001–021 (013–021 are Presence/Marketing OS). CI jobs: quality, e2e, docker. RumptyCloud deploys `main` automatically; runtime claim at `/__kora`.

## 2. Branch and git state
- Merged and squashed: `growth-g*`, `design-presence-os-v3`, `milestone-2-rumptycloud` lines of work and the strategy branch (`strategy/marketing-execution-os-lock` has zero commits ahead of main). Their "ahead" counts are history shape, not unmerged features.
- Unmerged: `design-v2-phase0` (audit evidence; absorbed here, see section 20) and `kora-design-v2` (6 commits ahead, an earlier brand/design attempt; superseded by this program, retained, not deleted).
- This work lives on `transformation-m0-m1`, branched from `design-v2-phase0`. Nothing is pushed to `main`.

## 3. What is real and working (verified earlier in production)
- Reliability kernel: monitors → incidents → deterministic diagnosis → Reasoner → policy (DENY / REQUIRE_APPROVAL / ALLOW) → typed `republish_site_version` rollback → recovery verified only by new observations → Incident Passport v2.
- Site generation: SiteSpec v1/v2, immutable versions, publishing, verification.
- Presence/Marketing OS (M18–M40): BusinessFacts, presence graph, health checks, Brand Kit, channel capability model, leads/customers, studio (static assets, motion frames, MP4 via resvg+ffmpeg), content calendar with content-hash-bound approvals, authority policy, campaign bundles, tracked-link attribution, analytics normalisation, reviews, business memory, voice intent.
- Production check: 24/24 presence checks and recovery regression at `b29226c` (`docs/live/PRESENCE-OS-PRODUCTION-CHECK.md`).
- Tests at last full run: growth 90, API 444, plus Playwright critical-flow, design-qa, responsive+axe.

## 4. What is not real (stated plainly)
- No live provider credentials: Meta, Google, TikTok channels report NOT_CONFIGURED. Sandbox adapter only, production-disabled. Live publish, metrics and review adapters are not written.
- No hosted image or video generation wired. MP4 export needs ffmpeg, which the production image lacks unless built with `WITH_FFMPEG=true`.
- No language model configured in production; the deterministic writer is the live path.
- Lighthouse/LCP never measured. Customer count, pilot usage and revenue: none claimed.
- ProdPermit: not found in the accessible repos; no findings are reported (see section 6).

## 5. Quality ground truth (measured, not opinion)
From `docs/design/audit-before/FINDINGS.md` and `measurements.md`:
- Restaurant menu cards render identical placeholder arches; restaurant and bakery heroes are empty-room stock photos.
- Every variant has the same "How it works" filler. The bakery never names a cake, loaf, croissant or cupcake, and repeats facts (hero bullets + trust strip).
- Fine-dining portrait headline ends 34px from the right edge; fine-dining asset colours ignore the dark site theme.
- One photo in the first two screens in all 9 variants (floor is 3). H1 is 2.9–7.8% of width; only one variant reaches 7vw. Font payload 32–73KB across 2–4 files.
- App: site-tab strip wraps to two rows at 1440 and has ~18 tabs; background gradient seam; Create page is three selects and a button.
- Conclusion: the platform is structurally strong and the creative output is generic. The transformation targets the output, not the kernel.

## 6. Sibling repositories and design-system lessons
Read-only shallow clones of `willie` and `brindle`.
- **willie** (`docs/BRAND_SYSTEM.md`, `MOTION_SPEC.md`, `BRAND_CAMPAIGNS.md`): one concept ("One live thing. Many communities."), one distinctive visual object (a six-segment asymmetric capsule with luminous core), a locked motion vocabulary (lock 200–300ms, depart 350–500ms, a 750ms hold gesture, reduced-motion fallback), an interface verb ("Pass Willie"), a closing line. The chain CONCEPT → OBJECT → MOTION → INTERFACE VOCABULARY → MARKETING VOCABULARY is the transferable lesson. Not its aesthetic.
- **brindle** (`README.md`, `docs/ARCHITECTURE.md`): a sharply bounded positioning (explicit "What it is NOT" list) and deterministic safety boundaries with LLM reasoning outside them. This matches Kora's kernel discipline and informs the "not Wix/Canva/Buffer" statement.
- **ProdPermit**: searched the account's accessible repos; not found. Nothing is asserted about it.

## 7. Current brand state
"Calm control": the level-line motif, DM Serif Display + Manrope, paper `#f6f5f0` with a single deep green `#0b6e5f`. It is coherent but it brands the reliability product only. It cannot carry a creative operating system, and green-on-paper is close to the cliché the mandate asks us to avoid.

## 8. Positioning lock
Kora is an AI-native creative and growth team for small businesses, delivered as software that owns the workflow and delivers outcomes. Promise: LOOK WORLD-CLASS. GET DISCOVERED. WIN CUSTOMERS. KEEP IMPROVING.
Not: a website builder, Canva, Buffer, a CRM, a generic AI builder, a chatbot, a dashboard. The reliability kernel is the trust layer under all of it, not the headline.

## 9. Moat lock
Context × judgment × creative direction × business memory × execution × distribution × performance history × reliability × category intelligence. Of these, today's repo has reliability, execution and a thin business memory. Context, judgment and creative direction are the gaps and the first investment.

## 10. Principles (adopted verbatim as engineering rules)
Outcome before feature; concept before asset; art direction before components; truth before storytelling; context before generic AI; quality before volume; business performance before vanity; approval before consequential action; mobile primary; premium is not heavy; customer control; do not automate mediocrity.

## 11. Seven engines + quality system (target architecture)
Truth, Brand, Creative, Production, Distribution, Performance, Learning, plus the Creative Quality System. Mapping onto the repo:
| Engine | Exists today | Gap |
|---|---|---|
| Truth | BusinessFacts, presence graph, health checks | Fact provenance, claim ledger (M5) |
| Brand | Brand Kit derive/versioned | Brand Genome, distinctive codes (M7) |
| Creative | Content writer + validators | Strategy → big idea → directions (M8) |
| Production | SiteSpec renderer, studio, motion frames | Art Direction object, composition rhythm (M9–M10, M13–M15) |
| Distribution | Calendar, approvals, authority, sandbox adapters | Live adapters, hand-off flow (M16) |
| Performance | Tracked links, analytics normalisation | Observed vs inferred vs estimated (M20) |
| Learning | Business memory | Taste data, feedback loop (M21) |
| Quality | `validateDraft`, design-qa | 13 review perspectives, K0–K5 grades (M11) |

## 12. Architecture decision: Art Direction as data
No model writes HTML or CSS. A model (or a human) produces an Art Direction object (concept, type pairing, palette roles, composition rhythm, image plan, motion behaviour, irregularity budget). The existing deterministic SiteSpec v2 renderer consumes it. This preserves immutability, verification and the golden-hash tests, and makes quality inspectable and diffable.

## 13. Truth Engine decision
Every fact carries provenance (owner stated / inferred / scraped / verified), a confidence and an expiry. Generated copy and assets may only use facts at or above a threshold; unsupported claims are blocked, never softened. Never fabricate premises, staff, products, prices, testimonials or metrics.

## 14. Brand Genome decision
A versioned object: strategic, verbal, visual, motion, commercial and performance DNA, plus distinctive brand codes (a small set of repeatable devices). Kora's own brand is expressed in the same schema (dogfooding).

## 15. Kora brand direction (to test, not locked)
Working concept "Resonance System": a business is a signal that others should recognise at a glance. Distinctive object candidate: a layered signal mark that composes into every output. Rules: no stock soundwaves; avoid green/gold "Africa" clichés; Ember may evolve. M2 produces three tested directions with the willie-style chain (concept → object → motion → interface vocabulary → marketing vocabulary) and a recorded choice.

## 16. Product and IA decision
Today-oriented IA: TODAY / PRESENCE / CUSTOMERS / GROW / STUDIO. The ~18-tab site strip is replaced by these five, with the Proof mode (evidence, passport) kept as a depth layer. Studio starts from context (a campaign, a fact change, an event), never a blank canvas.

## 17. Campaign as a first-class object
Objective, audience, offer, key visual, channel adaptations, schedule, approval state, tracked links, results. Ads are hypotheses with a spend cap that always needs approval. Kora does not become an ad-buying console.

## 18. Approval and risk tiers
Tier 0 read-only; Tier 1 internal drafts; Tier 2 customer-visible content (approval, content-hash bound); Tier 3 spend, pricing, legal or irreversible (explicit approval with named amount). Existing `decide` authority policy is extended, not replaced.

## 19. Reliability preserved
Immutable versions, rollback path, recovery verified only by new observations, Passport v2, tenant isolation, append-only audit, content-hash approvals. These are invariants of the transformation; any milestone that touches them needs regression evidence.

## 20. Reconciliation of competing strategy documents
- `docs/research/MARKETING-EXECUTION-OS-2026.md`, `AFRICA-PRESENCE-OS-2026.md`: kept as research inputs; this report supersedes them where they conflict.
- Design-v2 brief (premium food/cake sites, generated imagery, Remotion): absorbed as the first **vertical wedge** inside M8–M15, not run as a parallel program. Its Phase 0 audit stands as the baseline (`docs/design/audit-before/`). Owner answers recorded in `docs/design/DECISIONS.md`: hosted image generation first; free Remotion tier (valid only while the organisation has ≤3 people; the owner's message was cut off). References are still needed; until supplied, the Art Direction work uses the willie-style chain and category playbooks, and any reference-dependent decision is flagged as such.
- `kora-design-v2` branch: superseded, retained.

## 21. Initial vertical wedge
Food & cake businesses in Lagos-style markets (bakeries, cake studios, restaurants, caterers), then salons/beauty and events. Reason: visual products, high WhatsApp/Instagram dependence, measurable by enquiries. This is a working choice, falsifiable by the pilot.

## 22. Commercial model (not locked)
START / GROW / PRO / MANAGED, mapped to the existing `TIER_FEATURES`. Pricing, currency and payment rails are an owner decision; none is implemented here.

## 23. Pilot
10–30 businesses, defined success metrics (enquiries attributed, time-to-first-published, approval-to-publish rate, rework rate, owner-rated quality). Recruiting and consent are owner actions.

## 24. Risks
1. Creative quality is subjective → labelled taste data and an external review loop (M11). 2. Generated imagery misrepresents products → dish/product gate and provenance. 3. Model cost → context packets, caching, provider abstraction. 4. Platform API access (Meta/Google/TikTok) is gated by external review → hand-off flow stays first-class. 5. Scope: this is a multi-quarter program; M0–M26 are sequenced, not simultaneous. 6. Remotion licence if headcount exceeds 3.

## 25. Owner-only blockers (do not block progress)
Provider credentials and app reviews; `KORA_SECRETS_KEY`, `KORA_PLANS_JSON`; ffmpeg in the production image; payment/pricing decisions; design references; second dish reviewer; Nigerian legal read; pilot recruitment; the remainder of the cut-off Remotion message.

## 26. Milestone plan (M0–M26) and evidence rule
M0 ground truth freeze · M1 architecture lock · M2 Kora Brand V4 · M3 shell vNext · M4 public experience · M5 Truth Engine · M6 onboarding + Business Identity Snapshot · M7 Brand Genome · M8 creative direction engine · M9–M10 site engine vNext/quality · M11 Creative Quality System · M12 campaign domain · M13–M14 Studio vNext/static quality · M15 video/motion · M16 distribution · M17 Today/growth intelligence · M18 discovery · M19 customer loop · M20 performance · M21 learning · M22 audit acquisition · M23 shareability · M24 commercial pilot · M25 managed service · M26 scale readiness.
Each milestone ships with: tests, screenshots or measured output, a doc, and an honest limits list. Prototypes are labelled. Nothing claims an integration live without a tested live call.

## 27. Definition of done (client output 20-question test, abridged)
Would a stranger believe it was made by a human studio? Is every claim backed by a fact? Does it look different from the last business in the category? Does it work on a low-end phone on a slow network? Is there one clear action? Is an owner approval recorded for anything public? Could the owner change it without us? (Full list authored in M11.)

## 28. Decision log and what happens next
Decisions locked in this report: sections 8, 9, 10, 12–14, 16–19, 20, 21. Open (owner): section 22 pricing, section 23 recruitment, section 25 items.
Next, executed without waiting: **M0** baseline (test run, screenshot set of current app and sites, capability inventory) → **M1** this lock plus ADR-026 (Art Direction object) and ADR-027 (Truth Engine) → **M2** Kora Brand V4 three-direction exploration.

## Appendix A: M0 baseline evidence (2026-10-31, branch `transformation-m0-m1`)
- `pnpm build`: exit 0.
- `pnpm -r test`: all workspaces pass. site-schema 176, passport 91, growth 90, API 444 passed / 1 skipped, reasoner 17, demo-service 14, policy-engine 10, action-executor 8, runtime-claim 27, topology 7, incident-engine 6, site-serving 3, event-schema 2.
- Baseline visuals of current sites and app: `docs/design/audit-before/` (renders and measurements from Phase 0).
- Not run in this baseline: Playwright e2e (run in CI), Lighthouse (never measured; scheduled in M4).
