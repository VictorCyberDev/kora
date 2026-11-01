// Phase 0 audit: measurable facts for the fixture sites (first screen + first scroll, H1, weight, fonts, repeated imagery).
import { createServer } from "node:http";
import {
  existsSync,
  readFileSync,
  statSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve("out/design-qa");
const fonts = resolve("packages/site-fonts/files");
const media = resolve("packages/site-media/files");
const T = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  let f = u.startsWith("/_kora/fonts/")
    ? join(fonts, u.slice(13))
    : u.startsWith("/_kora/media/")
      ? join(media, u.slice(13))
      : join(root, u);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) return res.writeHead(404).end();
  res
    .writeHead(200, {
      "content-type": T[extname(f)] ?? "application/octet-stream",
    })
    .end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const b = await chromium.launch();
const rows = [];
for (const key of ["restaurant", "bakery", "fine"])
  for (const d of ["0", "1", "2"]) {
    const ctx = await b.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const p = await ctx.newPage();
    const bytes = [];
    p.on("response", async (r) => {
      try {
        bytes.push([r.url(), (await r.body()).length]);
      } catch {
        /* aborted */
      }
    });
    await p.goto(`http://localhost:${port}/${key}/${d}/`, {
      waitUntil: "networkidle",
    });
    const m = await p.evaluate(() => {
      const fold = window.innerHeight * 2; // first screen + first scroll
      const imgs = [...document.querySelectorAll("img")].filter(
        (i) =>
          i.getBoundingClientRect().top < fold &&
          i.getBoundingClientRect().width > 120,
      );
      const art = [...document.querySelectorAll("svg")].filter(
        (s) =>
          s.getBoundingClientRect().top < fold &&
          s.getBoundingClientRect().width > 120 &&
          !s.closest("a,button"),
      );
      const h1 = document.querySelector("h1");
      const fs = parseFloat(getComputedStyle(h1).fontSize);
      const sections = [
        ...document.querySelectorAll("main > section, main > div"),
      ].map((s) => (s.querySelector("h2")?.textContent ?? "").trim());
      return {
        photosInFirstTwoScreens: imgs.length,
        vectorArtInFirstTwoScreens: art.length,
        h1px: fs,
        h1VsViewport: +((fs / window.innerWidth) * 100).toFixed(2),
        sections,
      };
    });
    const total = bytes.reduce((n, [, s]) => n + s, 0);
    const fontBytes = bytes
      .filter(([u]) => u.endsWith(".woff2"))
      .reduce((n, [, s]) => n + s, 0);
    const fontFiles = bytes.filter(([u]) => u.endsWith(".woff2")).length;
    const imgBytes = bytes
      .filter(([u]) => u.endsWith(".webp"))
      .reduce((n, [, s]) => n + s, 0);
    rows.push({
      key,
      d,
      ...m,
      totalKB: +(total / 1024).toFixed(0),
      fontFiles,
      fontKB: +(fontBytes / 1024).toFixed(0),
      imageKB: +(imgBytes / 1024).toFixed(0),
    });
    await ctx.close();
  }
await b.close();
server.close();
const md = [
  "| fixture | dir | photos in first 2 screens | vector art in first 2 screens | H1 px | H1 as % of width | total KB | font files | font KB | image KB |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.key} | ${r.d} | ${r.photosInFirstTwoScreens} | ${r.vectorArtInFirstTwoScreens} | ${r.h1px} | ${r.h1VsViewport} | ${r.totalKB} | ${r.fontFiles} | ${r.fontKB} | ${r.imageKB} |`,
  ),
  "",
  "Section headings (h2) per fixture, direction 0:",
  ...rows
    .filter((r) => r.d === "0")
    .map((r) => `- ${r.key}: ${r.sections.join(" / ")}`),
].join("\n");
writeFileSync("docs/design/audit-before/measurements.md", md + "\n");
console.log(md);
