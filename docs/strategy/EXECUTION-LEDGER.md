# Transformation execution ledger

Branch `transformation-m0-m1`. Status words: DONE (built, tested), PROTOTYPE (exists, not wired to the product), NOT STARTED.

| M | Item | Status | Evidence |
|---|---|---|---|
| M0 | Ground-truth freeze | DONE | Lock report + appendix A; build and all workspace tests pass |
| M1 | Architecture lock | DONE | Lock report; ADR-026, ADR-027 |
| M2 | Kora Brand V4 | PROTOTYPE | `docs/design/brand-v4/` (three directions, provisional pick; live brand unchanged) |
| M3 | Shell vNext | DONE (site level) | Six-area grouped site navigation replaces the 18-tab strip; e2e critical-flow + responsive 320–1280 pass. The top-level app nav is unchanged (Home/Presence/Customers/Marketing/Health/More) |
| M4 | Public experience | PARTIAL | Landing rewritten as an act-by-act story with the new positioning (rendered and checked at 1440; e2e updated). Business Audit acquisition page not built; the hero product scene still shows the reliability illustration only |
| M5 | Truth Engine | PARTIAL | Engine + migration 022 + `GET /truth`, `POST /truth/check` (append-only ledgers, tenant-checked) + integration tests. Generators (content writer, site composer) do not yet call it |
| M6 | Onboarding + Business Identity Snapshot | PARTIAL | Snapshot exists as the Identity tab (facts with source, gaps as questions). The sign-up onboarding flow itself is unchanged |
| M7 | Brand Genome | DONE | `genome.ts` derive/gaps/drift/diff + `GET/POST /genome`, versioned append-only. Identity tab (Business Identity Snapshot + brand-in-your-words form) covered by the critical-flow e2e |
| M8 | Creative direction engine | PARTIAL | Art Direction schema, food/cake and restaurant playbooks and quality-floor gates + 4 tests (`artdirection.ts`). No composer yet maps it to SiteSpec |
| M9–M10 | Site engine vNext / quality | PARTIAL | `creativeFindings` gates measured on real generated specs (filler process, duplicate facts, food vocabulary, photo floor). Composer from Art Direction not built |
| M11 | Creative Quality System | PARTIAL | Six perspectives, K0–K5 grade, similarity check, `GET /versions/:id/quality`. No UI, no human taste-label store |
| M12 | Campaign domain | PARTIAL | `campaign.ts`: brief, four directions, feasibility, ad hypotheses (approval-gated), evidence labels, channel adaptation; 7 tests. No persistence or UI; existing bundle planner untouched |
| M13–M26 |  studio vNext, video, distribution, Today intelligence, discovery, customer loop, performance, learning, audit acquisition, shareability, pilot, managed service, scale | NOT STARTED | Provider-dependent items also need owner credentials |

Next in order: wire the Art Direction composer (M9) for food/cakes and re-render the Phase 0 sites against the gates; wire Truth Engine persistence and use it in content validation (M5); then M4.
Test totals now: growth 102 (was 90). Nothing is deployed from this branch.
