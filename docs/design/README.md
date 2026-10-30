# Design intelligence and website generation

Kora's websites are designed by people once, and configured per business. The AI never writes HTML, CSS or JavaScript.
It chooses among components that already exist, and a deterministic renderer turns the validated choice into files.

| Doc                                              | What it covers                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [site-spec-v2.md](site-spec-v2.md)               | The v2 spec, the Design DNA, v1 compatibility, upgrade and rollback                |
| [design-system.md](design-system.md)             | Component library, palettes, type pairings, motion, accessibility                  |
| [design-intelligence.md](design-intelligence.md) | Planner, recipes, directions, the AI provider and its guardrails, AI configuration |
| [brand.md](brand.md)                             | Kora's own brand ("calm control"), voice guidelines, status language               |
| [visual-qa.md](visual-qa.md)                     | What is checked in a real browser, results, known limits                           |
| [diversity-matrix.md](diversity-matrix.md)       | Generated: how different the fixture sites are                                     |
| `before-after/`                                  | Five businesses, v1 vs v2, desktop and phone                                       |
| `diversity-sheet.jpg`, `three-directions.jpg`    | The fixture sites side by side; three directions for three businesses              |

Run it yourself: `pnpm build && npx tsx scripts/design-qa/matrix.ts && npx playwright test e2e/design-qa.spec.ts`.
