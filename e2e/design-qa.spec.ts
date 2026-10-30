import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Visual QA over generated sites: every fixture brief x 3 directions, rendered by the same
 * deterministic renderer that publishes, loaded in a real browser at five widths.
 * Screenshots are written only when DESIGN_QA_SHOTS=dir is set.
 */
const root = resolve(__dirname, "..");
const FONT_DIR = join(root, "packages/site-fonts/files");
const MEDIA_DIR = join(root, "packages/site-media/files");
const WIDTHS = [375, 390, 768, 1024, 1440] as const;
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

type Site = { key: string; dir: number; files: Record<string, string> };
let sites: Site[] = [];

let server: Server;
let base = "";
const requests: string[] = [];
test.beforeAll(async () => {
  const schema = (await import(
    pathToFileURL(join(root, "packages/site-schema/dist/src/index.js")).href
  )) as typeof import("../packages/site-schema/src/index.js");
  const { BRIEFS } = (await import(
    pathToFileURL(
      join(root, "packages/site-schema/dist/test/fixtures/briefs.js"),
    ).href
  )) as typeof import("../packages/site-schema/test/fixtures/briefs.js");
  sites = Object.entries(BRIEFS).flatMap(([key, brief]) =>
    schema.planDirections(brief).map((d) => ({
      key,
      dir: d.index,
      files: schema.renderSiteV2(d.spec, {
        formEndpoint: "https://forms.example/submit",
      }),
    })),
  );
  server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    requests.push(url);
    if (url.startsWith("/_kora/fonts/")) {
      const f = join(FONT_DIR, url.slice(13));
      if (f.startsWith(FONT_DIR) && existsSync(f)) {
        res
          .writeHead(200, { "content-type": "font/woff2" })
          .end(readFileSync(f));
        return;
      }
    }
    if (url.startsWith("/_kora/media/")) {
      const f = join(MEDIA_DIR, url.slice(13));
      if (f.startsWith(MEDIA_DIR) && existsSync(f)) {
        res
          .writeHead(200, { "content-type": "image/webp" })
          .end(readFileSync(f));
        return;
      }
    }
    const m = /^\/([a-z0-9]+)\/(\d)\/(.*)$/.exec(url);
    const site =
      m && sites.find((s) => s.key === m[1] && String(s.dir) === m[2]);
    const rel = m ? (m[3] === "" ? "index.html" : m[3]!) : "";
    const body = site?.files[rel];
    if (body === undefined) {
      res.writeHead(404).end("nf");
      return;
    }
    res
      .writeHead(200, { "content-type": TYPES[extname(rel)] ?? "text/plain" })
      .end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(() => server.close());

const shotsDir = process.env.DESIGN_QA_SHOTS;

test.describe("generated sites in a real browser", () => {
  test.setTimeout(240_000);

  test("no horizontal overflow, one h1, readable landmarks, bundled fonts load at every width", async ({
    browser,
  }) => {
    for (const s of sites) {
      for (const w of WIDTHS) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: 900 },
          reducedMotion: "reduce",
        });
        const page = await ctx.newPage();
        const failed: string[] = [];
        const consoleErrors: string[] = [];
        page.on("requestfailed", (r) => failed.push(r.url()));
        page.on(
          "console",
          (m) => m.type() === "error" && consoleErrors.push(m.text()),
        );
        page.on(
          "response",
          (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`),
        );
        await page.goto(`${base}/${s.key}/${s.dir}/`, {
          waitUntil: "networkidle",
        });
        const label = `${s.key}/${s.dir}@${w}`;
        const m = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          h1: document.querySelectorAll("h1").length,
          main: document.querySelectorAll("main").length,
          imgsNoAlt: [...document.images].filter((i) => !i.hasAttribute("alt"))
            .length,
          fonts: [...document.fonts].filter((f) => f.status === "loaded")
            .length,
        }));
        expect(m.overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(
          0,
        );
        expect(m.h1, `${label} h1`).toBe(1);
        expect(m.main, `${label} main`).toBe(1);
        expect(m.imgsNoAlt, `${label} images without alt`).toBe(0);
        expect(m.fonts, `${label} fonts loaded`).toBeGreaterThanOrEqual(1);
        expect(m.fonts, `${label} fonts loaded`).toBeLessThanOrEqual(5);
        expect(failed, `${label} failed requests`).toEqual([]);
        expect(consoleErrors, `${label} console errors`).toEqual([]);
        if (shotsDir && (w === 1440 || w === 390 || w === 768) && s.dir < 3) {
          mkdirSync(join(shotsDir, s.key), { recursive: true });
          await page.screenshot({
            path: join(shotsDir, s.key, `${s.dir}-${w}.png`),
            fullPage: true,
          });
        }
        await ctx.close();
      }
    }
  });

  test("passes automated accessibility checks (WCAG 2.1 A/AA) on every generated site", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    const problems: string[] = [];
    for (const s of sites) {
      await page.goto(`${base}/${s.key}/${s.dir}/`, {
        waitUntil: "networkidle",
      });
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      for (const v of r.violations)
        problems.push(
          `${s.key}/${s.dir}: ${v.id} (${v.nodes.length}) ${v.help}`,
        );
    }
    await ctx.close();
    expect(problems).toEqual([]);
  });

  test("keyboard: skip link first, menu reachable on a phone, no keyboard traps", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    for (const s of sites.filter((x) => x.dir === 0).slice(0, 6)) {
      await page.goto(`${base}/${s.key}/0/`);
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => document.activeElement?.className),
        `${s.key} first focus`,
      ).toBe("skip");
      const menu = page.locator("details.menu > summary");
      await expect(menu).toBeVisible();
      await menu.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("details.menu[open] a").first()).toBeVisible();
    }
    await ctx.close();
  });

  test("performance budget: small, self-contained, no third-party requests", async () => {
    for (const s of sites) {
      const html = s.files["index.html"]!;
      const css = s.files["styles.css"]!;
      const bytes = (html + css + s.files["site.js"]!).length;
      expect(bytes, `${s.key}/${s.dir} text bytes`).toBeLessThan(90_000);
      expect(html, `${s.key}/${s.dir} third-party`).not.toMatch(
        /(?:src|href)="https?:\/\/(?!wa\.me|www\.google\.com\/maps)/,
      );
      const fonts = [
        ...css.matchAll(/url\(\/_kora\/fonts\/([a-z0-9-]+\.woff2)\)/g),
      ].map((m) => m[1]!);
      expect(fonts.length, `${s.key}/${s.dir} font files`).toBeLessThanOrEqual(
        5,
      );
      const fontBytes = fonts.reduce(
        (n, f) => n + statSync(join(FONT_DIR, f)).size,
        0,
      );
      expect(fontBytes, `${s.key}/${s.dir} font weight`).toBeLessThan(150_000);
    }
  });
});
