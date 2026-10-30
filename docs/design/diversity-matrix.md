# Diversity matrix (generated)

Direction A for each of 13 fixture briefs, produced by the deterministic designer with no AI configured.
Regenerate with `npx tsx scripts/design-qa/matrix.ts`.

| Fixture      | Recipe           | Hero               | Header   | Type pairing        | Palette         | Footer      | Density/shape    | HTML+CSS | Fonts |
| ------------ | ---------------- | ------------------ | -------- | ------------------- | --------------- | ----------- | ---------------- | -------- | ----- |
| interior     | interior-design  | portfolio          | minimal  | geometric           | terracotta-sand | minimal     | spacious/sharp   | 39.5 KB  | 28 KB |
| repair       | home-repair      | local-service      | classic  | humanist            | sunrise         | local       | compact/soft     | 34.6 KB  | 45 KB |
| saas         | saas             | product            | floating | technical           | indigo-tech     | columns     | balanced/soft    | 43.5 KB  | 81 KB |
| restaurant   | restaurant       | editorial-centered | centered | warm-serif          | tomato-cream    | columns     | spacious/soft    | 34.6 KB  | 53 KB |
| consultant   | consultant-coach | portfolio          | minimal  | geometric           | ink-paper       | minimal     | spacious/sharp   | 33.0 KB  | 28 KB |
| barber       | barber           | minimal-statement  | split    | modern-grotesk      | workshop        | minimal     | balanced/sharp   | 32.0 KB  | 71 KB |
| dental       | dental           | stacked-story      | classic  | geometric           | clinic-teal     | columns     | balanced/soft    | 31.4 KB  | 28 KB |
| photography  | photography      | full-bleed         | minimal  | high-contrast-serif | midnight-brass  | brand-heavy | spacious/soft    | 31.5 KB  | 66 KB |
| law          | law              | split-art          | classic  | humanist            | coastal-navy    | columns     | balanced/soft    | 32.2 KB  | 45 KB |
| fitness      | fitness-gym      | bento              | dark     | technical           | graphite-lime   | columns     | balanced/soft    | 55.0 KB  | 81 KB |
| boutique     | boutique         | luxury             | centered | luxury-serif        | plum-blush      | brand-heavy | editorial/sharp  | 31.7 KB  | 73 KB |
| bakery       | cafe-bakery      | media-left         | classic  | soft-rounded        | sunrise         | local       | balanced/rounded | 32.7 KB  | 32 KB |
| construction | construction     | bento              | dark     | expressive          | workshop        | local       | balanced/sharp   | 33.5 KB  | 50 KB |

**Distinct across 13 sites:** hero 11, header 6, type pairing 9, palette 11, footer 4, full component-variant sequence 13, section order 7.
Largest HTML+CSS payload: 55.0 KB. No JavaScript beyond the form handler.

The asserted floors live in `packages/site-schema/test/v2.test.ts` ("diversity").
