# Diversity matrix (generated)

Direction A for each of 17 fixture briefs, produced by the deterministic designer with no AI configured.
Regenerate with `npx tsx scripts/design-qa/matrix.ts`.

| Fixture      | Recipe             | Hero               | Header   | Type pairing        | Palette         | Footer      | Density/shape    | HTML+CSS | Fonts |
| ------------ | ------------------ | ------------------ | -------- | ------------------- | --------------- | ----------- | ---------------- | -------- | ----- |
| interior     | interior-design    | portfolio          | minimal  | geometric           | terracotta-sand | minimal     | spacious/sharp   | 39.9 KB  | 28 KB |
| repair       | home-repair        | local-service      | classic  | humanist            | sunrise         | local       | compact/soft     | 34.9 KB  | 45 KB |
| saas         | saas               | product            | floating | technical           | indigo-tech     | columns     | balanced/soft    | 33.0 KB  | 81 KB |
| restaurant   | restaurant         | editorial-centered | centered | warm-serif          | tomato-cream    | columns     | spacious/soft    | 35.2 KB  | 53 KB |
| consultant   | consultant-coach   | portfolio          | minimal  | geometric           | ink-paper       | minimal     | spacious/sharp   | 33.3 KB  | 28 KB |
| barber       | barber             | minimal-statement  | split    | modern-grotesk      | workshop        | minimal     | balanced/sharp   | 32.4 KB  | 71 KB |
| dental       | dental             | stacked-story      | classic  | geometric           | clinic-teal     | columns     | balanced/soft    | 31.8 KB  | 28 KB |
| photography  | photography        | full-bleed         | minimal  | high-contrast-serif | midnight-brass  | brand-heavy | spacious/soft    | 31.9 KB  | 66 KB |
| law          | law                | split-art          | classic  | humanist            | coastal-navy    | columns     | balanced/soft    | 32.6 KB  | 45 KB |
| fitness      | fitness-gym        | bento              | dark     | technical           | graphite-lime   | columns     | balanced/soft    | 34.4 KB  | 81 KB |
| boutique     | boutique           | luxury             | centered | luxury-serif        | plum-blush      | brand-heavy | editorial/sharp  | 32.1 KB  | 73 KB |
| bakery       | cafe-bakery        | media-left         | classic  | soft-rounded        | sunrise         | local       | balanced/rounded | 32.5 KB  | 32 KB |
| phones       | electronics-repair | local-service      | classic  | humanist            | coastal-navy    | local       | compact/soft     | 33.9 KB  | 45 KB |
| salon        | salon-beauty       | media-left         | classic  | soft-rounded        | plum-blush      | local       | balanced/rounded | 34.4 KB  | 32 KB |
| studio       | architecture       | split-art          | minimal  | editorial-serif     | ink-paper       | columns     | spacious/sharp   | 32.6 KB  | 51 KB |
| fine         | restaurant         | luxury             | centered | luxury-serif        | midnight-brass  | brand-heavy | editorial/sharp  | 32.8 KB  | 73 KB |
| construction | construction       | bento              | dark     | expressive          | workshop        | local       | balanced/sharp   | 33.9 KB  | 50 KB |

**Distinct across 17 sites:** hero 11, header 6, type pairing 10, palette 11, footer 4, full component-variant sequence 16, section order 7.
Largest HTML+CSS payload: 39.9 KB. No JavaScript beyond the form handler.

The asserted floors live in `packages/site-schema/test/v2.test.ts` ("diversity").
