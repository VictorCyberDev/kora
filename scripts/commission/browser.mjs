// Browser checks of generated, published sites against the running Site Host, in real Chromium at desktop and phone size.
//   node scripts/commission/browser.mjs <outDir> <journeys-state.json> <apiUrl> <hostUrl>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { repo, client, recorder, png } from "./lib.mjs";

const [outDir, stateFile, apiUrl, hostUrl] = process.argv.slice(2);
const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const st = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const shots = path.join(outDir, "screens");
fs.mkdirSync(shots, { recursive: true });
const R = recorder(outDir);
R.setPhase("6b browser checks of published sites (Site Host, real Chromium)");
const { step } = R;

const browser = await chromium.launch();
const sizes = [
  ["desktop", { width: 1280, height: 800 }, false],
  ["phone", { width: 390, height: 844 }, true],
];
for (const [key, url] of Object.entries(st.urls)) {
  const home = await (await fetch(url)).text();
  const links = [
    ...new Set(
      [...home.matchAll(/<ul class="nav-d"[\s\S]*?<\/ul>/g)].flatMap((m) =>
        [...m[0].matchAll(/href="([^"]+)"/g)].map((x) => x[1]),
      ),
    ),
  ];
  const pages = ["", ...links.filter((l) => l !== "index.html")];
  for (const [label, vp, mobile] of sizes) {
    const ctx = await browser.newContext({
      viewport: vp,
      isMobile: mobile,
      deviceScaleFactor: 1,
    });
    const bad = { overflow: [], broken: [], console: [], axe: [], status: [] };
    // Stock pictures hotlink images.unsplash.com. The sandbox has no route to it and the picture ids come from a local fake,
    // so those requests are answered with a placeholder: a simulation, recorded as such in the step name below.
    await ctx.route("https://images.unsplash.com/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(png(40, 30, 3)),
      }),
    );
    for (const rel of pages) {
      const page = await ctx.newPage();
      page.on(
        "console",
        (m) => m.type() === "error" && bad.console.push(m.text().slice(0, 120)),
      );
      page.on("pageerror", (e) => bad.console.push(String(e).slice(0, 120)));
      const resp = await page.goto(url + rel, { waitUntil: "networkidle" });
      bad.status.push(resp?.status());
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
        window.scrollTo(0, 0);
        const imgs = [...document.images];
        imgs.forEach((i) => (i.loading = "eager"));
        await Promise.all(
          imgs.map((i) => (i.complete ? 0 : i.decode().catch(() => {}))),
        );
      });
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        broken: [...document.images]
          .filter((i) => i.naturalWidth === 0)
          .map((i) => i.src.slice(-50)),
      }));
      if (m.sw > m.cw + 1) bad.overflow.push(rel || "/");
      bad.broken.push(...m.broken);
      const ax = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      bad.axe.push(
        ...ax.violations
          .filter((v) => ["serious", "critical"].includes(v.impact))
          .map((v) => `${rel || "/"}:${v.id}`),
      );
      if (rel === "" || rel === pages[1])
        await page.screenshot({
          path: path.join(
            shots,
            `${key}-${label}-${(rel || "home").replace(/\W+/g, "_")}.jpg`,
          ),
          type: "jpeg",
          quality: 70,
          fullPage: true,
        });
      await page.close();
    }
    step(
      `${key} on ${label}: ${pages.length} pages load (200), no overflow, no broken images, no console errors, no serious axe violations (hotlinked stock images are answered by a local placeholder)`,
      bad.status.every((s) => s === 200) &&
        !bad.overflow.length &&
        !bad.broken.length &&
        !bad.console.length &&
        !bad.axe.length,
      JSON.stringify({
        status: [...new Set(bad.status)],
        overflow: bad.overflow,
        broken: bad.broken.slice(0, 2),
        console: bad.console.slice(0, 2),
        axe: bad.axe.slice(0, 3),
      }),
    );
    await ctx.close();
  }
}

// a real enquiry typed into the published bakery contact form, in the browser
{
  const url = st.urls.bakery;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto(url + "contact/", { waitUntil: "networkidle" });
  const stamp = `Browser enquiry ${Date.now()}`;
  const form = page.locator("form").first();
  await form.getByLabel(/name/i).first().fill("Browser Visitor");
  const phone = form.getByLabel(/phone/i);
  if (await phone.count()) await phone.first().fill("08099998888");
  await form.locator("textarea").fill(stamp);
  const posted = page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/public/sites/") &&
        r.request().method() === "POST",
      { timeout: 10_000 },
    )
    .catch(() => null);
  await form.locator("button[type=submit], button:not([type])").first().click();
  const resp = await posted;
  step(
    "contact form typed and submitted in a phone browser: the public endpoint answers 201",
    resp?.status() === 201,
    String(resp?.status()),
  );
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(shots, "bakery-phone-form-submitted.jpg"),
    type: "jpeg",
    quality: 70,
  });
  const c = client(apiUrl);
  await c.call("POST", "/api/auth/login", {
    email: st.A.email,
    password: "correct horse battery",
  });
  const inbox =
    (await c.call("GET", `/api/sites/${st.siteIds.bakery}/forms`)).json?.data ??
    [];
  step(
    "that enquiry appears in the owner's inbox",
    inbox.some((s) => JSON.stringify(s).includes(stamp)),
    `${inbox.length} items`,
  );
  await ctx.close();
}
await browser.close();
const failed = R.steps.filter((s) => !s.ok);
fs.writeFileSync(
  path.join(outDir, "browser-results.json"),
  JSON.stringify({ steps: R.steps }, null, 2),
);
console.log(`${R.steps.length} browser checks, ${failed.length} failed`);
R.close();
process.exitCode = failed.length ? 1 : 0;
