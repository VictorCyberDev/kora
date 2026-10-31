// Phase 0 audit: screenshots Kora's own app at 375/768/1440, light and dark. Starts the e2e server (needs DATABASE_URL).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const out = process.argv[2] ?? "docs/design/audit-before/app";
mkdirSync(out, { recursive: true });
const port = 3210;
const base = `http://127.0.0.1:${port}`;
const server = spawn("node", ["e2e/serve.mjs"], { stdio: "ignore", env: process.env });
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base + "/health")).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch();
const seed = await browser.newContext();
const page0 = await seed.newPage();
await page0.goto(base + "/signup");
await page0.getByLabel("Your name").fill("Audit");
await page0.getByLabel("Business name").fill("Crumb & Co");
await page0.getByLabel("Email").fill(`audit+${Date.now()}@example.com`);
await page0.getByLabel("Password").fill("correct horse battery");
await page0.getByRole("button", { name: "Create account" }).click();
await page0.waitForURL(/\/app/);
const api = seed.request;
const H = { "x-requested-with": "kora" };
const me = await (await api.get(base + "/api/auth/me")).json();
const orgId = me.data.orgs[0].id;
const site = (await (await api.post(base + "/api/sites", { headers: H, data: { orgId, name: "Crumb & Co" } })).json()).data;
const gen = (await (await api.post(`${base}/api/sites/${site.id}/generate`, { headers: H, data: { name: "Crumb & Co", description: "A neighbourhood bakery making bread and cakes daily. We bake sourdough, croissants, celebration cakes and cupcakes.", whatsapp: "+2348075550120", hours: [{ days: "Daily", hours: "7am - 7pm" }] } })).json()).data;
await api.post(`${base}/api/sites/${site.id}/versions/${gen.version.id}/publish`, { headers: H });
await api.post(`${base}/api/sites/${site.id}/presence/import`, { headers: H });
await api.post(`${base}/api/sites/${site.id}/brand-kit`, { headers: H, data: { from: "site" } });
const state = await seed.storageState();
await seed.close();
const pages = [["landing", "/"], ["dashboard", "/app"], ["presence", `/app/sites/${site.id}/presence`], ["create", `/app/sites/${site.id}/create`], ["calendar", `/app/sites/${site.id}/calendar`], ["today", `/app/sites/${site.id}/today`]];
for (const scheme of ["light", "dark"])
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, storageState: state, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    for (const [name, url] of pages) {
      await p.goto(base + url, { waitUntil: "networkidle" });
      await p.waitForTimeout(700);
      await p.screenshot({ path: `${out}/${name}-${w}-${scheme}.png`, fullPage: name === "landing" });
    }
    await ctx.close();
  }
await browser.close();
server.kill();
console.log("app shots in", out);
