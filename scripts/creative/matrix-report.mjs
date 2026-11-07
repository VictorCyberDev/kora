// Runs the acceptance matrix through a built planner and prints one JSON row per business and direction.
// Usage: node scripts/creative/matrix-report.mjs <repoRoot> > out.json   (repoRoot has packages/*/dist built)
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(
  process.argv[2] ?? new URL("../../", import.meta.url).pathname,
);
const matrixPath = new URL(
  "../../packages/creative/test/fixtures/business-matrix.json",
  import.meta.url,
);
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const imp = (p) => import(path.join(root, "packages", p));
const S = await imp("site-schema/dist/src/index.js");
const C = await imp("creative/dist/src/index.js");
const rows = [];
const words = (t) => t.split(/\s+/).filter(Boolean).length;
for (const c of matrix) {
  const brief = { name: c.name, description: c.description };
  const vertical = C.resolveVertical(`${c.name} ${c.description}`).id;
  let dirs;
  try {
    dirs = S.planDirectionsV3(brief).directions;
  } catch (e) {
    rows.push({ key: c.key, error: String(e.message).slice(0, 120) });
    continue;
  }
  for (const d of dirs) {
    const spec = d.spec;
    const text = [];
    const walk = (v, k) => {
      if (
        typeof v === "string" &&
        [
          "heading",
          "subheading",
          "intro",
          "text",
          "body",
          "caption",
          "answer",
          "question",
          "title",
        ].includes(k)
      )
        text.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
      else if (v && typeof v === "object")
        for (const [kk, x] of Object.entries(v))
          if (kk !== "media") walk(x, kk);
    };
    spec.pages.forEach((p) => p.sections.forEach((s) => walk(s, "")));
    const media = S.buildImageManifest ? S.buildImageManifest(spec) : null;
    const completeness = S.completenessV3
      ? S.completenessV3(spec, { brief, generation: true })
          .filter((i) => i.severity === "block")
          .map((i) => i.code)
      : null;
    const files = S.renderSiteV3(spec, {
      formEndpoint: "https://kora.example/api/public/sites/s/forms",
    });
    rows.push({
      key: c.key,
      vertical,
      direction: d.name,
      pages: spec.pages.length,
      slugs: spec.pages.map((p) => p.slug).join(","),
      sections: spec.pages.reduce((n, p) => n + p.sections.length, 0),
      words: text.reduce((n, t) => n + words(t), 0),
      truncated: text.filter((t) => /(…|\.\.\.)\s*$/.test(t)).length,
      imagePlacements: media
        ? media.summary.placements
        : spec.pages.reduce(
            (n, p) => n + JSON.stringify(p).split('"media":').length - 1,
            0,
          ),
      distinctImages: media ? media.summary.distinctImages : null,
      blocking: completeness,
      lint: S.lintArtifact(files).length,
      hasForm: Object.values(files).some(
        (f) => typeof f === "string" && f.includes("<form"),
      ),
    });
  }
}
console.log(JSON.stringify(rows, null, 1));
