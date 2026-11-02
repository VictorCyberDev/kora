// Renders the golden businesses through the real v3 engine into a directory, for browser screenshots.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  planDirectionsV3,
  renderSiteV3,
  lintArtifact,
} from "../../packages/site-schema/dist/src/index.js";
const GOLDEN = JSON.parse(
  readFileSync(new URL("./v7-golden-briefs.json", import.meta.url), "utf8"),
);

const out = process.argv[2] ?? "/var/tmp/gold";
const only = process.argv[3];
const index = [];
for (const [id, brief, opts] of GOLDEN) {
  if (only && id !== only) continue;
  const { directions, recommended } = planDirectionsV3(brief, opts ?? {});
  for (const d of directions) {
    const files = renderSiteV3(d.spec, {
      formEndpoint: "https://kora.example/api/public/sites/x/forms",
    });
    const problems = lintArtifact(files);
    if (problems.length) console.error(id, d.index, "LINT", problems);
    const dir = join(out, id, String(d.index));
    for (const [p, c] of Object.entries(files)) {
      const f = join(dir, p);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, c);
    }
    index.push({
      id,
      index: d.index,
      name: d.name,
      grammar: d.direction.grammarId,
      hero: d.spec.design.genome.heroPhilosophy,
      recommended: d.recommended,
      pages: d.spec.pages.map((p) => p.slug),
    });
  }
  console.log(id, "recommended:", recommended.reason);
}
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 1));
