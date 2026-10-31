# Transformation execution ledger

Branch `transformation-m0-m1`. Status words: DONE (built, tested), PROTOTYPE (exists, not wired to the product), NOT STARTED.

| M | Item | Status | Evidence |
|---|---|---|---|
| M0 | Ground-truth freeze | DONE | Lock report + appendix A; build and all workspace tests pass |
| M1 | Architecture lock | DONE | Lock report; ADR-026, ADR-027 |
| M2 | Kora Brand V4 | PROTOTYPE | `docs/design/brand-v4/` (three directions, provisional pick; live brand unchanged) |
| M3 | Shell vNext | DONE (site level) | Six-area grouped site navigation replaces the 18-tab strip; e2e critical-flow + responsive 320–1280 pass. The top-level app nav is unchanged (Home/Presence/Customers/Marketing/Health/More) |
| M4 | Public experience (7-act landing, audit acquisition page) | NOT STARTED | |
| M5 | Truth Engine | PARTIAL | Pure engine + 8 tests (`packages/growth/src/truth.ts`). Not yet wired: no migration, no API, generators do not yet record ledgers |
| M6 | Onboarding + Business Identity Snapshot | NOT STARTED | |
| M7 | Brand Genome | NOT STARTED | |
| M8 | Creative direction engine | PARTIAL | Art Direction schema, food/cake and restaurant playbooks and quality-floor gates + 4 tests (`artdirection.ts`). No composer yet maps it to SiteSpec |
| M9–M10 | Site engine vNext / quality | NOT STARTED | Depends on the composer |
| M11 | Creative Quality System | NOT STARTED | Floor gates in M8 are the first slice |
| M12–M26 | Campaign domain, studio vNext, video, distribution, Today intelligence, discovery, customer loop, performance, learning, audit acquisition, shareability, pilot, managed service, scale | NOT STARTED | Provider-dependent items also need owner credentials |

Next in order: wire the Art Direction composer (M9) for food/cakes and re-render the Phase 0 sites against the gates; wire Truth Engine persistence and use it in content validation (M5); then M4.
Test totals now: growth 102 (was 90). Nothing is deployed from this branch.
