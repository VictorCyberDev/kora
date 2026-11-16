import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

/** Actual published-renderer benchmark, not screenshots of a mock template. */
const root = resolve(__dirname, "..");
const mediaDir = join(root, "packages/site-media/files");
const fontDir = join(root, "packages/site-fonts/files");
const mime: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp",
};
const briefs = [
  ["bakery", "Aster Breadhouse", "We make artisan sourdough bread, celebration cakes and fresh pastry for local families.", ["Sourdough bread", "Celebration cakes", "Pastries"]],
  ["fashion", "Atelier Nova", "We design contemporary clothing, tailored pieces and carefully made fashion accessories.", ["Clothing", "Tailoring", "Accessories"]],
  ["restaurant", "Terrace Table", "Our restaurant serves modern seasonal meals, lunch menus and freshly prepared dinner.", ["Lunch", "Dinner", "Seasonal menu"]],
  ["law", "Harbor Legal", "We advise clients on business agreements, property matters and dispute resolution.", ["Contracts", "Property", "Disputes"]],
  ["beauty", "Velvet Studio", "We provide hair styling, makeup services and nail care for our clients.", ["Hair styling", "Makeup", "Nail care"]],
  ["realestate", "Northline Homes", "We help clients explore residential property listings and schedule viewing enquiries.", ["Property listings", "Viewing enquiries", "Property advice"]],
  ["creative", "Kochab Works", "We create motion graphics, brand systems and digital design for growing businesses.", ["Motion design", "Brand identity", "Digital design"]],
  ["technology", "Meridian Cloud", "We build business software, APIs and integrated web applications.", ["Web applications", "API development", "Integrations"]],
  ["repair", "Renew Repair", "We repair laptops, mobile phones and business computer equipment.", ["Laptop repair", "Phone repair", "Computer support"]],
  ["hotel", "The Fern House", "Our boutique hotel offers accommodation, guest enquiries and local travel assistance.", ["Guest rooms", "Guest enquiries", "Local assistance"]],
] as const;
let server: Server;
let origin = "";
let samples: Array<{key:string; files:Record<string,string>; pageCount:number}> = [];
test.beforeAll(async () => {
  const schema = (await import(
    pathToFileURL(join(root, "packages/site-schema/dist/src/index.js")).href
  )) as typeof import("../packages/site-schema/src/index.js");
  samples = briefs.map(([key,name,description,services]) => {
    const input = {name, description, industry:key, services:[...services], email:"test@example.com"};
    const direction = schema.planDirectionsV3(input).directions[0]!;
    const files = schema.renderSiteV3(direction.spec, {
      formEndpoint: "https://forms.example.test/submit",
    });
    return {key,files,pageCount:direction.spec.pages.length};
  });
  server = createServer((req,res) => {
    const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    for (const [prefix,dir,ct] of [
      ["/_kora/media/",mediaDir,"image/webp"],
      ["/_kora/fonts/",fontDir,"font/woff2"],
    ]) if(pathname.startsWith(prefix)){
      const filename = pathname.slice(prefix.length);
      if (!/^[a-z0-9._-]+$/.test(filename)) {res.writeHead(400).end();return;}
      const file = join(dir,filename);
      if(existsSync(file)) {res.writeHead(200,{"content-type":ct}).end(readFileSync(file));return;}
    }
    const match = /^\/([a-z]+)\/(.*)$/.exec(pathname);
    const sample = samples.find(x=>x.key===match?.[1]);
    const path = !match?.[2]?"index.html":match[2].endsWith("/") ? match[2]+"index.html":match[2];
    const body = sample?.files[path ?? ""];
    if(body === undefined){res.writeHead(404).end("missing");return;}
    res.writeHead(200,{"content-type":mime[extname(path)]??"text/plain"}).end(body);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});

test("10 industries have real rendered desktop/mobile screenshots, navigation and layout checks", async ({browser}) => {
  test.setTimeout(240_000);
  mkdirSync("test-results/kora-studio-benchmark", {recursive:true});
  expect(samples).toHaveLength(10);
  for(const item of samples) {
    expect(item.pageCount).toBeGreaterThanOrEqual(1);
    expect(item.pageCount).toBeLessThanOrEqual(7);
    for(const [device,width] of [["desktop",1440],["mobile",390]] as const) {
      const ctx = await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"});
      const page = await ctx.newPage();
      const response = await page.goto(`${origin}/${item.key}/`,{waitUntil:"domcontentloaded"});
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.locator("h1").count()).toBe(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({path:`test-results/kora-studio-benchmark/${item.key}-${device}.png`,fullPage:true,animations:"disabled"});
      await ctx.close();
    }
  }
});
