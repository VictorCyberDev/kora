// Builds the real example images used on Kora's own landing page from the actual engine output (no mock-ups).
// Inputs: dirs produced by v7-golden.mjs (MODE=plain -> /var/tmp/g-plain, MODE=v2 -> /var/tmp/g-v2) and v7-artifacts.mjs (/var/tmp/art).
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
const req = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { chromium } = createRequire(import.meta.url)("@playwright/test");
const sharp = req("sharp");
const out = process.argv[2] ?? "apps/web/public/v7";
mkdirSync(out, { recursive: true });
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const roots = { v7: "/var/tmp/g-plain", v2: "/var/tmp/g-v2" };
const srv = createServer((rq, res) => {
  const u = decodeURIComponent((rq.url ?? "/").split("?")[0]);
  const m = /^\/(v7|v2)\/([^/]+)\/(\d)(\/.*)?$/.exec(u);
  let file;
  if (u.startsWith("/_kora/fonts/"))
    file = join("packages/site-fonts/files", u.slice(13));
  else if (u.startsWith("/_kora/media/"))
    file = join("packages/site-media/files", u.slice(13));
  else if (m) {
    file = join(roots[m[1]], m[2], m[3], m[4] ?? "/");
    if (file.endsWith("/")) file += "index.html";
  }
  if (!file || !existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
  });
  res.end(readFileSync(file));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const browser = await chromium.launch();
const shots = [
  // [name, engine, id, direction, width, height, outWidth]
  ["bakery-d0", "v7", "bakery", 0, 1280, 800, 1100],
  ["bakery-d1", "v7", "bakery", 1, 1280, 800, 1100],
  ["bakery-d2", "v7", "bakery", 2, 1280, 800, 1100],
  ["bakery-m", "v7", "bakery", 0, 390, 844, 560],
  ["barber", "v7", "barber", 0, 1280, 800, 1100],
  ["law", "v7", "law", 0, 1280, 800, 1100],
  ["hotel", "v7", "hotel", 0, 1280, 800, 1100],
  ["fashion", "v7", "fashion", 0, 1280, 800, 1100],
  ["plumber", "v7", "plumber", 0, 1280, 800, 1100],
  ["saas", "v7", "saas", 0, 1280, 800, 1100],
  ["barber-m", "v7", "barber", 0, 390, 844, 560],
  ["law-m", "v7", "law", 0, 390, 844, 560],
  ["barber-v2", "v2", "barber", 0, 1280, 800, 1100],
  ["bakery-v2", "v2", "bakery", 0, 1280, 800, 1100],
  ["law-v2", "v2", "law", 0, 1280, 800, 1100],
];
for (const [name, eng, id, idx, w, h, ow] of shots) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/${eng}/${id}/${idx}/`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({
    clip: { x: 0, y: 0, width: w, height: h },
  });
  await sharp(png)
    .resize({ width: ow })
    .webp({ quality: 78 })
    .toFile(join(out, `${name}.webp`));
  await ctx.close();
}
await browser.close();
srv.close();
// artifacts from the same brand: square, story, flyer, banner for the bakery
const art = "/var/tmp/art";
for (const [src, dst, w] of [
  ["bakery-social-square", "bakery-square", 640],
  ["bakery-story", "bakery-story", 420],
  ["bakery-flyer-a5", "bakery-flyer", 520],
  ["bakery-banner", "bakery-banner", 900],
  ["barber-social-square", "barber-square", 640],
  ["law-social-square", "law-square", 640],
]) {
  if (existsSync(`${art}/${src}.png`))
    await sharp(`${art}/${src}.png`)
      .resize({ width: w })
      .webp({ quality: 80 })
      .toFile(join(out, `${dst}.webp`));
}
console.log("done");

// Real direction data for the landing page (names, palette, type, signature) straight from the engine.
const { planDirectionsV3, VOICES } =
  await import("../../packages/site-schema/dist/src/index.js");
const { writeFileSync } = await import("node:fs");
const GOLDEN = JSON.parse(
  readFileSync(new URL("./v7-golden-briefs.json", import.meta.url), "utf8"),
);
const brief = GOLDEN.find(([id]) => id === "bakery")[1];
const r = planDirectionsV3(brief);
const data = {
  brief: {
    name: brief.name,
    description: brief.description,
    whatsapp: brief.whatsapp,
    services: brief.services,
  },
  recommended: r.recommended,
  directions: r.directions.map((d) => ({
    name: d.name,
    concept: d.summary,
    essence: d.direction.strategy.brandEssence,
    signature: d.direction.signatureDevice.name,
    typeface: VOICES[d.spec.design.genome.typeVoice].display.family,
    voice: d.direction.strategy.voice,
    swatches: [
      d.spec.design.palette.background,
      d.spec.design.palette.primary,
      d.spec.design.palette.secondary,
      d.spec.design.palette.accent,
    ],
    avoids: d.direction.antiPatterns.slice(0, 3),
    recommended: d.recommended,
  })),
};
const { readdirSync } = await import("node:fs");
data.images = {};
for (const f of readdirSync(out))
  if (f.endsWith(".webp")) {
    const m = await sharp(join(out, f)).metadata();
    data.images[f.replace(".webp", "")] = { w: m.width, h: m.height };
  }
writeFileSync("apps/web/src/landing-v7.json", JSON.stringify(data, null, 1));
console.log(data.directions.map((d) => d.name).join(" | "));
