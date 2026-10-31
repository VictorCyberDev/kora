# ADR-027: Truth Engine: provenance for every business fact

Status: accepted. Milestone M1 (implemented in M5).

## Context
`BusinessFacts` today is a flat validated record. Copy, assets and sites can only be as honest as the facts under them, and the product promise forbids invented premises, staff, products, prices, testimonials or metrics.

## Decision
1. Every fact has: value, source (`OWNER_STATED`, `OWNER_UPLOADED`, `SCRAPED`, `INFERRED`, `VERIFIED`), confidence, observed-at and an optional expiry (offers, opening hours).
2. A **claim ledger** records which facts each generated artefact used. Generators may use only facts at or above a per-use threshold (a price needs `OWNER_STATED` or better; a tone word may be `INFERRED`).
3. Unsupported or expired claims are **blocked, not softened**; the owner sees the gap as a question ("What does a standard cake cost?").
4. The Business Identity Snapshot shown at onboarding is a rendering of the ledger for owner confirmation. Confirmation upgrades facts to `VERIFIED`.
5. Images are facts too: provenance (uploaded, licensed catalogue, generated) is stored; generated images of food or products pass the dish/product gate and are labelled where shown.

## Consequences
- Extends the existing `@kora/growth` validators and stale-offer detection; no change to tenant isolation or audit.
- A migration adds provenance columns and a claim-use table (append-only). Backfill marks existing facts `OWNER_STATED`.
- Adds friction in onboarding; mitigated by the Snapshot being a single confirm screen.
