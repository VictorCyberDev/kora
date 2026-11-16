import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { observeRenderedScreenshot } from "./visual-observe";
import { reviewRenderedWithVision } from "./vision-critic";
import type { SiteSpecV3 } from "../packages/site-schema/src/v3/spec.js";

/** Actual published-renderer benchmark, not screenshots of a mock template. */
const root = resolve(__dirname, "..");
const mediaDir = join(root, "packages/site-media/files");
const fontDir = join(root, "packages/site-fonts/files");
const mime: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const briefs = [
  [
    "bakery",
    "Aster Breadhouse",
    "We make artisan sourdough bread, celebration cakes and fresh pastry for local families.",
    ["Sourdough bread", "Celebration cakes", "Pastries"],
  ],
  [
    "fashion",
    "Atelier Nova",
    "We design contemporary clothing, tailored pieces and carefully made fashion accessories.",
    ["Clothing", "Tailoring", "Accessories"],
  ],
  [
    "restaurant",
    "Terrace Table",
    "Our restaurant serves modern seasonal meals, lunch menus and freshly prepared dinner.",
    ["Lunch", "Dinner", "Seasonal menu"],
  ],
  [
    "law",
    "Harbor Legal",
    "We advise clients on business agreements, property matters and dispute resolution.",
    ["Contracts", "Property", "Disputes"],
  ],
  [
    "beauty",
    "Velvet Studio",
    "We provide hair styling, makeup services and nail care for our clients.",
    ["Hair styling", "Makeup", "Nail care"],
  ],
  [
    "realestate",
    "Northline Homes",
    "We help clients explore residential property listings and schedule viewing enquiries.",
    ["Property listings", "Viewing enquiries", "Property advice"],
  ],
  [
    "creative",
    "Kochab Works",
    "We create motion graphics, brand systems and digital design for growing businesses.",
    ["Motion design", "Brand identity", "Digital design"],
  ],
  [
    "technology",
    "Meridian Cloud",
    "We build business software, APIs and integrated web applications.",
    ["Web applications", "API development", "Integrations"],
  ],
  [
    "repair",
    "Renew Repair",
    "We repair laptops, mobile phones and business computer equipment.",
    ["Laptop repair", "Phone repair", "Computer support"],
  ],
  [
    "fitness",
    "Pulse Movement",
    "We teach functional movement classes, strength sessions and personal training.",
    "Strength classes,Personal training,Movement sessions".split(","),
  ],
  [
    "health",
    "North Point Clinic",
    "We provide primary care consultations, preventative checkups and general medical guidance.",
    "Consultations,Wellness checkups,Primary care".split(","),
  ],
  [
    "education",
    "Bright Path Academy",
    "We teach learners in small group classes, hands-on workshops and tutoring sessions.",
    "Group classes,Workshops,Tutoring".split(","),
  ],
  [
    "homeservices",
    "Lumen Home Care",
    "We maintain and clean homes, offer deep cleaning and scheduled property upkeep.",
    "Home cleaning,Deep cleaning,Property upkeep".split(","),
  ],
  [
    "photography",
    "Luma Portraits",
    "We photograph portraits, brand campaigns and special events for clients.",
    "Portrait sessions,Brand photography,Event photography".split(","),
  ],
  [
    "travel",
    "Open Atlas Tours",
    "We plan guided cultural tours and personal travel itineraries for visiting guests.",
    "Guided tours,Trip planning,Travel itineraries".split(","),
  ],
  [
    "nonprofit",
    "Grow Together Foundation",
    "We coordinate community education workshops and local volunteer programmes.",
    "Workshops,Volunteering,Community programs".split(","),
  ],
  [
    "architecture",
    "Formline Practice",
    "We design residential architecture, interior spaces and building renovation concepts.",
    "Architecture,Interiors,Renovation".split(","),
  ],
  [
    "portfolio",
    "Amina Creates",
    "I produce editorial illustrations, web design work and visual identity projects for clients.",
    "Illustration,Branding,Web design".split(","),
  ],
  [
    "consulting",
    "Northstar Advisory",
    "We advise organizations on operations improvement, leadership development and strategic planning.",
    "Operations,Leadership,Strategy".split(","),
  ],
  [
    "hotel",
    "The Fern House",
    "Our boutique hotel offers accommodation, guest enquiries and local travel assistance.",
    ["Guest rooms", "Guest enquiries", "Local assistance"],
  ],
] as const;
let server: Server;
let origin = "";
let samples: Array<{
  key: string;
  files: Record<string, string>;
  pageCount: number;
  spec: SiteSpecV3;
}> = [];
let studioSchema: typeof import("../packages/site-schema/src/index.js");
test.beforeAll(async () => {
  const schema = (await import(
    pathToFileURL(join(root, "packages/site-schema/dist/src/index.js")).href
  )) as typeof import("../packages/site-schema/src/index.js");
  studioSchema = schema;
  samples = briefs.map(([key, name, description, services]) => {
    const input = {
      name,
      description,
      industry: key,
      services: [...services],
      email: "test@example.com",
    };
    const direction = schema.planDirectionsV3(input).directions[0]!;
    const files = schema.renderSiteV3(direction.spec, {
      formEndpoint: "https://forms.example.test/submit",
    });
    return {
      key,
      files,
      pageCount: direction.spec.pages.length,
      spec: direction.spec,
    };
  });
  server = createServer((req, res) => {
    const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    for (const [prefix, dir, ct] of [
      ["/_kora/media/", mediaDir, "image/webp"],
      ["/_kora/fonts/", fontDir, "font/woff2"],
    ])
      if (pathname.startsWith(prefix)) {
        const filename = pathname.slice(prefix.length);
        if (!/^[a-z0-9._-]+$/.test(filename)) {
          res.writeHead(400).end();
          return;
        }
        const file = join(dir, filename);
        if (existsSync(file)) {
          res.writeHead(200, { "content-type": ct }).end(readFileSync(file));
          return;
        }
      }
    const match = /^\/([a-z]+)\/(.*)$/.exec(pathname);
    const sample = samples.find((x) => x.key === match?.[1]);
    const path = !match?.[2]
      ? "index.html"
      : match[2].endsWith("/")
        ? match[2] + "index.html"
        : match[2];
    const body = sample?.files[path ?? ""];
    if (body === undefined) {
      res.writeHead(404).end("missing");
      return;
    }
    res
      .writeHead(200, { "content-type": mime[extname(path)] ?? "text/plain" })
      .end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("20 industries have real rendered desktop/mobile screenshots, navigation and layout checks", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync("test-results/kora-studio-benchmark", { recursive: true });
  expect(samples).toHaveLength(20);
  const reports: Array<{
    industry: string;
    device: string;
    observations: unknown;
    findings: unknown;
    revisions: string[];
    accepted: boolean;
  }> = [];
  for (const item of samples) {
    expect(item.pageCount).toBeGreaterThanOrEqual(1);
    expect(item.pageCount).toBeLessThanOrEqual(7);
    for (const [device, width] of [
      ["desktop", 1440],
      ["mobile", 390],
    ] as const) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      const response = await page.goto(`${origin}/${item.key}/`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.locator("h1").count()).toBe(1);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      const shotPath = `test-results/kora-studio-benchmark/${item.key}-${device}.png`;
      await page.screenshot({
        path: shotPath,
        fullPage: true,
        animations: "disabled",
      });
      let observation = await observeRenderedScreenshot(page, "home", device);
      let findings = studioSchema.reviewScreenshot(observation);
      const revisions: string[] = [];
      // Bounded, screenshot-driven repair: rerender and inspect real pixels again.
      // An unverified proposal is never described as a successful fix.
      for (
        let attempt = 0;
        attempt < studioSchema.MAX_VISUAL_REVISIONS;
        attempt++
      ) {
        if (!findings.some((x) => x.autoRepairable)) break;
        const change = studioSchema.proposeVisualRevision(
          item.spec,
          observation,
          attempt,
        );
        if (!change.applied.length) break;
        item.spec = change.spec;
        item.files = studioSchema.renderSiteV3(item.spec, {
          formEndpoint: "https://forms.example.test/submit",
        });
        revisions.push(...change.applied);
        await page.reload({ waitUntil: "domcontentloaded" });
        observation = await observeRenderedScreenshot(page, "home", device);
        findings = studioSchema.reviewScreenshot(observation);
        await page.screenshot({
          path: `test-results/kora-studio-benchmark/${item.key}-${device}-revised-${attempt + 1}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
      const gate = studioSchema.screenshotGate([observation]);
      const vision = await reviewRenderedWithVision(
        await page.screenshot({clip:{x:0,y:0,width,height:800},animations:"disabled"}),
        {industry:item.key,device},
      );
      reports.push({
        vision,
        industry: item.key,
        device,
        observations: observation,
        findings,
        revisions,
        accepted: gate.ok,
      });
      expect(gate.ok, JSON.stringify(findings)).toBe(true);
      await ctx.close();
    }
  }
  writeFileSync(
    "test-results/kora-studio-benchmark/visual-review.json",
    JSON.stringify(reports, null, 2),
  );
});
