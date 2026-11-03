// Screenshots the Brand Center for an existing account on a running deployment (local rehearsal container, staging).
// usage: node v7-brand-center-shots.mjs <base> <email> <siteId> <outDir>   (password is the commissioning one)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("@playwright/test");
const [, , base, email, siteId, out] = process.argv;
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [name, vp] of [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const ctx = await b.newContext({
    viewport: vp,
    isMobile: name === "mobile",
    hasTouch: name === "mobile",
    deviceScaleFactor: 1,
  });
  const p = await ctx.newPage();
  const r = await ctx.request.post(`${base}/api/auth/login`, {
    headers: { "x-requested-with": "kora" },
    data: { email, password: "correct horse battery" },
  });
  if (!r.ok()) throw new Error("login failed " + r.status());
  await p.goto(`${base}/app/sites/${siteId}/brand`, {
    waitUntil: "networkidle",
  });
  await p.waitForSelector("text=Brand system");
  await p.screenshot({
    path: `${out}/brand-center-${name}.png`,
    fullPage: true,
  });
  console.log(
    name,
    "ok",
    await p.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  );
  await ctx.close();
}
await b.close();
