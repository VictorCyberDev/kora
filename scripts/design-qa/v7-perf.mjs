// Throttled-network performance of rendered golden sites: LCP, CLS, transfer weight, requests, fonts.
// usage: node v7-perf.mjs <goldDir> [idFilterRegex] ; env IDX=0 ; PROFILE=slow4g|fast3g
// Honest scope: lab measurement in Chromium with emulated network/CPU, not field data from real devices.
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const { chromium } = req("@playwright/test");
const root = process.argv[2] ?? "/var/tmp/gold";
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const PROFILES = {
  slow4g: {
    latency: 150,
    down: (1.6 * 1024 * 1024) / 8,
    up: (750 * 1024) / 8,
    cpu: 4,
  },
  fast3g: {
    latency: 300,
    down: (1.0 * 1024 * 1024) / 8,
    up: (500 * 1024) / 8,
    cpu: 4,
  },
};
const P = PROFILES[process.env.PROFILE ?? "slow4g"];
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const srv = createServer((r, res) => {
  const u = decodeURIComponent((r.url ?? "/").split("?")[0]);
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
  // long-lived caching for fonts and pictures, as the real host serves them
  const immutable = /^\/_kora\//.test(u);
  res.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
    ...(immutable
      ? { "cache-control": "public, max-age=31536000, immutable" }
      : {}),
  });
  res.end(readFileSync(file));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const browser = await chromium.launch();
const ids = readdirSync(root).filter(
  (d) => d !== "index.json" && (!filter || filter.test(d)),
);
const rows = [];
for (const id of ids)
  for (const idx of (process.env.IDX ?? "0").split(",").map(Number)) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: P.latency,
      downloadThroughput: P.down,
      uploadThroughput: P.up,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
    let bytes = 0,
      reqs = 0;
    const by = { html: 0, css: 0, font: 0, image: 0, other: 0 };
    cdp.on("Network.loadingFinished", (e) => {
      bytes += e.encodedDataLength;
      reqs++;
    });
    cdp.on("Network.responseReceived", (e) => {
      e.__t = e.type;
    });
    const sizes = new Map();
    cdp.on("Network.responseReceived", (e) => sizes.set(e.requestId, e.type));
    cdp.on("Network.loadingFinished", (e) => {
      const t = sizes.get(e.requestId);
      const k =
        t === "Document"
          ? "html"
          : t === "Stylesheet"
            ? "css"
            : t === "Font"
              ? "font"
              : t === "Image"
                ? "image"
                : "other";
      by[k] += e.encodedDataLength;
    });
    await page.addInitScript(() => {
      window.__lcp = 0;
      window.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    const t0 = Date.now();
    await page.goto(`http://localhost:${port}/s/${id}/${idx}/`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({
      lcp: Math.round(window.__lcp),
      cls: Math.round(window.__cls * 1000) / 1000,
      fcp: Math.round(
        performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
          0,
      ),
    }));
    rows.push({
      id,
      idx,
      ...m,
      loadMs: Date.now() - t0,
      kb: Math.round(bytes / 1024),
      requests: reqs,
      kbBy: Object.fromEntries(
        Object.entries(by).map(([k, v]) => [k, Math.round(v / 1024)]),
      ),
    });
    await ctx.close();
  }
await browser.close();
srv.close();
writeFileSync(
  process.env.OUT ?? "/var/tmp/perf.json",
  JSON.stringify({ profile: process.env.PROFILE ?? "slow4g", rows }, null, 1),
);
const f = (x) => String(x).padStart(6);
console.log(
  "id".padEnd(14),
  "dir",
  f("FCP"),
  f("LCP"),
  f("CLS"),
  f("KB"),
  f("reqs"),
  "  html css font image",
);
for (const r of rows)
  console.log(
    r.id.padEnd(14),
    String(r.idx).padStart(3),
    f(r.fcp),
    f(r.lcp),
    f(r.cls),
    f(r.kb),
    f(r.requests),
    "  ",
    Object.values(r.kbBy).join(" "),
  );
const lcps = rows.map((r) => r.lcp).sort((a, b) => a - b);
console.log(
  "median LCP",
  lcps[Math.floor(lcps.length / 2)],
  "max",
  lcps.at(-1),
  "; max CLS",
  Math.max(...rows.map((r) => r.cls)),
);
