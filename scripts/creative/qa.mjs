// Browser QA across the acceptance matrix, using the real renderer and real Chromium:
// horizontal overflow, broken images, console errors, axe accessibility violations (serious/critical), page weight.
// Usage: node scripts/creative/qa.mjs <out.json> [direction=0]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const pkg = (n) =>
  import(
    new URL(
      `../../packages/${n}/dist/${n === "site-media" || n === "site-fonts" ? "" : "src/"}index.js`,
      import.meta.url,
    ).href
  );
const { planDirectionsV3, renderSiteV3 } = await pkg("site-schema");
const { readMediaFile } = await pkg("site-media");
const { readFontFile } = await pkg("site-fonts");
const root = new URL("../../", import.meta.url).pathname;
const matrix = JSON.parse(
  fs.readFileSync(
    path.join(root, "packages/creative/test/fixtures/business-matrix.json"),
    "utf8",
  ),
);
const [out, dirIx = "0"] = process.argv.slice(2);
const browser = await chromium.launch();
const rows = [];
for (const c of matrix) {
  const d = planDirectionsV3({ name: c.name, description: c.description })
    .directions[Number(dirIx)];
  const files = renderSiteV3(d.spec, {
    formEndpoint: "https://kora.example/api/public/sites/s1/forms",
  });
  const server = http.createServer(async (req, res) => {
    const u = decodeURIComponent((req.url ?? "/").split("?")[0]);
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
    const k = [u.slice(1), path.posix.join(u.slice(1), "index.html")].find(
      (x) => files[x] !== undefined,
    );
    if (k === undefined) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {
      "content-type": k.endsWith(".css")
        ? "text/css"
        : k.endsWith(".js")
          ? "text/javascript"
          : k.endsWith(".svg")
            ? "image/svg+xml"
            : "text/html; charset=utf-8",
    });
    res.end(files[k]);
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const row = {
    key: c.key,
    direction: d.name,
    pages: 0,
    overflow: [],
    broken: [],
    consoleErrors: [],
    axe: [],
    formOnContact: false,
    htmlKbMax: 0,
    totalKb: Math.round(
      Object.values(files).reduce((n, f) => n + Buffer.byteLength(f), 0) / 1024,
    ),
  };
  for (const [label, vp, mobile] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["phone", { width: 390, height: 844 }, true],
  ]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile });
    for (const f of Object.keys(files).filter((k) => k.endsWith(".html"))) {
      row.htmlKbMax = Math.max(
        row.htmlKbMax,
        Math.round(Buffer.byteLength(files[f]) / 1024),
      );
      const page = await ctx.newPage();
      page.on("console", (m) => {
        if (
          m.type() === "error" &&
          !/Failed to load resource.*(kora\.example)/.test(m.text())
        )
          row.consoleErrors.push(`${label}:${f}:${m.text().slice(0, 80)}`);
      });
      await page.goto(base + "/" + (f === "index.html" ? "" : f), {
        waitUntil: "networkidle",
      });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        broken: [...document.images]
          .filter((i) => i.naturalWidth === 0)
          .map((i) => i.src.slice(-50)),
        form: !!document.querySelector("form"),
      }));
      if (label === "desktop") row.pages++;
      if (m.sw > m.cw + 1) row.overflow.push(`${label}:${f}`);
      row.broken.push(...m.broken.map((b) => `${label}:${f}:${b}`));
      if (f.startsWith("contact") && m.form) row.formOnContact = true;
      const ax = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      for (const v of ax.violations.filter((x) =>
        ["serious", "critical"].includes(x.impact),
      ))
        row.axe.push(`${label}:${f}:${v.id}(${v.nodes.length})`);
      await page.close();
    }
    await ctx.close();
  }
  server.close();
  rows.push(row);
  process.stderr.write(
    `${c.key}: pages=${row.pages} overflow=${row.overflow.length} broken=${row.broken.length} axe=${row.axe.length} console=${row.consoleErrors.length}\n`,
  );
}
await browser.close();
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
