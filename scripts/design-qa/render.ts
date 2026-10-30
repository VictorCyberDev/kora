/* Renders every fixture brief x 3 directions to out/design-qa/<fixture>/<d>/ for screenshot QA. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BRIEFS } from "../../packages/site-schema/test/fixtures/briefs.js";
import {
  planDirections,
  renderSiteV2,
} from "../../packages/site-schema/src/v2/index.js";

const out = process.argv[2] ?? "out/design-qa";
rmSync(out, { recursive: true, force: true });
for (const [key, brief] of Object.entries(BRIEFS)) {
  for (const d of planDirections(brief)) {
    const files = renderSiteV2(d.spec, {
      formEndpoint: "https://forms.example/submit",
    });
    for (const [path, content] of Object.entries(files)) {
      const full = join(out, key, String(d.index), path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    writeFileSync(
      join(out, key, String(d.index), "spec.json"),
      JSON.stringify(d.spec, null, 2),
    );
  }
}
console.log("rendered to", out);
