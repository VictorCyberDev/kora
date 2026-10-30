/* "Before" = the v1 renderer on the same brief; "after" = v2 direction 0. Both through a real browser. */
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve, extname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { BRIEFS } from "../../packages/site-schema/test/fixtures/briefs.js";
import {
  generateSpecFromBrief,
  planSite,
  renderSite,
  renderSiteV2,
} from "../../packages/site-schema/src/index.js";

const { chromium } = createRequire(__filename)("playwright");
const out = resolve(process.argv[2] ?? "out/before-after");
const keys = (
  process.argv[3] ?? "interior,repair,saas,restaurant,consultant"
).split(",");
const fontDir = resolve("packages/site-fonts/files");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const sites: Record<string, Record<string, string>> = {};
for (const k of keys) {
  const b = BRIEFS[k]!;
  sites[`${k}/before`] = renderSite(
    generateSpecFromBrief({
      name: b.name,
      description: b.description,
      ...(b.location ? { location: b.location } : {}),
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.whatsapp ? { whatsapp: b.whatsapp } : {}),
      ...(b.email ? { email: b.email } : {}),
      ...(b.hours ? { hours: b.hours } : {}),
    } as never),
  );
  sites[`${k}/after`] = renderSiteV2(planSite(b));
}
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
  if (url.startsWith("/_kora/fonts/")) {
    const f = join(fontDir, url.slice(13));
    if (existsSync(f))
      return void res
        .writeHead(200, { "content-type": "font/woff2" })
        .end(readFileSync(f));
  }
  const m = /^\/([a-z0-9]+\/(?:before|after))\/(.*)$/.exec(url);
  const rel = m ? m[2] || "index.html" : "";
  const body = m && sites[m[1]!]?.[rel];
  if (body === undefined || body === false)
    return void res.writeHead(404).end("nf");
  res
    .writeHead(200, { "content-type": TYPES[extname(rel)] ?? "text/plain" })
    .end(body);
});
void (async () => {
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  mkdirSync(out, { recursive: true });
  for (const k of keys)
    for (const v of ["before", "after"]) {
      for (const [name, w, h] of [
        ["desktop", 1440, 900],
        ["mobile", 390, 844],
      ] as const) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: h },
          reducedMotion: "reduce",
        });
        const page = await ctx.newPage();
        await page.goto(`http://localhost:${port}/${k}/${v}/`, {
          waitUntil: "networkidle",
        });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: join(out, `${k}-${v}-${name}.png`),
          fullPage: true,
        });
        await ctx.close();
      }
    }
  await browser.close();
  server.close();
  writeFileSync(join(out, "keys.json"), JSON.stringify(keys));
})();
