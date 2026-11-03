// Renders real sites in Chromium (through the agent proxy) and records STRUCTURED, COMPUTED observations:
// what the page actually shows at desktop and phone width, not what its source code declares.
// Output is a JSONL file; failures are recorded as failures (blocked/error), never silently dropped or invented.
import { createRequire } from "node:module";
import { readFileSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
const req = createRequire(import.meta.url);
const { chromium } = req("@playwright/test");

const [, , listFile, outFile, concArg] = process.argv;
const list = JSON.parse(readFileSync(listFile, "utf8"));
const done = new Set(
  existsSync(outFile)
    ? readFileSync(outFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l).url)
    : [],
);
const todo = list.filter((x) => !done.has(x.url));
const u = new URL(process.env.HTTPS_PROXY);
const proxy = {
  server: `${u.protocol}//${u.host}`,
  username: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
};

/** Runs inside the page. Pure measurement. */
function measure() {
  const vw = innerWidth;
  const vh = innerHeight;
  const hex = (c) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.15) return null;
    return (
      "#" +
      [m[1], m[2], m[3]]
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("")
    );
  };
  const sat = (h) => {
    const n = parseInt(h.slice(1), 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  const lum = (h) => {
    const n = parseInt(h.slice(1), 16);
    return (
      (0.2126 * ((n >> 16) & 255) +
        0.7152 * ((n >> 8) & 255) +
        0.0722 * (n & 255)) /
      255
    );
  };
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return (
      r.width > 2 &&
      r.height > 2 &&
      cs.visibility !== "hidden" &&
      cs.display !== "none" &&
      parseFloat(cs.opacity) > 0.05
    );
  };
  const inView = (e) => {
    const r = e.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  const first = (v) =>
    (v || "").split(",")[0].replace(/["']/g, "").trim();
  const text = (e) => (e.textContent || "").replace(/\s+/g, " ").trim();

  // headline: first visible h1, else the largest visible heading in view
  const heads = [...document.querySelectorAll("h1,h2,h3")].filter(
    (e) => visible(e) && inView(e) && text(e).length > 2,
  );
  const h1 =
    heads.find((e) => e.tagName === "H1") ||
    heads.sort(
      (a, b) =>
        parseFloat(getComputedStyle(b).fontSize) -
        parseFloat(getComputedStyle(a).fontSize),
    )[0] ||
    null;
  const hs = h1 ? getComputedStyle(h1) : null;
  const body = getComputedStyle(document.body);
  const firstBtn = document.querySelector("button, a.btn, a[class*=button]");

  // area-weighted background and text colours above the fold
  const bgArea = new Map();
  const fgLen = new Map();
  let sampled = 0;
  for (const e of document.querySelectorAll("body *")) {
    if (sampled > 1500) break;
    if (!visible(e) || !inView(e)) continue;
    sampled++;
    const r = e.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const cs = getComputedStyle(e);
    const bg = hex(cs.backgroundColor);
    if (bg && w * h < vw * vh * 1.2)
      bgArea.set(bg, (bgArea.get(bg) || 0) + w * h);
    if (e.childElementCount === 0 && text(e).length > 0) {
      const fg = hex(cs.color);
      if (fg) fgLen.set(fg, (fgLen.get(fg) || 0) + text(e).length);
    }
  }
  const pageBg =
    hex(getComputedStyle(document.documentElement).backgroundColor) ||
    hex(body.backgroundColor) ||
    "#ffffff";
  const topBg = [...bgArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topFg = [...fgLen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  // media above the fold
  const media = [
    ...document.querySelectorAll("img, video, picture, svg"),
  ].filter((e) => visible(e) && inView(e));
  let big = null;
  for (const m of media) {
    const r = m.getBoundingClientRect();
    const a =
      Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (!big || a > big.a) big = { a, r, tag: m.tagName.toLowerCase() };
  }
  // full-bleed background image on a large container
  let bleed = false;
  for (const e of document.querySelectorAll("section, div, header, main")) {
    if (!visible(e) || !inView(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < vw * 0.9 || r.height < vh * 0.4) continue;
    if (/url\(/.test(getComputedStyle(e).backgroundImage)) {
      bleed = true;
      break;
    }
  }
  const mediaShare = big ? Math.round((big.a / (vw * vh)) * 100) / 100 : 0;
  const mediaSide = !big
    ? "none"
    : big.r.width >= vw * 0.9
      ? "full-width"
      : big.r.left + big.r.width / 2 > vw * 0.6
        ? "right"
        : big.r.left + big.r.width / 2 < vw * 0.4
          ? "left"
          : "centre";

  // buttons and their accent
  const btnEls = [
    ...document.querySelectorAll(
      "a, button, [role=button], [class*=btn], [class*=button]",
    ),
  ].filter((e) => {
    if (!visible(e) || !inView(e)) return false;
    const t = text(e);
    return t.length > 1 && t.length <= 32;
  });
  const solids = btnEls
    .map((e) => {
      const cs = getComputedStyle(e);
      const bg = hex(cs.backgroundColor);
      const r = e.getBoundingClientRect();
      return bg && r.width * r.height < 60000 && r.height > 24
        ? {
            bg,
            fg: hex(cs.color),
            radius: cs.borderTopLeftRadius,
            label: text(e),
            h: Math.round(r.height),
            sat: sat(bg),
          }
        : null;
    })
    .filter(Boolean);
  const accent =
    solids.find((s) => s.sat > 0.35 && lum(s.bg) > 0.08) || solids[0] || null;

  // header
  const header =
    document.querySelector("header") || document.querySelector("nav");
  const hr = header ? header.getBoundingClientRect() : null;
  const hpos = header ? getComputedStyle(header).position : null;
  const navLabels = [
    ...new Set(
      [...document.querySelectorAll("header a, nav a")]
        .filter((e) => visible(e) && e.getBoundingClientRect().top < 160)
        .map(text)
        .filter((t) => t && t.length <= 24),
    ),
  ].slice(0, 10);

  // radii histogram on boxes with fill or border
  const radii = new Map();
  let n = 0;
  for (const e of document.querySelectorAll(
    "a, button, [class*=card], [class*=Card], img, input",
  )) {
    if (n > 250) break;
    if (!visible(e)) continue;
    const cs = getComputedStyle(e);
    const r = cs.borderTopLeftRadius;
    if (r && r !== "0px") radii.set(r, (radii.get(r) || 0) + 1);
    else radii.set("0px", (radii.get("0px") || 0) + 1);
    n++;
  }
  const topRadii = [...radii.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, c]) => `${k}×${c}`);

  const h2s = [...document.querySelectorAll("h2")]
    .filter(visible)
    .map(text)
    .filter((t) => t.length > 2 && t.length <= 70)
    .slice(0, 8);
  return {
    title: document.title.slice(0, 120),
    description:
      document.querySelector('meta[name="description"]')?.content?.slice(0, 200) || "",
    lang: document.documentElement.lang || "",
    themeColor:
      document.querySelector('meta[name="theme-color"]')?.content || "",
    hasJsonLd: !!document.querySelector('script[type="application/ld+json"]'),
    hasOgImage: !!document.querySelector('meta[property="og:image"]'),
    page: {
      lengthInScreens: Math.round((document.documentElement.scrollHeight / vh) * 10) / 10,
      sections: document.querySelectorAll("section").length,
      links: document.querySelectorAll("a[href]").length,
      images: document.querySelectorAll("img").length,
      videos: document.querySelectorAll("video").length,
    },
    type: {
      headingFont: hs ? first(hs.fontFamily) : null,
      bodyFont: first(body.fontFamily),
      buttonFont: firstBtn ? first(getComputedStyle(firstBtn).fontFamily) : null,
      h1: h1
        ? {
            text: text(h1).slice(0, 110),
            words: text(h1).split(" ").length,
            sizePx: Math.round(parseFloat(hs.fontSize)),
            sizeVsViewport: Math.round((parseFloat(hs.fontSize) / vw) * 1000) / 1000,
            weight: hs.fontWeight,
            letterSpacingEm:
              hs.letterSpacing === "normal"
                ? 0
                : Math.round((parseFloat(hs.letterSpacing) / parseFloat(hs.fontSize)) * 100) / 100,
            lineHeight:
              hs.lineHeight === "normal"
                ? null
                : Math.round((parseFloat(hs.lineHeight) / parseFloat(hs.fontSize)) * 100) / 100,
            transform: hs.textTransform,
            align: hs.textAlign,
            italic: hs.fontStyle === "italic",
          }
        : null,
      bodySizePx: Math.round(parseFloat(body.fontSize)),
    },
    colour: {
      page: pageBg,
      pageIsDark: lum(pageBg) < 0.35,
      aboveFoldBackgrounds: topBg.map(([c]) => c),
      aboveFoldText: topFg.map(([c]) => c),
      accent: accent ? accent.bg : null,
      accentOnText: accent ? accent.fg : null,
    },
    shape: {
      ctaRadius: accent ? accent.radius : null,
      ctaHeightPx: accent ? accent.h : null,
      radiusProfile: topRadii,
    },
    hero: {
      mediaShareOfViewport: mediaShare,
      mediaKind: big ? big.tag : "none",
      mediaSide,
      fullBleedBackgroundImage: bleed,
      ctaLabels: [...new Set(btnEls.map(text))].slice(0, 6),
    },
    header: {
      position: hpos,
      heightPx: hr ? Math.round(hr.height) : null,
      navLabels,
    },
    structure: { h2: h2s },
  };
}

function measureMobile() {
  const vw = innerWidth;
  const bad = [...document.querySelectorAll("body *")].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 2;
  }).length;
  const burger = !!document.querySelector(
    '[aria-label*="menu" i], [class*=hamburger i], [class*=burger i], button[aria-controls*=nav i], button[aria-expanded]',
  );
  const fixedBottom = [...document.querySelectorAll("body *")].filter((e) => {
    const cs = getComputedStyle(e);
    if (cs.position !== "fixed" && cs.position !== "sticky") return false;
    const r = e.getBoundingClientRect();
    return r.top > innerHeight * 0.6 && r.width > vw * 0.5 && r.height < 140;
  }).length;
  const h1 = document.querySelector("h1");
  return {
    horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw),
    elementsPastRightEdge: bad,
    menuButton: burger,
    stickyBottomBars: fixedBottom,
    h1SizePx: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : null,
    lengthInScreens: Math.round((document.documentElement.scrollHeight / innerHeight) * 10) / 10,
  };
}

async function settle(page) {
  await page.waitForTimeout(2200);
  // dismiss the most common consent banners so the first screen is the site, not the banner
  await page
    .evaluate(() => {
      const re = /^(accept( all)?( cookies)?|allow all|agree|i agree|got it|ok|okay|accept & continue|reject all)$/i;
      for (const b of document.querySelectorAll("button, a[role=button]")) {
        if (re.test((b.textContent || "").trim())) {
          b.click();
          break;
        }
      }
    })
    .catch(() => {});
  await page.waitForTimeout(700);
}

async function observe(browser, site) {
  const rec = { url: site.url, category: site.category, observedAt: new Date().toISOString() };
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  await page.route("**/*", (r) => {
    const t = r.request().resourceType();
    return t === "media" || t === "websocket" ? r.abort() : r.continue();
  });
  try {
    const resp = await page.goto(site.url, { timeout: 30000, waitUntil: "domcontentloaded" });
    rec.status = resp ? resp.status() : 0;
    rec.finalUrl = page.url();
    if (rec.status >= 400) {
      rec.result = rec.status === 403 || rec.status === 429 ? "blocked" : "error";
      return rec;
    }
    await settle(page);
    rec.desktop = await page.evaluate(measure);
    await ctx.close();
    const m = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      ignoreHTTPSErrors: true,
    });
    const mp = await m.newPage();
    await mp.route("**/*", (r) =>
      r.request().resourceType() === "media" ? r.abort() : r.continue(),
    );
    try {
      await mp.goto(site.url, { timeout: 30000, waitUntil: "domcontentloaded" });
      await settle(mp);
      rec.mobile = await mp.evaluate(measureMobile);
    } catch (e) {
      rec.mobileError = String(e).slice(0, 120);
    } finally {
      await m.close();
    }
    const h1 = rec.desktop.type.h1;
    const bodyish = (rec.desktop.page.links || 0) + (rec.desktop.page.images || 0);
    if (!h1 && bodyish < 8) {
      rec.result = "thin";
    } else rec.result = "ok";
    return rec;
  } catch (e) {
    rec.result = "error";
    rec.error = String(e).slice(0, 160);
    return rec;
  } finally {
    await ctx.close().catch(() => {});
  }
}

const browser = await chromium.launch({ proxy });
let i = 0;
let ok = 0;
const conc = Number(concArg || 5);
async function worker() {
  while (i < todo.length) {
    const site = todo[i++];
    const r = await observe(browser, site);
    appendFileSync(outFile, JSON.stringify(r) + "\n");
    if (r.result === "ok") ok++;
    console.log(`${i}/${todo.length} ${r.result.padEnd(7)} ${site.url}`);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
await browser.close();
console.log("done; ok =", ok, "of", todo.length);
