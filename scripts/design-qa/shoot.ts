/* Serves rendered fixtures (with bundled fonts at /_kora/fonts/) and screenshots them. */
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, extname, resolve } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url ?? __filename)("playwright");

const root = resolve(process.argv[2] ?? "out/design-qa");
const shots = resolve(process.argv[3] ?? join(root, "..", "design-qa-shots"));
const only = process.argv[4]; // optional fixture key
const fontDir = resolve("packages/site-fonts/files");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
  let file = url.startsWith("/_kora/fonts/")
    ? join(fontDir, url.slice(13))
    : join(root, url);
  if (existsSync(file) && statSync(file).isDirectory())
    file = join(file, "index.html");
  if (
    (!file.startsWith(root) && !file.startsWith(fontDir)) ||
    !existsSync(file)
  ) {
    res.writeHead(404).end("nf");
    return;
  }
  res
    .writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    })
    .end(readFileSync(file));
});
async function main() {
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  const sizes = [
    ["desktop", 1440, 900],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const;
  for (const key of readdirSync(root).filter(
    (k) =>
      statSync(join(root, k)).isDirectory() &&
      (!only || only.split(",").includes(k)),
  )) {
    for (const d of ["0", "1", "2"]) {
      for (const [name, w, h] of sizes) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: h },
          reducedMotion: "reduce",
        });
        const page = await ctx.newPage();
        await page.goto(`http://localhost:${port}/${key}/${d}/`, {
          waitUntil: "networkidle",
        });
        await page.evaluate(() => document.fonts.ready);
        mkdirSync(join(shots, key), { recursive: true });
        await page.screenshot({
          path: join(shots, key, `${d}-${name}.png`),
          fullPage: true,
        });
        await ctx.close();
      }
    }
  }
  await browser.close();
  server.close();
  console.log("shots in", shots);
}
void main();
