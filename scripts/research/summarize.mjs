// Turns the raw observations into (1) a readable table of every site actually studied, (2) corpus statistics, and
// (3) data/summary.json, which tests assert so that documentation cannot claim more than the data contains.
import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync(
  "docs/research/data/site-observations-2026.jsonl",
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
// A page only counts as studied if it really rendered the site: no bot-challenge or error interstitial in the
// title or headline, and enough links to be a real page rather than an empty shell.
const INTERSTITIAL =
  /just a moment|access denied|attention required|captcha|security check|verify you|forbidden|unusual traffic|pardon our|are you a robot/i;
const studied = (r) =>
  r.result === "ok" &&
  !INTERSTITIAL.test(`${r.desktop.title} ${r.desktop.type.h1?.text ?? ""}`) &&
  r.desktop.page.links >= 8;
const ok = raw.filter(studied);
const host = (u) => new URL(u).hostname.replace(/^www\./, "");
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const median = (xs) => {
  const s = xs
    .filter((x) => x !== null && x !== undefined && !Number.isNaN(x))
    .sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** A deterministic description derived ONLY from the measured values; it is a label, not an opinion. */
function fingerprint(r) {
  const d = r.desktop;
  const h = d.type.h1;
  const bits = [];
  bits.push(d.colour.pageIsDark ? "dark page" : "light page");
  if (h) {
    bits.push(
      h.transform === "uppercase"
        ? "uppercase headline"
        : h.italic
          ? "italic headline"
          : "sentence-case headline",
    );
    bits.push(
      h.sizeVsViewport >= 0.06
        ? "oversized headline"
        : h.sizeVsViewport >= 0.035
          ? "large headline"
          : "restrained headline",
    );
  } else bits.push("no h1 in first screen");
  const m = d.hero.mediaShareOfViewport;
  bits.push(
    d.hero.fullBleedBackgroundImage || m >= 0.5
      ? "image-led first screen"
      : m >= 0.15
        ? `${d.hero.mediaSide} image beside text`
        : "text- or product-led first screen",
  );
  const rad = parseFloat(d.shape.ctaRadius || "0");
  bits.push(
    rad === 0
      ? "square buttons"
      : rad >= 24
        ? "pill buttons"
        : "softly rounded buttons",
  );
  return bits.join(", ");
}

const rows = ok.map((r) => {
  const d = r.desktop;
  return {
    site: host(r.finalUrl || r.url),
    category: r.category,
    fingerprint: fingerprint(r),
    headingFont: d.type.headingFont,
    bodyFont: d.type.bodyFont,
    h1: d.type.h1 ? d.type.h1.text : "",
    page: d.colour.page,
    accent: d.colour.accent,
  };
});

const heads = ok.map((r) => r.desktop.type.h1).filter(Boolean);
const stats = {
  attempted: raw.length,
  studied: ok.length,
  blocked: raw.filter((r) => r.result === "blocked").length,
  errors: raw.filter((r) => r.result === "error").length,
  thin: raw.filter(
    (r) => !studied(r) && (r.result === "ok" || r.result === "thin"),
  ).length,
  withMobileMeasurement: ok.filter((r) => r.mobile).length,
  categories: Object.fromEntries(
    [...new Set(ok.map((r) => r.category))]
      .sort()
      .map((c) => [c, ok.filter((r) => r.category === c).length]),
  ),
  corpus: {
    darkPagePct: pct(
      ok.filter((r) => r.desktop.colour.pageIsDark).length,
      ok.length,
    ),
    uppercaseHeadlinePct: pct(
      heads.filter((h) => h.transform === "uppercase").length,
      heads.length,
    ),
    italicHeadlinePct: pct(heads.filter((h) => h.italic).length, heads.length),
    centredHeadlinePct: pct(
      heads.filter((h) => h.align === "center").length,
      heads.length,
    ),
    medianHeadlineSizeVsViewport: median(heads.map((h) => h.sizeVsViewport)),
    medianHeadlineWords: median(heads.map((h) => h.words)),
    medianBodySizePx: median(ok.map((r) => r.desktop.type.bodySizePx)),
    squareButtonPct: pct(
      ok.filter((r) => parseFloat(r.desktop.shape.ctaRadius || "0") === 0)
        .length,
      ok.length,
    ),
    pillButtonPct: pct(
      ok.filter((r) => parseFloat(r.desktop.shape.ctaRadius || "0") >= 24)
        .length,
      ok.length,
    ),
    imageLedFirstScreenPct: pct(
      ok.filter(
        (r) =>
          r.desktop.hero.fullBleedBackgroundImage ||
          r.desktop.hero.mediaShareOfViewport >= 0.5,
      ).length,
      ok.length,
    ),
    textOrProductLedFirstScreenPct: pct(
      ok.filter(
        (r) =>
          !r.desktop.hero.fullBleedBackgroundImage &&
          r.desktop.hero.mediaShareOfViewport < 0.15,
      ).length,
      ok.length,
    ),
    stickyHeaderPct: pct(
      ok.filter((r) => ["sticky", "fixed"].includes(r.desktop.header.position))
        .length,
      ok.length,
    ),
    medianNavItems: median(ok.map((r) => r.desktop.header.navLabels.length)),
    medianPageLengthScreens: median(
      ok.map((r) => r.desktop.page.lengthInScreens),
    ),
    hasJsonLdPct: pct(ok.filter((r) => r.desktop.hasJsonLd).length, ok.length),
    hasOgImagePct: pct(
      ok.filter((r) => r.desktop.hasOgImage).length,
      ok.length,
    ),
    mobileMenuButtonPct: pct(
      ok.filter((r) => r.mobile?.menuButton).length,
      ok.filter((r) => r.mobile).length,
    ),
    mobileStickyBottomBarPct: pct(
      ok.filter((r) => (r.mobile?.stickyBottomBars || 0) > 0).length,
      ok.filter((r) => r.mobile).length,
    ),
    mobileHorizontalOverflowPct: pct(
      ok.filter((r) => (r.mobile?.horizontalOverflowPx || 0) > 0).length,
      ok.filter((r) => r.mobile).length,
    ),
    singleSaturatedAccentPct: pct(
      ok.filter((r) => r.desktop.colour.accent).length,
      ok.length,
    ),
  },
};
writeFileSync(
  "docs/research/data/summary.json",
  JSON.stringify({ ...stats, hosts: rows.map((r) => r.site).sort() }, null, 1) +
    "\n",
);

const lines = [];
lines.push("# Site observations, 2026-11 (rendered, computed)\n");
lines.push(
  "Every row is a real site rendered in Chromium at 1440x900 and 390x844. Values are COMPUTED from the live page (fonts actually applied, colours actually painted, sizes actually laid out), not read from source code or recalled from memory. Raw data: `docs/research/data/site-observations-2026.jsonl`. Produced by `scripts/research/observe.mjs`; this file by `scripts/research/summarize.mjs`.\n",
);
lines.push("## What was and was not done\n");
lines.push(
  `- Attempted: ${stats.attempted}. Studied (rendered with measurements): **${stats.studied}**. Blocked by the site (403/429): ${stats.blocked}. Network or other errors: ${stats.errors}. Rendered but too thin to measure (JS shells, interstitials): ${stats.thin}.`,
);
lines.push(
  "- Consent banners were dismissed when a standard 'Accept' button was found; otherwise the first screen may include one.",
);
lines.push(
  "- One page per site: the home page. This is a study of first impressions and page systems, not of whole sites.",
);
lines.push(
  "- The 'fingerprint' column is a deterministic label derived only from the measured values. It is not a critic's opinion.",
);
lines.push(
  "- No screenshots, copy, imagery or code are reproduced in this repository. Nothing here is a template for Kora to copy.\n",
);
lines.push("## Corpus findings\n");
const c = stats.corpus;
lines.push(
  `- Dark pages: ${c.darkPagePct}%. Uppercase headlines: ${c.uppercaseHeadlinePct}%. Italic headlines: ${c.italicHeadlinePct}%. Centred headlines: ${c.centredHeadlinePct}%.`,
);
lines.push(
  `- Median headline: ${c.medianHeadlineWords} words, ${(c.medianHeadlineSizeVsViewport * 100).toFixed(1)}% of viewport width. Median body text ${c.medianBodySizePx}px.`,
);
lines.push(
  `- Buttons: square ${c.squareButtonPct}%, pill-shaped ${c.pillButtonPct}%, the rest softly rounded.`,
);
lines.push(
  `- First screen: image-led ${c.imageLedFirstScreenPct}%, text- or product-led ${c.textOrProductLedFirstScreenPct}%.`,
);
lines.push(
  `- Sticky or fixed header ${c.stickyHeaderPct}%; median ${c.medianNavItems} visible navigation items; median page length ${c.medianPageLengthScreens} screens.`,
);
lines.push(
  `- Structured data present ${c.hasJsonLdPct}%; social preview picture declared ${c.hasOgImagePct}%.`,
);
lines.push(
  `- Phone (${stats.withMobileMeasurement} measured): menu button ${c.mobileMenuButtonPct}%, sticky bottom bar ${c.mobileStickyBottomBarPct}%, any horizontal overflow ${c.mobileHorizontalOverflowPct}%.\n`,
);
lines.push("## By category\n");
for (const [k, v] of Object.entries(stats.categories))
  lines.push(`- ${k}: ${v}`);
lines.push("\n## Every site studied\n");
lines.push(
  "| Site | Category | Fingerprint (derived) | Heading / body font | Page | Accent | First headline |",
);
lines.push("| --- | --- | --- | --- | --- | --- | --- |");
const esc = (s) =>
  String(s || "")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .slice(0, 70);
for (const r of rows.sort((a, b) => a.site.localeCompare(b.site)))
  lines.push(
    `| ${r.site} | ${r.category} | ${r.fingerprint} | ${esc(r.headingFont)} / ${esc(r.bodyFont)} | ${r.page} | ${r.accent || "none"} | ${esc(r.h1)} |`,
  );
writeFileSync(
  "docs/research/SITE-OBSERVATIONS-2026.md",
  lines.join("\n") + "\n",
);
console.log(JSON.stringify({ ...stats, hosts: undefined }, null, 1));
