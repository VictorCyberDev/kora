// Renders planned sites with the real renderer and screenshots them in real Chromium (desktop + 390px phone).
// Usage: node scripts/creative/shoot.mjs <outDir> <key[:direction]>...   (keys from packages/creative/test/fixtures/business-matrix.json)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const pkg = (n) =>
  import(
    new URL(
      `../../packages/${n}/dist/${n === "site-media" || n === "site-fonts" ? "" : "src/"}index.js`,
      import.meta.url,
    ).href
  );
const { planDirectionsV3, renderSiteV3, criticV3 } = await pkg("site-schema");
const { readMediaFile } = await pkg("site-media");
const { readFontFile } = await pkg("site-fonts");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = new URL("../../", import.meta.url).pathname;
const matrix = JSON.parse(
  fs.readFileSync(
    path.join(root, "packages/creative/test/fixtures/business-matrix.json"),
    "utf8",
  ),
);
const [outDir, ...wanted] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const summary = [];
for (const w of wanted) {
  const [key, dirIx = "0"] = w.split(":");
  const c = matrix.find((m) => m.key === key);
  const { directions } = planDirectionsV3({
    name: c.name,
    description: c.description,
  });
  const d = directions[Number(dirIx)];
  const files = renderSiteV3(d.spec, {
    formEndpoint: "https://kora.example/api/public/sites/s1/forms",
  });
  const server = http.createServer(async (req, res) => {
    let u = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (u.startsWith("/_kora/media/")) {
      const b = await readMediaFile(u.slice(13));
      return b
        ? (res.writeHead(200, { "content-type": "image/webp" }), res.end(b))
        : (res.writeHead(404), res.end());
    }
    if (u.startsWith("/_kora/fonts/")) {
      const b = await readFontFile(u.slice(13));
      return b
        ? (res.writeHead(200, { "content-type": "font/woff2" }), res.end(b))
        : (res.writeHead(404), res.end());
    }
    const cand = [
      u.replace(/^\//, ""),
      path.posix.join(u.replace(/^\//, ""), "index.html"),
      u.replace(/^\/|\/$/g, "") + ".html",
    ];
    const hit = cand.find((k) => files[k] !== undefined);
    if (hit === undefined) {
      res.writeHead(404);
      return res.end("nf");
    }
    const ct = hit.endsWith(".css")
      ? "text/css"
      : hit.endsWith(".js")
        ? "text/javascript"
        : hit.endsWith(".svg")
          ? "image/svg+xml"
          : "text/html; charset=utf-8";
    res.writeHead(200, { "content-type": ct });
    res.end(files[hit]);
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const pages = Object.keys(files).filter((k) => k.endsWith(".html"));
  const row = {
    key,
    direction: d.name,
    pages: d.spec.pages.map((p) => p.slug),
    blockingCritic: criticV3(d.spec).filter((i) => i.severity === "block")
      .length,
    shots: [],
    overflow: [],
    brokenImages: [],
  };
  for (const [label, vp, mobile] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["phone", { width: 390, height: 844 }, true],
  ]) {
    const ctx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: 1,
      isMobile: mobile,
    });
    for (const f of pages) {
      const page = await ctx.newPage();
      const url = base + "/" + (f === "index.html" ? "" : f);
      await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        broken: [...document.images]
          .filter((i) => !i.complete || i.naturalWidth === 0)
          .map((i) => i.src),
      }));
      if (m.sw > m.cw + 1) row.overflow.push(`${label}:${f}`);
      row.brokenImages.push(...m.broken.map((b) => `${label}:${f}:${b}`));
      // lazy images below the fold only load when scrolled to; scroll through the page so a capture shows what a visitor sees
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);
      row.brokenImages.push(
        ...(
          await page.evaluate(() =>
            [...document.images]
              .filter((i) => i.naturalWidth === 0)
              .map((i) => "after-scroll:" + i.src.slice(-60)),
          )
        ).map((b) => `${label}:${f}:${b}`),
      );
      const out = path.join(
        outDir,
        `${key}-${dirIx}-${f.replace(/[\\/]/g, "_").replace(/\.html$/, "")}-${label}.png`,
      );
      await page.screenshot({ path: out, fullPage: true });
      row.shots.push(path.basename(out));
      await page.close();
    }
    await ctx.close();
  }
  server.close();
  summary.push(row);
}
await browser.close();
fs.writeFileSync(
  path.join(outDir, "shoot-summary.json"),
  JSON.stringify(summary, null, 1),
);
console.log(
  JSON.stringify(
    summary.map((r) => ({ ...r, shots: r.shots.length })),
    null,
    1,
  ),
);
