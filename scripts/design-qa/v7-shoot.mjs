// Serves rendered golden sites with the real font/media routes and captures browser screenshots + layout metrics.
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const { chromium } = req("@playwright/test");
const AxeBuilder =
  req("@axe-core/playwright").default ?? req("@axe-core/playwright");

const root = process.argv[2] ?? "/var/tmp/gold";
const out = process.argv[3] ?? "/var/tmp/shots";
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null;
const widths = (process.argv[5] ?? "390,1280").split(",").map(Number);
mkdirSync(out, { recursive: true });
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const srv = createServer((req, res) => {
  const u = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const m = /^\/s\/([^/]+)\/(\d)(\/.*)?$/.exec(u);
  let file;
  if (u.startsWith("/_kora/fonts/"))
    file = join("packages/site-fonts/files", u.slice(13));
  else if (u.startsWith("/_kora/media/"))
    file = join("packages/site-media/files", u.slice(13));
  else if (m) {
    file = join(root, m[1], m[2], m[3] ?? "/");
    if (file.endsWith("/")) file += "index.html";
    else if (!extname(file)) file += "/index.html";
  }
  if (!file || !existsSync(file)) {
    res.writeHead(404);
    return res.end("nf");
  }
  res.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
  });
  res.end(readFileSync(file));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const browser = await chromium.launch();
const report = [];
const ids = readdirSync(root).filter(
  (d) => d !== "index.json" && (!filter || filter.test(d)),
);
for (const id of ids)
  for (const idx of [0, 1, 2])
    for (const w of widths) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: w < 600 ? 800 : 900 },
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("requestfailed", (r) => errors.push(`failed ${r.url()}`));
      await page.goto(`http://localhost:${port}/s/${id}/${idx}/`, {
        waitUntil: "networkidle",
      });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState("networkidle");
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        h: document.documentElement.scrollHeight,
        fonts: [...document.fonts]
          .filter((f) => f.status === "loaded")
          .map((f) => f.family),
        offenders: [...document.querySelectorAll("body *")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.right > document.documentElement.clientWidth + 2 &&
              r.width > 0 &&
              !e.closest(".tk,.cm,.rl,.hs,.gl,svg")
            );
          })
          .slice(0, 4)
          .map((e) => e.tagName + "." + e.className),
      }));
      await page.screenshot({
        path: join(out, `${id}-${idx}-${w}.png`),
        fullPage: true,
      });
      report.push({
        id,
        idx,
        w,
        overflow: m.sw > m.cw,
        sw: m.sw,
        h: m.h,
        offenders: m.offenders,
        axe: axe.violations.map(
          (v) =>
            `${v.id}:${v.nodes.length}${
              v.id === "color-contrast"
                ? " " +
                  v.nodes
                    .slice(0, 2)
                    .map(
                      (n) =>
                        (n.any[0]?.data?.fgColor ?? "") +
                        "/" +
                        (n.any[0]?.data?.bgColor ?? "") +
                        "@" +
                        (n.any[0]?.data?.contrastRatio ?? "") +
                        " " +
                        n.target.join(" ").slice(0, 60) +
                        (n.any[0]?.data?.contrastRatio ?? ""),
                    )
                    .join(";")
                : ""
            }`,
        ),
        errors: errors.filter((e) => !/favicon/.test(e)).slice(0, 3),
      });
      await ctx.close();
    }
await browser.close();
srv.close();
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.overflow || r.errors.length || r.axe.length);
console.log(`captured ${report.length}; problems ${bad.length}`);
for (const b of bad.slice(0, 20))
  console.log(
    b.id,
    b.idx,
    b.w,
    b.overflow ? `OVERFLOW ${b.sw}` : "",
    b.offenders.join(","),
    b.errors.join("|"),
    b.axe.join(" | "),
  );
