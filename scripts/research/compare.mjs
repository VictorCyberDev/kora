// Measures Kora's own v3 output with the SAME instrument used on the studied sites, and prints both side by side.
import { readFileSync } from "node:fs";
const load = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.result === "ok");
const INTER = /just a moment|access denied|attention required|captcha|security check|verify you|forbidden|unusual traffic|pardon our|are you a robot/i;
const world = load("docs/research/data/site-observations-2026.jsonl").filter((r) => !INTER.test(`${r.desktop.title} ${r.desktop.type.h1?.text ?? ""}`) && r.desktop.page.links >= 8);
const kora = load("docs/research/data/kora-v3-observations.jsonl");
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const med = (xs) => { const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const m = (rows) => {
  const h = rows.map((r) => r.desktop.type.h1).filter(Boolean);
  const mob = rows.filter((r) => r.mobile);
  const rad = (r) => parseFloat(r.desktop.shape.ctaRadius || "0");
  return {
    n: rows.length,
    "dark page %": pct(rows.filter((r) => r.desktop.colour.pageIsDark).length, rows.length),
    "uppercase headline %": pct(h.filter((x) => x.transform === "uppercase").length, h.length),
    "italic headline %": pct(h.filter((x) => x.italic).length, h.length),
    "centred headline %": pct(h.filter((x) => x.align === "center").length, h.length),
    "median headline words": med(h.map((x) => x.words)),
    "median headline size (% viewport width)": Math.round(med(h.map((x) => x.sizeVsViewport)) * 1000) / 10,
    "median body px": med(rows.map((r) => r.desktop.type.bodySizePx)),
    "square button %": pct(rows.filter((r) => rad(r) === 0).length, rows.length),
    "pill button %": pct(rows.filter((r) => rad(r) >= 24).length, rows.length),
    "image-led first screen %": pct(rows.filter((r) => r.desktop.hero.fullBleedBackgroundImage || r.desktop.hero.mediaShareOfViewport >= 0.5).length, rows.length),
    "text/product-led first screen %": pct(rows.filter((r) => !r.desktop.hero.fullBleedBackgroundImage && r.desktop.hero.mediaShareOfViewport < 0.15).length, rows.length),
    "sticky header %": pct(rows.filter((r) => ["sticky", "fixed"].includes(r.desktop.header.position)).length, rows.length),
    "median nav items": med(rows.map((r) => r.desktop.header.navLabels.length)),
    "median page length (screens)": med(rows.map((r) => r.desktop.page.lengthInScreens)),
    "JSON-LD %": pct(rows.filter((r) => r.desktop.hasJsonLd).length, rows.length),
    "og:image %": pct(rows.filter((r) => r.desktop.hasOgImage).length, rows.length),
    "phone menu button %": pct(mob.filter((r) => r.mobile.menuButton).length, mob.length),
    "phone sticky bottom bar %": pct(mob.filter((r) => r.mobile.stickyBottomBars > 0).length, mob.length),
    "phone overflow %": pct(mob.filter((r) => r.mobile.horizontalOverflowPx > 0).length, mob.length),
  };
};
const a = m(world), b = m(kora);
console.log("| measure | studied sites | Kora v3 golden |\n| --- | --- | --- |");
for (const k of Object.keys(a)) console.log(`| ${k} | ${a[k]} | ${b[k]} |`);
// distinctness inside Kora's own output on the same fingerprint
const fp = (r) => [r.desktop.type.headingFont, r.desktop.colour.page, r.desktop.type.h1?.transform, r.desktop.shape.ctaRadius].join("|");
console.log("\nKora distinct (heading font, page colour, headline case, button radius) combinations:", new Set(kora.map(fp)).size, "of", kora.length);
console.log("Studied sites distinct combinations:", new Set(world.map(fp)).size, "of", world.length);
