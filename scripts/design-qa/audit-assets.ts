/* Phase 0 audit: renders sample banners/flyers with the real asset engine and measures how close text gets to the canvas edge. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { BRIEFS } from "../../packages/site-schema/test/fixtures/briefs.js";
import { planDirections } from "../../packages/site-schema/src/v2/index.js";
import {
  AssetSpecSchema,
  deriveBrandKit,
  renderAssetSvg,
  type AssetSpec,
} from "../../packages/growth/src/index.js";
import { ttfPaths } from "../../packages/site-fonts/src/index.js";

const out = process.argv[2] ?? "docs/design/audit-before/assets";
mkdirSync(out, { recursive: true });
async function main() {
const fonts = await ttfPaths();
const opts = (w: number) => ({
  fitTo: { mode: "width" as const, value: w },
  font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Inter" },
});
const cases: Array<[string, keyof typeof BRIEFS, Partial<AssetSpec> & Pick<AssetSpec, "format">, string, string]> = [
  ["bakery-square", "bakery", { format: "square", category: "offer" }, "Celebration cakes", "Order for your next party"],
  ["bakery-flyer", "bakery", { format: "flyer", category: "offer", layout: "split" }, "Fresh bread daily", "Sourdough, croissants and cakes"],
  ["restaurant-story", "restaurant", { format: "story", category: "offer" }, "Weekend jollof", "Palm wine on weekends"],
  ["fine-portrait", "fine", { format: "portrait", category: "announcement" }, "A seven-course tasting menu", "Wednesday to Sunday evenings"],
];
const rows: string[] = [];
for (const [name, key, over, headline, sub] of cases) {
  const brief = BRIEFS[key]!;
  const spec = planDirections(brief)[0]!.spec;
  const kit = deriveBrandKit(spec);
  const a = AssetSpecSchema.parse({ category: "offer", headline, subline: sub, cta: "Order now", contact: brief.phone ?? brief.whatsapp ?? "", ...over });
  const r = renderAssetSvg(a, kit, brief.name, 1);
  writeFileSync(join(out, `${name}.svg`), r.svg);
  const withText = new Resvg(r.svg, opts(r.width)).render();
  writeFileSync(join(out, `${name}.png`), withText.asPng());
  // text pixels = pixels that change when every <text> is removed
  const bare = new Resvg(r.svg.replace(/<text[\s\S]*?<\/text>/g, ""), opts(r.width)).render();
  const A = withText.pixels, B = bare.pixels, W = withText.width, H = withText.height;
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  rows.push(`| ${name} | ${W}×${H} | ${minX} | ${W - 1 - maxX} | ${minY} | ${H - 1 - maxY} | ${((W - 1 - maxX) / W * 100).toFixed(1)}% |`);
}
const md = `| asset | canvas | text left gap px | text right gap px | top gap px | bottom gap px | right gap % of width |\n|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
writeFileSync(join(out, "edge-gaps.md"), md);
console.log(md);
}
void main();
