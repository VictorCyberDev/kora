// Renders briefs through the real v3 engine (or the v2 designer, for before/after) into a directory for screenshots.
// usage: node v7-golden.mjs <outDir> [onlyId] ; env MODE=plain|enriched|v2 ; BRIEFS=golden|sameindustry
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  planDirectionsV3,
  planDirections,
  renderSiteV3,
  renderSiteV2,
  lintArtifact,
} from "../../packages/site-schema/dist/src/index.js";

const file =
  process.env.BRIEFS === "sameindustry"
    ? "v7-sameindustry-briefs.json"
    : "v7-golden-briefs.json";
const GOLDEN = JSON.parse(
  readFileSync(new URL(`./${file}`, import.meta.url), "utf8"),
);
const MODE = process.env.MODE ?? "plain";
const out = process.argv[2] ?? "/var/tmp/gold";
const only = process.argv[3];
// Real photographs from the bundled licensed set stand in for an owner's uploads (fixtures for visual QA only).
const F = (files, role) =>
  files.map((f, i) => ({
    id: `fx-${f}`,
    role,
    url: `/_kora/media/${f}`,
    srcset: [],
    alt: "",
    width: 1600,
    height: 1067,
    focal: { x: 0.5, y: 0.5 },
    quality: {
      score: 92 - i,
      heroReady: true,
      orientation: "landscape",
      flags: [],
    },
  }));
const FIXTURES = {
  bakery: F(
    [
      "bakery-cake-frosting.webp",
      "bakery-cake-making.webp",
      "bakery-nigeria-maker.webp",
    ],
    "product",
  ),
  barber: F(
    [
      "barber-black-client-cut.webp",
      "barber-detail-grooming.webp",
      "barber-shop-service.webp",
    ],
    "service",
  ),
  restaurant: F(
    [
      "restaurant-timber-ceiling.webp",
      "restaurant-bright-chic.webp",
      "cafe-minimal-daylight.webp",
    ],
    "environment",
  ),
  law: F(
    [
      "law-office-consultation.webp",
      "law-documents-detail.webp",
      "lawyer-office-work.webp",
    ],
    "environment",
  ),
  hotel: F(
    ["hospitality-sunlit-hall.webp", "restaurant-timber-ceiling.webp"],
    "environment",
  ),
  mechanic: F(["repair-bench-microscope.webp"], "service"),
};
const index = [];
for (const [id, brief] of GOLDEN) {
  if (only && id !== only) continue;
  if (MODE === "v2") {
    planDirections(brief).forEach((d) => {
      const files = renderSiteV2(d.spec, {
        formEndpoint: "https://kora.example/api/public/sites/x/forms",
      });
      write(id, d.index, files);
    });
    continue;
  }
  const opts = MODE === "enriched" ? { ownerPhotos: FIXTURES[id] ?? [] } : {};
  if (MODE === "enriched" && !FIXTURES[id]) continue;
  const { directions, recommended } = planDirectionsV3(brief, opts);
  for (const d of directions) {
    const files = renderSiteV3(d.spec, {
      formEndpoint: "https://kora.example/api/public/sites/x/forms",
    });
    const problems = lintArtifact(files);
    if (problems.length) console.error(id, d.index, "LINT", problems);
    write(id, d.index, files);
    index.push({
      id,
      index: d.index,
      name: d.name,
      grammar: d.direction.grammarId,
      hero: d.spec.design.genome.heroPhilosophy,
      voice: d.spec.design.genome.typeVoice,
      colorway: d.spec.design.colorwayId,
      recommended: d.recommended,
    });
  }
  console.log(id, "recommended:", recommended.reason);
}
function write(id, idx, files) {
  const dir = join(out, id, String(idx));
  for (const [p, c] of Object.entries(files)) {
    const f = join(dir, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c);
  }
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 1));
