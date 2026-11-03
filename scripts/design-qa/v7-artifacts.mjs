// Renders a cross-channel set (feed, portrait, story, status, banner, flyer, carousel cover) per golden business from
// the SAME Brand OS the website was built from, rasterises with the bundled fonts, and writes PNGs + a manifest.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  planDirectionsV3,
  withBrandOs,
} from "../../packages/site-schema/dist/src/index.js";
import {
  composeArtifact,
  renderArtifactSvg,
  artifactIssues,
  brandOsHash,
  ARTIFACT_FORMATS,
} from "../../packages/creative/dist/src/index.js";
import { ttfPaths } from "../../packages/site-fonts/dist/index.js";
const GOLDEN = JSON.parse(
  readFileSync(new URL("./v7-golden-briefs.json", import.meta.url), "utf8"),
);
const { Resvg } = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("@resvg/resvg-js");

const out = process.argv[2] ?? "/var/tmp/art";
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
mkdirSync(out, { recursive: true });
const fonts = await ttfPaths();
const png = (svg, w) =>
  new Resvg(svg, {
    fitTo: { mode: "width", value: w },
    font: {
      fontFiles: fonts,
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  })
    .render()
    .asPng();
const FORMATS = [
  "social-square",
  "social-portrait",
  "story",
  "whatsapp-status",
  "banner",
  "flyer-a5",
  "carousel-cover",
];
const manifest = [];
for (const [id, brief] of GOLDEN) {
  if (only && !only.test(id)) continue;
  const { directions } = planDirectionsV3(brief);
  const d = directions.find((x) => x.recommended) ?? directions[0];
  const { brandOs } = withBrandOs(d.spec, 1);
  const hero = d.spec.pages[0].sections[0];
  const services =
    d.spec.pages[0].sections
      .find((s) => s.type === "offer" || s.type === "products")
      ?.items?.map((i) => i.title) ?? [];
  const contact = d.spec.business.whatsapp
    ? `WhatsApp ${d.spec.business.whatsapp}`
    : (d.spec.business.phone ?? d.spec.business.email ?? "");
  const brand = {
    name: d.spec.business.name,
    version: brandOs.version,
    hash: brandOsHash(brandOs),
    mode: d.spec.design.mode,
    palette: brandOs.visual.palette,
    genome: d.spec.design.genome,
  };
  for (const f of FORMATS) {
    const spec = composeArtifact({
      format: f,
      brand,
      objective: "announcement",
      content: {
        eyebrow: d.spec.business.location?.split(",")[0] ?? "",
        headline: hero.heading.replace(/\.$/, ""),
        subline: services.length ? services.slice(0, 3).join(" · ") : "",
        cta: hero.primaryCta?.label ?? "",
        contact,
        bullets:
          f === "carousel-cover" || f === "flyer-a5"
            ? services.slice(0, 4)
            : [],
      },
      hasImage: false,
      seed: 7,
    });
    const r = renderArtifactSvg(spec);
    const issues = artifactIssues(spec, {
      suppliedText: JSON.stringify(brief),
    });
    const file = join(out, `${id}-${f}.png`);
    writeFileSync(file, png(r.svg, Math.min(r.width, 700)));
    writeFileSync(join(out, `${id}-${f}.svg`), r.svg);
    const fmt = ARTIFACT_FORMATS[f];
    const overflow = r.boxes
      .filter(
        (b) =>
          b.role !== "ticker" &&
          b.role !== "cta-box" &&
          (b.x < -2 || b.x + b.w > fmt.width + 2 || b.y + b.h > fmt.height + 2),
      )
      .map((b) => b.role);
    // safe-zone check: headline/cta/contact must not sit in platform chrome on stories
    const unsafe =
      fmt.kind === "story"
        ? r.boxes
            .filter(
              (b) =>
                ["headline", "cta-box", "contact", "subline"].includes(
                  b.role,
                ) &&
                (b.y < fmt.safe.t - 4 ||
                  b.y + b.h > fmt.height - fmt.safe.b + 8),
            )
            .map((b) => b.role)
        : [];
    manifest.push({
      id,
      f,
      composition: spec.composition,
      brandOs: `${spec.brand.osVersion}:${spec.brand.osHash.slice(0, 8)}`,
      issues: issues.map((i) => i.code),
      overflow,
      unsafe,
    });
  }
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
const bad = manifest.filter(
  (m) =>
    m.overflow.length || m.unsafe.length || m.issues.includes("LOW_CONTRAST"),
);
console.log(`rendered ${manifest.length}; problems ${bad.length}`);
for (const b of bad.slice(0, 20))
  console.log(
    b.id,
    b.f,
    b.composition,
    "overflow:",
    b.overflow,
    "unsafe:",
    b.unsafe,
  );
