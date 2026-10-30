/* Writes the diversity + weight matrix for the fixture briefs (docs/design/diversity-matrix.md). */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BRIEFS } from "../../packages/site-schema/test/fixtures/briefs.js";
import {
  designSignature,
  fontFilesFor,
  planDirections,
  renderSiteV2,
} from "../../packages/site-schema/src/index.js";

const fonts = resolve("packages/site-fonts/files");
const rows: string[] = [];
const sigs: ReturnType<typeof designSignature>[] = [];
let maxBytes = 0;
for (const [key, brief] of Object.entries(BRIEFS)) {
  const [d0] = planDirections(brief);
  const sig = designSignature(d0!.spec);
  sigs.push(sig);
  const files = renderSiteV2(d0!.spec);
  const text = (files["index.html"]! + files["styles.css"]!).length;
  const fb = fontFilesFor(d0!.spec.design.typography.pairing).reduce(
    (n, f) => n + statSync(join(fonts, f)).size,
    0,
  );
  maxBytes = Math.max(maxBytes, text);
  rows.push(
    `| ${key} | ${d0!.spec.meta.recipe} | ${sig.hero} | ${sig.nav} | ${sig.pairing} | ${sig.palette} | ${sig.footer} | ${sig.density}/${sig.shape} | ${(text / 1024).toFixed(1)} KB | ${(fb / 1024).toFixed(0)} KB |`,
  );
}
const distinct = (f: (s: (typeof sigs)[number]) => string) =>
  new Set(sigs.map(f)).size;
const md = `# Diversity matrix (generated)

Direction A for each of ${sigs.length} fixture briefs, produced by the deterministic designer with no AI configured.
Regenerate with \`npx tsx scripts/design-qa/matrix.ts\`.

| Fixture | Recipe | Hero | Header | Type pairing | Palette | Footer | Density/shape | HTML+CSS | Fonts |
|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

**Distinct across ${sigs.length} sites:** hero ${distinct((s) => s.hero)}, header ${distinct((s) => s.nav)}, type pairing ${distinct((s) => s.pairing)}, palette ${distinct((s) => s.palette)}, footer ${distinct((s) => s.footer)}, full component-variant sequence ${distinct((s) => s.variants)}, section order ${distinct((s) => s.order)}.
Largest HTML+CSS payload: ${(maxBytes / 1024).toFixed(1)} KB. No JavaScript beyond the form handler.

The asserted floors live in \`packages/site-schema/test/v2.test.ts\` ("diversity").
`;
writeFileSync(resolve("docs/design/diversity-matrix.md"), md);
console.log(md);
void readFileSync;
