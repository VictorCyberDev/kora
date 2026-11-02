# Reference Atlas v2

Design memory. See `docs/research/AGENCY-CREATIVE-SYSTEM-2026.md` for method and evidence counts.

- Data: `packages/creative/src/references.ts`; stats via `referenceStats()`.
- Each entry: principle, signature, why it works, when it fails, small-business applicability, the grammars it informed,
  observed tokens (only for fetched entries) and a `doNotCopy` line.
- Evidence levels: `fetched`, `search-lead`, `analyst`. Tests assert the counts and that every grammar traces to at
  least three references.
- The v5 Reference Atlas (64 verticals, blueprint and campaign counts) remains for the v2 designer. v3 does not retrieve
  blueprints: it composes from grammars, so there is no inventory of third-party layouts to resell.

Policy: no scraping of copyrighted assets, no pixel-for-pixel recreations, no brand names in enums, no third-party
work presented as a Kora template.
