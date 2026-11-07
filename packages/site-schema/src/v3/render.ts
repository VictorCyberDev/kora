import type { SiteFiles } from "../hash.js";
import {
  esc,
  origin,
  pagePath,
  relFrom,
  type RenderContext,
} from "../render.js";
import { SITE_JS_V2 } from "../v2/render.js";
import { wantsDock } from "./dock-policy.js";
import { baseCss } from "./css.js";
import { voiceFiles, VOICES } from "./fonts.js";
import { PARTS } from "./parts.js";
import { plateSvg } from "./plates.js";
import type { MediaV3, SectionV3, SiteSpecV3 } from "./spec.js";

type Sec<T extends SectionV3["type"]> = Extract<SectionV3, { type: T }>;
type Tone = "light" | "alt" | "dark" | "brand" | "accent";
interface Ctx {
  spec: SiteSpecV3;
  rc: RenderContext;
  from: string;
  used: Set<string>;
  focals: Set<string>;
  heroSeen: boolean;
  /** Quiet brands get low-contrast placeholder graphics so a placeholder never out-shouts the brand. */
  quiet: boolean;
  letter: string;
  stamp: string;
}

const enc = (s: string) => encodeURIComponent(s).replace(/'/g, "%27");
const waLink = (spec: SiteSpecV3, text?: string) =>
  spec.business.whatsapp
    ? `https://wa.me/${spec.business.whatsapp.replace(/^\+/, "")}${text ? `?text=${enc(text)}` : ""}`
    : "";
const telLink = (spec: SiteSpecV3) =>
  spec.business.phone
    ? `tel:${spec.business.phone.replace(/[^\d+]/g, "")}`
    : "";
const mapsLink = (spec: SiteSpecV3) =>
  spec.business.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spec.business.location)}`
    : "";

function href(h: string, from: string): string {
  if (h.startsWith("/")) return relFrom(from, h.slice(1) || "home");
  return h;
}
const link = (l: { label: string; href: string }, c: Ctx, cls = "btn") => {
  const wa = /^https:\/\/wa\.me\//.test(l.href);
  return `<a class="${cls}${wa ? " wa" : ""}" href="${esc(href(l.href, c.from))}">${esc(l.label)}</a>`;
};

/** Italicise the last word of a headline when the type voice has a real italic. Pure text, escaped. */
function headline(text: string, c: Ctx): string {
  const g = c.spec.design.genome;
  const v = VOICES[g.typeVoice];
  if (g.headlineBehavior !== "mixed-italic" || !v.italic) return esc(text);
  const m = /^(.*\S\s+)(\S+?)([.!?,]*)$/.exec(text);
  return m ? `${esc(m[1]!)}<em>${esc(m[2]!)}</em>${esc(m[3]!)}` : esc(text);
}

function visual(
  v: {
    media?: MediaV3 | undefined;
    plate?:
      | { kind: never; seed: number }
      | { kind: string; seed: number }
      | undefined;
  },
  c: Ctx,
  opts: { cls?: string; eager?: boolean; ar?: string; sizes?: string } = {},
): string {
  const g = c.spec.design.genome;
  const ar = `ar-${opts.ar ?? g.imageCrop}`;
  if (v.media) {
    const m = v.media;
    let fp = "";
    if (m.focalPoint) {
      const x = Math.round((m.focalPoint.x * 100) / 10) * 10;
      const y = Math.round((m.focalPoint.y * 100) / 10) * 10;
      fp = ` fp-${x}-${y}`;
      c.focals.add(`${x}-${y}`);
    }
    const dims =
      m.width && m.height ? ` width="${m.width}" height="${m.height}"` : "";
    return `<div class="frame ${ar} tr-${m.treatment}${fp} ${opts.cls ?? ""}"><img src="${esc(m.url)}"${m.srcset?.length ? ` srcset="${esc(m.srcset.map((x) => `${x.url} ${x.width}w`).join(", "))}" sizes="${esc(opts.sizes ?? "(min-width: 860px) 50vw, 100vw")}"` : ""} alt="${esc(m.alt)}"${dims} ${opts.eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}></div>`;
  }
  const plate = v.plate ?? { kind: "arch", seed: 1 };
  return `<div class="frame plate-w ${ar} ${opts.cls ?? ""}">${plateSvg(plate.kind as never, plate.seed, c.spec.design.palette, c.letter, c.quiet)}</div>`;
}

/**
 * Quiet brands never show an empty placeholder in the opening: with no real picture the opening is typographic.
 * Loud brands keep their flat graphic plates, which read as posters rather than broken images.
 */
function heroVisual(
  v: Parameters<typeof visual>[0],
  c: Ctx,
  opts: Parameters<typeof visual>[2] = {},
): string {
  return c.quiet && !v.media ? "" : visual(v, c, opts);
}

const kickLabel: Record<string, string> = {
  offer: "What we do",
  products: "Products",
  story: "Our story",
  process: "How it works",
  gallery: "Work",
  proof: "In their words",
  visit: "Visit",
  contact: "Get in touch",
  faq: "Questions",
};
const head = (
  c: Ctx,
  type: string,
  h: string,
  lede = "",
  cls = "",
  kick?: string,
) =>
  `<div class="sh rv ${cls}"><p class="kick">${esc(type === "hero" ? "" : (kick ?? kickLabel[type] ?? ""))}</p><h2>${headline(h, c)}</h2>${lede ? `<p class="lede">${esc(lede)}</p>` : ""}</div>`;
const open = (type: string, tone: Tone, extra = "") =>
  `<section class="sec t-${tone} ${extra}" id="${type}">`;
const mark = (c: Ctx, ...keys: string[]) => keys.forEach((k) => c.used.add(k));

// ---------------------------------------------------------------- heroes
function hero(s: Sec<"hero">, c: Ctx, tone: Tone): string {
  const b = c.spec.business;
  mark(c, "hero.shared", `hero.${s.layout}`);
  const eager = !c.heroSeen;
  c.heroSeen = true;
  const eyebrow = s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : "";
  const hcls =
    s.heading.length > 60 ? " l3" : s.heading.length > 34 ? " l2" : "";
  const h1 = `<h1${hcls ? ` class="${hcls.trim()}"` : ""}>${headline(s.heading, c)}</h1>`;
  const sub = s.subheading ? `<p class="sub">${esc(s.subheading)}</p>` : "";
  const ctas =
    s.primaryCta || s.secondaryCta
      ? `<div class="row">${s.primaryCta ? link(s.primaryCta, c) : ""}${s.secondaryCta ? link(s.secondaryCta, c, "btn alt") : ""}</div>`
      : "";
  const hl = s.highlights.length
    ? `<ul class="hl">${s.highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : "";
  const copy = `${eyebrow}${h1}${sub}${ctas}${hl}`;
  const stamp = `<span class="stamp" aria-hidden="true">${esc(c.stamp)}</span>`;
  const o = `<section class="sec hero h-${s.layout} t-${tone}" id="hero">`;
  switch (s.layout) {
    case "cinematic":
      return `${o}<div class="bgv">${visual(s, c, { eager, ar: "wide", sizes: "100vw" }).replace(/class="frame[^"]*"/, 'class="bgf"')}</div><div class="w">${copy}</div></section>`;
    case "type-dominant":
      return `${o}<div class="w">${eyebrow}${h1}<div class="under">${sub}<div>${ctas}${hl}</div></div></div></section>`;
    case "minimal-statement":
      return `${o}<div class="w"><div class="top"><div>${eyebrow}${h1}</div><div>${sub}${ctas}</div></div>${heroVisual(s, c, { eager, ar: "wide" }) ? `<div class="wide">${heroVisual(s, c, { eager, ar: "wide" })}</div>` : ""}</div></section>`;
    case "menu-focus": {
      const items = s.highlights.length ? s.highlights : [];
      const card = items.length
        ? `<div class="mcard"><h2>On offer</h2><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
        : visual(s, c, { eager });
      return `${o}<div class="w gridh"><div>${eyebrow}${h1}${sub}${ctas}</div>${card}</div></section>`;
    }
    case "booking-focus": {
      const wa = waLink(c.spec, `Hello ${b.name}, I would like to book.`);
      const tel = telLink(c.spec);
      const today = b.hours[0]
        ? `<small>${esc(b.hours[0].days)}: ${esc(b.hours[0].hours)}</small>`
        : "";
      const actions = [
        s.primaryCta ? link(s.primaryCta, c) : "",
        wa && !/wa\.me/.test(s.primaryCta?.href ?? "")
          ? `<a class="btn alt wa" href="${esc(wa)}">Message on WhatsApp</a>`
          : "",
        tel && !/^tel:/.test(s.primaryCta?.href ?? "")
          ? `<a class="btn alt" href="${esc(tel)}">Call ${esc(b.phone ?? "")}</a>`
          : "",
      ].join("");
      return `${o}<div class="w gridh"><div>${eyebrow}${h1}${sub}${hl}</div><div class="bk"><h2>Book your visit</h2>${actions}${today}</div></div></section>`;
    }
    case "location-focus": {
      const info = [
        b.location ? `<div><b>Find us</b>${esc(b.location)}</div>` : "",
        b.hours.length
          ? `<div><b>Hours</b>${b.hours
              .slice(0, 2)
              .map((h) => `${esc(h.days)} ${esc(h.hours)}`)
              .join("<br>")}</div>`
          : "",
        b.phone || b.whatsapp
          ? `<div><b>Reach us</b>${esc(b.phone ?? b.whatsapp ?? "")}</div>`
          : "",
      ].join("");
      const wide =
        s.media || s.plate
          ? `<div class="wide">${visual(s, c, { eager, ar: "wide" })}</div>`
          : "";
      return `${o}<div class="w">${eyebrow}${h1}${sub}${ctas}${info ? `<div class="info">${info}</div>` : ""}${wide}</div></section>`;
    }
    case "collage": {
      const p = c.spec.design.palette;
      void p;
      const base = s.plate?.seed ?? 1;
      const three = [0, 1, 2]
        .map((i) =>
          visual(
            i === 0
              ? s
              : {
                  plate: {
                    kind: (["arch", "circles", "stripes"] as const)[i]!,
                    seed: base + i,
                  },
                },
            c,
            { cls: `f${i + 1}`, eager: eager && i === 0 },
          ),
        )
        .join("");
      return `${o}<div class="w gridh"><div>${copy}</div><div class="stack">${three}${stamp}</div></div></section>`;
    }
    case "arch-portrait":
    case "poster": {
      const v = heroVisual(s, c, {
        eager,
        ar: s.layout === "poster" ? "square" : "arch",
      });
      return v
        ? `${o}<div class="w gridh"><div>${copy}</div><div class="vis">${v}${stamp}</div></div></section>`
        : `${o}<div class="w gridh nv"><div>${copy}</div></div></section>`;
    }
    case "ticker-energy":
    case "editorial-split":
    case "product-dominant": {
      const v = heroVisual(s, c, { eager });
      return v
        ? `${o}<div class="w gridh"><div>${copy}</div><div class="vis">${v}</div></div></section>`
        : `${o}<div class="w gridh nv"><div>${copy}</div></div></section>`;
    }
    case "call-first": {
      const tel = telLink(c.spec) || waLink(c.spec);
      const label = b.phone ?? b.whatsapp ?? "";
      const box = tel
        ? `<div class="callbox"><small>${telLink(c.spec) ? "Call now" : "Message now"}</small><a class="num" href="${esc(tel)}">${esc(label)}</a>${waLink(c.spec) && telLink(c.spec) ? `<a class="btn wa" href="${esc(waLink(c.spec, `Hello ${b.name}`))}">Or send a WhatsApp</a>` : ""}</div>`
        : visual(s, c, { eager });
      const ck = s.highlights.length
        ? `<ul class="ck">${s.highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : "";
      const cv = s.variant;
      return `${o.replace("h-call-first", `h-call-first cv${cv}`)}<div class="w gridh"><div>${eyebrow}${h1}${sub}${ck}</div>${box}</div></section>`;
    }
    default:
      return `${o}<div class="w">${copy}</div></section>`;
  }
}

// ---------------------------------------------------------------- body sections
function offer(s: Sec<"offer">, c: Ctx, tone: Tone): string {
  mark(c, `offer.${s.layout}`);
  const h = head(c, "offer", s.heading, s.intro, "", s.eyebrow);
  const P = (it: Sec<"offer">["items"][number]) =>
    it.price
      ? `<span class="price">${esc(it.price)}</span>`
      : it.tag
        ? `<span class="tg">${esc(it.tag)}</span>`
        : "";
  let body = "";
  switch (s.layout) {
    case "editorial-index":
      body = `<ol class="ix rv">${s.items.map((it, i) => `<li><span class="n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p><span class="tg">${it.price ? esc(it.price) : it.tag ? esc(it.tag) : ""}</span></li>`).join("")}</ol>`;
      break;
    case "menu-list":
      body = `<ul class="ml rv">${s.items.map((it) => `<li><div class="top"><h3>${esc(it.title)}</h3><i></i>${P(it)}</div>${it.text ? `<p>${esc(it.text)}</p>` : ""}</li>`).join("")}</ul>`;
      break;
    case "image-tiles":
      body = `<div class="it rv">${s.items.map((it, i) => `<article class="card">${visual({ media: it.media, plate: it.plate ?? { kind: (["arch", "circles", "stripes", "sunburst"] as const)[i % 4]!, seed: i + 3 } }, c, { ar: "tall" })}<div class="cb">${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ""}<h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ""}${it.price ? `<p class="price">${esc(it.price)}</p>` : ""}</div></article>`).join("")}</div>`;
      break;
    case "stacked-panels":
      body = `<div class="sp">${s.items.map((it, i) => `<article class="pn rv">${visual({ media: it.media, plate: it.plate ?? { kind: (["arch", "lines", "circles", "stack"] as const)[i % 4]!, seed: i + 5 } }, c, { ar: "natural" })}<div><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p>${it.price ? `<p class="price">${esc(it.price)}</p>` : ""}</div></article>`).join("")}</div>`;
      break;
    case "accordion":
      body = `<div class="ac rv">${s.items.map((it, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(it.title)}</summary><div class="ab">${esc(it.text)}</div></details>`).join("")}</div>`;
      return `${open("offer", tone)}<div class="w">${h}${body}</div></section>`;
    case "sticky-split":
      return `${open("offer", tone)}<div class="w ss"><div class="lft">${h}</div><div class="rt rv">${s.items.map((it) => `<article><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p>${it.price ? `<p class="price">${esc(it.price)}</p>` : ""}</article>`).join("")}</div></div></section>`;
    case "board":
      body = `<div class="bd rv">${s.items.map((it, i) => `<article><span class="no">${String(i + 1).padStart(2, "0")}</span><div><h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ""}${it.price ? `<p class="price">${esc(it.price)}</p>` : ""}</div></article>`).join("")}</div>`;
      break;
    case "ladder":
      body = `<ul class="ld rv">${s.items.map((it) => `<li><div class="rw"><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p><span class="ar" aria-hidden="true">→</span></div></li>`).join("")}</ul>`;
      break;
  }
  return `${open("offer", tone)}<div class="w">${h}${body}</div></section>`;
}

function products(s: Sec<"products">, c: Ctx, tone: Tone): string {
  mark(c, `products.${s.layout}`);
  const h = head(c, "products", s.heading, s.intro, "", s.eyebrow);
  const art = (it: Sec<"products">["items"][number], i: number) =>
    `<article>${visual({ media: it.media, plate: it.plate ?? { kind: (["circles", "arch", "sunburst", "stripes"] as const)[i % 4]!, seed: i + 9 } }, c, { ar: "tall" })}<h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ""}${it.price ? `<p class="price">${esc(it.price)}</p>` : ""}</article>`;
  let body: string;
  if (s.layout === "price-menu")
    body = `<ul class="pm rv">${s.items.map((it) => `<li><div class="top"><h3>${esc(it.title)}</h3><i></i>${it.price ? `<span class="price">${esc(it.price)}</span>` : ""}</div>${it.text ? `<p>${esc(it.text)}</p>` : ""}</li>`).join("")}</ul>`;
  else {
    const cls = { rail: "rl", "gallery-grid": "gg", "featured-pair": "fp" }[
      s.layout
    ];
    body = `<div class="${cls} rv"${s.layout === "rail" ? ' tabindex="0" role="region" aria-label="Products, scroll sideways"' : ""}>${s.items.map(art).join("")}</div>`;
  }
  return `${open("products", tone)}<div class="w">${h}${body}</div></section>`;
}

function story(s: Sec<"story">, c: Ctx, tone: Tone): string {
  mark(c, `story.${s.layout}`);
  const paras = s.body.map((x) => `<p>${esc(x)}</p>`).join("");
  switch (s.layout) {
    case "manifesto":
      return `${open("story", tone)}<div class="w sm"><div class="rv"><p class="kick">${esc(s.eyebrow ?? kickLabel.story ?? "")}</p><h2>${headline(s.heading, c)}</h2></div><div class="bd2 rv">${paras}</div></div></section>`;
    case "founder-note":
      return `${open("story", tone)}<div class="w sf rv"><p class="kick">${esc(s.eyebrow ?? kickLabel.story ?? "")}</p><h2>${headline(s.heading, c)}</h2>${paras}</div></section>`;
    case "split-image":
      return `${open("story", tone)}<div class="w si"><div class="rv">${visual(s, c)}</div><div class="rv"><p class="kick">${esc(s.eyebrow ?? kickLabel.story ?? "")}</p><h2>${headline(s.heading, c)}</h2>${paras}</div></div></section>`;
    default:
      return `${open("story", tone)}<div class="w sc"><div class="rv"><p class="kick">${esc(s.eyebrow ?? kickLabel.story ?? "")}</p><h2>${headline(s.heading, c)}</h2>${s.values.length ? `<ul class="vs">${s.values.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : ""}</div><div class="rv">${paras}</div></div></section>`;
  }
}

function process(s: Sec<"process">, c: Ctx, tone: Tone): string {
  mark(c, `process.${s.layout}`);
  const h = head(c, "process", s.heading, s.intro, "", s.eyebrow);
  const cls = {
    numerals: "pn2",
    "horizontal-steps": "hs",
    "timeline-line": "tl",
  }[s.layout];
  const li = s.items
    .map(
      (it, i) =>
        `<li>${s.layout === "timeline-line" ? "" : `<span class="no">${s.layout === "numerals" ? String(i + 1).padStart(2, "0") : i + 1}</span>`}<h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></li>`,
    )
    .join("");
  return `${open("process", tone)}<div class="w">${h}<ol class="${cls} rv"${s.layout === "horizontal-steps" ? ' tabindex="0"' : ""}>${li}</ol></div></section>`;
}

function gallery(s: Sec<"gallery">, c: Ctx, tone: Tone): string {
  mark(c, `gallery.${s.layout}`);
  const cls = { mosaic: "gm", rail: "gl", pair: "gp", grid: "gr" }[s.layout];
  const figs = s.items
    .map(
      (it, i) =>
        `<figure>${visual({ media: it.media, plate: it.plate ?? { kind: (["arch", "stripes", "circles", "checker", "sunburst", "lines"] as const)[i % 6]!, seed: i + 21 } }, c, { ar: s.layout === "mosaic" || s.layout === "grid" ? "square" : "tall" })}${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ""}</figure>`,
    )
    .join("");
  return `${open("gallery", tone)}<div class="w">${s.heading ? head(c, "gallery", s.heading, "", "", s.eyebrow) : ""}<div class="${cls} rv"${s.layout === "rail" ? ' tabindex="0" role="region" aria-label="Gallery, scroll sideways"' : ""}>${figs}</div></div></section>`;
}

function proof(s: Sec<"proof">, c: Ctx, tone: Tone): string {
  mark(c, `proof.${s.layout}`);
  const h = s.heading ? head(c, "proof", s.heading) : "";
  let body = "";
  if (s.layout === "facts-band")
    body = `<div class="pf rv">${s.facts.map((f) => `<div><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join("")}</div>`;
  else if (s.layout === "spotlight" && s.quotes[0])
    body = `<figure class="ps rv"><blockquote>“${esc(s.quotes[0].quote)}”</blockquote><cite>${esc(s.quotes[0].author)}${s.quotes[0].role ? `, ${esc(s.quotes[0].role)}` : ""}</cite></figure>`;
  else
    body = `<div class="pk rv">${s.quotes.map((q) => `<figure><blockquote>“${esc(q.quote)}”</blockquote><figcaption>${esc(q.author)}${q.role ? `, ${esc(q.role)}` : ""}</figcaption></figure>`).join("")}</div>`;
  return `${open("proof", tone)}<div class="w">${h}${body}</div></section>`;
}

function visit(s: Sec<"visit">, c: Ctx, tone: Tone): string {
  mark(c, "visit.shared");
  const b = c.spec.business;
  const maps = b.locationKind === "service-area" ? "" : mapsLink(c.spec);
  const dl = [
    b.location
      ? `<div><dt>${b.locationKind === "service-area" ? "Where we work" : "Find us"}</dt><dd>${esc(b.location)}${maps ? `<br><a class="btn alt" href="${esc(maps)}" rel="noopener">Get directions</a>` : ""}</dd></div>`
      : "",
    b.hours.length
      ? `<div><dt>Hours</dt><dd><ul>${b.hours.map((h) => `<li><span>${esc(h.days)}</span><b>${esc(h.hours)}</b></li>`).join("")}</ul></dd></div>`
      : "",
    b.phone || b.whatsapp
      ? `<div><dt>Reach us</dt><dd>${b.phone ? `<a href="${esc(telLink(c.spec))}">${esc(b.phone)}</a>` : ""}${b.phone && b.whatsapp ? " · " : ""}${b.whatsapp ? `<a href="${esc(waLink(c.spec))}">WhatsApp</a>` : ""}</dd></div>`
      : "",
  ].join("");
  return `${open("visit", tone)}<div class="w vs2"><div class="rv"><p class="kick">${kickLabel.visit}</p><h2>${headline(s.heading, c)}</h2>${s.intro ? `<p class="lede">${esc(s.intro)}</p>` : ""}</div><div class="card rv"><dl>${dl}</dl></div></div></section>`;
}

function contact(s: Sec<"contact">, c: Ctx, tone: Tone, id: string): string {
  mark(c, "contact.shared");
  const b = c.spec.business;
  const labels: Record<string, string> = {
    name: "Your name",
    email: "Email",
    phone: "Phone",
    message: "How can we help?",
    service: "Service you need",
    date: "Preferred date",
  };
  const fields =
    s.layout === "booking-form" && !s.formFields.includes("date")
      ? [...s.formFields, "date" as const]
      : s.formFields;
  const field = (n: string) => {
    const fid = `${id}-${n}`;
    const inp =
      n === "message"
        ? `<textarea id="${fid}" name="message" rows="4" maxlength="2000" required></textarea>`
        : `<input id="${fid}" name="${n}" type="${n === "email" ? "email" : n === "phone" ? "tel" : n === "date" ? "date" : "text"}" maxlength="200"${n === "name" ? " required" : ""}>`;
    return `<label for="${fid}">${labels[n]}${inp}</label>`;
  };
  const form =
    s.form &&
    c.rc.formEndpoint &&
    s.layout !== "call-first" &&
    s.layout !== "whatsapp-first" &&
    s.layout !== "visit"
      ? `<form data-kora-form data-endpoint="${esc(c.rc.formEndpoint)}" data-success="Thank you. We have received your message." data-failure="Sorry, that did not send. Please use the contact details instead." method="post" action="${esc(c.rc.formEndpoint)}">${fields.map(field).join("")}<div class="hp" aria-hidden="true"><label>Leave empty<input name="website" tabindex="-1" autocomplete="off"></label></div><button class="btn" type="submit">${esc(s.submitLabel)}</button><p class="form-status" role="status" aria-live="polite"></p></form>`
      : "";
  const wa = waLink(c.spec, `Hello ${b.name}`);
  const tel = telLink(c.spec);
  let big = "";
  if (s.layout === "whatsapp-first" && wa)
    big = `<a class="big-link" href="${esc(wa)}">Message us on WhatsApp</a>`;
  else if (tel && (s.layout === "call-first" || !wa))
    big = `<a class="big-link" href="${esc(tel)}">${esc(b.phone ?? "")}</a>`;
  else if (wa)
    big = `<a class="big-link" href="${esc(wa)}">Message us on WhatsApp</a>`;
  const lines = [
    b.phone && big.indexOf(esc(b.phone)) < 0
      ? `<li>Call <a href="${esc(tel)}">${esc(b.phone)}</a></li>`
      : "",
    wa && big.indexOf("WhatsApp") < 0
      ? `<li><a class="btn wa" href="${esc(wa)}">Message on WhatsApp</a></li>`
      : "",
    b.email
      ? `<li><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>`
      : "",
    b.location ? `<li>${esc(b.location)}</li>` : "",
    ...b.hours.map((h) => `<li>${esc(h.days)} · ${esc(h.hours)}</li>`),
  ].join("");
  const left = `<div class="box rv"><p class="kick">${kickLabel.contact}</p><h2>${headline(s.heading, c)}</h2>${s.intro ? `<p class="lede">${esc(s.intro)}</p>` : ""}${big}<ul>${lines}</ul></div>`;
  return `${open("contact", tone)}<div class="w ct${form ? " two" : ""}">${left}${form ? `<div class="rv">${form}</div>` : ""}</div></section>`;
}

function faq(s: Sec<"faq">, c: Ctx, tone: Tone): string {
  mark(c, "faq.accordion");
  return `${open("faq", tone)}<div class="w">${head(c, "faq", s.heading, "", "", s.eyebrow)}<div class="fq rv">${s.items.map((q) => `<details><summary>${esc(q.question)}</summary><p>${esc(q.answer)}</p></details>`).join("")}</div></div></section>`;
}

function cta(s: Sec<"cta">, c: Ctx, tone: Tone): string {
  mark(c, `cta.${s.layout}`);
  const btn = `<div class="row">${link(s.button, c)}</div>`;
  if (s.layout === "marquee") {
    const words = (s.heading.split(/\s+/).slice(0, 6).join(" ") + " ").repeat(
      2,
    );
    return `<section class="sec t-${tone} cm" id="cta"><div class="tr" aria-hidden="true"><span>${esc(words)}</span><span>${esc(words)}</span></div><div class="w after"><h2 class="sr">${esc(s.heading)}</h2>${s.body ? `<p class="lede">${esc(s.body)}</p>` : ""}${btn}</div></section>`;
  }
  if (s.layout === "outline")
    return `${open("cta", tone)}<div class="w"><div class="co rv"><h2>${headline(s.heading, c)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ""}${btn}</div></div></section>`;
  return `${open("cta", tone, "cs")}<div class="w rv"><h2>${headline(s.heading, c)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ""}${btn}</div></section>`;
}

function ticker(s: Sec<"ticker">, c: Ctx): string {
  mark(c, "ticker.band");
  const run = s.items.map((x) => `<span>${esc(x)}</span>`).join("");
  return `<div class="tk" role="presentation"><div class="tr" aria-hidden="true">${run}${run}</div></div>`;
}
function statement(s: Sec<"statement">, c: Ctx, tone: Tone): string {
  mark(c, "statement.large");
  return `<section class="sec st t-${tone}" id="statement"><div class="w rv">${s.eyebrow ? `<p class="kick">${esc(s.eyebrow)}</p>` : ""}<p>${headline(s.text, c)}</p></div></section>`;
}

// ---------------------------------------------------------------- tones, header, footer
function toneFor(spec: SiteSpecV3, sections: SectionV3[], i: number): Tone {
  const g = spec.design.genome;
  const s = sections[i]!;
  const pb = g.paletteBehavior;
  const hero = (): Tone =>
    s.type === "hero" && s.layout === "cinematic"
      ? "dark"
      : pb === "color-field"
        ? "brand"
        : pb === "dark-field" || pb === "duotone"
          ? "dark"
          : pb === "soft-neutral"
            ? "alt"
            : "light";
  if (s.type === "hero") return hero();
  if (s.type === "cta")
    return pb === "color-field"
      ? "brand"
      : pb === "dark-field" || pb === "duotone"
        ? "dark"
        : "alt";
  const idx = sections
    .slice(0, i)
    .filter((x) => x.type !== "hero" && x.type !== "ticker").length;
  switch (g.sectionRhythm) {
    case "continuous":
    case "ruled":
      return "light";
    case "banded":
      return idx % 3 === 1
        ? pb === "color-field"
          ? "accent"
          : "alt"
        : idx % 3 === 2
          ? "light"
          : "light";
    default:
      return idx % 2 === 1 ? "alt" : "light";
  }
}

function navItems(spec: SiteSpecV3, from: string) {
  return spec.pages
    .filter((p) => p.slug !== "home")
    .map((p) => ({
      label: p.nav ?? p.title,
      href: relFrom(from, p.slug),
      current: p.slug === from,
    }));
}
function header(
  spec: SiteSpecV3,
  from: string,
  overlay: boolean,
  c: Ctx,
): string {
  const g = spec.design.genome;
  const items = navItems(spec, from);
  const bits = items.map(
    (x) =>
      `<li><a href="${esc(x.href)}"${x.current ? ' aria-current="page"' : ""}>${esc(x.label)}</a></li>`,
  );
  const cta = spec.business.whatsapp
    ? `<li><a class="btn" href="${esc(waLink(spec, `Hello ${spec.business.name}`))}">Message us</a></li>`
    : spec.business.phone
      ? `<li><a class="btn" href="${esc(telLink(spec))}">Call</a></li>`
      : "";
  const seal =
    g.signatureMotif === "monogram-seal"
      ? `<i class="seal" aria-hidden="true">${esc(c.letter)}</i>`
      : "";
  const style = overlay
    ? "overlay"
    : g.headerStyle === "overlay"
      ? "minimal-bar"
      : g.headerStyle;
  const mark = spec.business.logo
    ? `<img class="logo" src="${esc(spec.business.logo.url)}" alt="${esc(spec.business.logo.alt || spec.business.name)}" width="${spec.business.logo.width}" height="${spec.business.logo.height}">`
    : `${seal}${esc(spec.business.name)}`;
  const brand = `<a class="brand" href="${esc(relFrom(from, "home"))}">${mark}</a>`;
  const menu = `<details class="menu"><summary>Menu</summary><ul>${bits.join("")}${cta}</ul></details>`;
  const nav = `<ul class="nav-d" aria-label="Main">${bits.join("")}${cta}</ul>`;
  return `<header class="hd hs-${style} t-${style === "overlay" ? "dark" : "light"}"><div class="w bar">${brand}${nav}${menu}</div></header>`;
}
/** Every picture on the site that carries a structured credit, once each, in the order they appear. */
function creditedMedia(spec: SiteSpecV3) {
  const seen = new Set<string>();
  const out: Array<{
    name: string;
    creator: string;
    provider: string;
    providerUrl: string;
  }> = [];
  const take = (m: unknown) => {
    const p = m as
      | {
          url?: string;
          provenance?: {
            creatorName?: string;
            creatorUrl?: string;
            providerUrl?: string;
            provider?: string;
          };
        }
      | undefined;
    const pr = p?.provenance;
    if (
      !p?.url ||
      !pr?.creatorName ||
      !pr.creatorUrl ||
      !pr.providerUrl ||
      seen.has(p.url)
    )
      return;
    seen.add(p.url);
    out.push({
      name: pr.creatorName,
      creator: pr.creatorUrl,
      provider: pr.provider ?? "the photo provider",
      providerUrl: pr.providerUrl,
    });
  };
  for (const pg of spec.pages)
    for (const s of pg.sections) {
      const a = s as unknown as {
        media?: unknown;
        items?: Array<{ media?: unknown }>;
      };
      take(a.media);
      a.items?.forEach((it) => take(it.media));
    }
  return out;
}

function footer(spec: SiteSpecV3, from: string, c: Ctx): string {
  const b = spec.business;
  const g = spec.design.genome;
  const nav = navItems(spec, from);
  const contact = [
    b.phone && `<li><a href="${esc(telLink(spec))}">${esc(b.phone)}</a></li>`,
    b.whatsapp && `<li><a href="${esc(waLink(spec))}">WhatsApp</a></li>`,
    b.email && `<li><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>`,
    b.location && `<li>${esc(b.location)}</li>`,
    ...b.social.map(
      (l) =>
        `<li><a href="${esc(l.href)}" rel="noopener">${esc(l.label)}</a></li>`,
    ),
  ]
    .filter(Boolean)
    .join("");
  const hours = b.hours.length
    ? `<div><h4>Hours</h4><ul>${b.hours.map((h) => `<li>${esc(h.days)} · ${esc(h.hours)}</li>`).join("")}</ul></div>`
    : "";
  const exp = `<nav aria-label="Footer"><h4>Explore</h4><ul><li><a href="${esc(relFrom(from, "home"))}">Home</a></li>${nav.map((x) => `<li><a href="${esc(x.href)}">${esc(x.label)}</a></li>`).join("")}${spec.footer.links.map((l) => `<li><a href="${esc(href(l.href, from))}">${esc(l.label)}</a></li>`).join("")}</ul></nav>`;
  const reach = contact
    ? `<div><h4>Get in touch</h4><ul>${contact}</ul></div>`
    : "";
  const credits = creditedMedia(spec);
  // Pictures from Kora's catalogue stand in for the owner's own until they add theirs; the footer says so plainly.
  const illustrative = JSON.stringify(spec.pages).includes(
    '"reviewStatus":"kora-curated"',
  );
  const legal = `<p class="legal">${esc(spec.footer.text || `© ${b.name}`)}</p>${illustrative ? `<p class="legal credits">Photography on this site is illustrative.</p>` : ""}${credits.length ? `<p class="legal credits">Photos: ${credits.map((x) => `<a href="${esc(x.creator)}" rel="noopener noreferrer">${esc(x.name)}</a> on <a href="${esc(x.providerUrl)}" rel="noopener noreferrer">${esc(x.provider)}</a>`).join(", ")}</p>` : ""}`;
  const brand = `<div><a class="brand" href="${esc(relFrom(from, "home"))}">${esc(b.name)}</a></div>`;
  let body: string;
  if (g.footerStyle === "brand-heavy")
    body = `<div class="big" aria-hidden="true">${esc(b.name)}</div><div class="fg">${exp}${reach}${hours}</div>${legal}`;
  else if (g.footerStyle === "local-card")
    body = `<div class="lc"><div class="fg">${brand}${hours || exp}${reach}</div></div>${legal}`;
  else if (g.footerStyle === "columns")
    body = `<div class="fg">${brand}${exp}${reach}${hours}</div>${legal}`;
  else body = `<div class="fg">${brand}${exp}${reach}</div>${legal}`;
  void c;
  return `<footer class="ft t-${g.paletteBehavior === "dark-field" ? "dark" : "light"} fs-${g.footerStyle}"><div class="w">${body}</div></footer>`;
}
function dock(spec: SiteSpecV3): string {
  const g = spec.design.genome;
  if (!wantsDock(spec)) return "";
  const parts = [
    spec.business.phone
      ? `<a class="btn" href="${esc(telLink(spec))}">Call</a>`
      : "",
    spec.business.whatsapp
      ? `<a class="btn wa" href="${esc(waLink(spec, `Hello ${spec.business.name}`))}">WhatsApp</a>`
      : "",
  ].filter(Boolean);
  return parts.length
    ? `<div class="dock" role="navigation" aria-label="Quick contact">${parts.join("")}</div>`
    : "";
}

// ---------------------------------------------------------------- page + site
function sectionHtml(s: SectionV3, c: Ctx, tone: Tone, id: string): string {
  switch (s.type) {
    case "hero":
      return hero(s, c, tone);
    case "ticker":
      return ticker(s, c);
    case "statement":
      return statement(s, c, tone);
    case "offer":
      return offer(s, c, tone);
    case "products":
      return products(s, c, tone);
    case "story":
      return story(s, c, tone);
    case "process":
      return process(s, c, tone);
    case "gallery":
      return gallery(s, c, tone);
    case "proof":
      return proof(s, c, tone);
    case "visit":
      return visit(s, c, tone);
    case "contact":
      return contact(s, c, tone, id);
    case "faq":
      return faq(s, c, tone);
    case "cta":
      return cta(s, c, tone);
  }
}

export interface PageOut {
  html: string;
  used: Set<string>;
  focals: Set<string>;
}

export function renderPageV3(
  spec: SiteSpecV3,
  slug: string,
  rc: RenderContext,
  shared?: { used: Set<string>; focals: Set<string> },
): string {
  const page = spec.pages.find((p) => p.slug === slug)!;
  const root = slug === "home" ? "" : "../";
  const title =
    slug === "home" ? spec.seo.title : `${page.title} | ${spec.business.name}`;
  const fo = origin(rc.formEndpoint);
  const csp = `default-src 'none'; img-src 'self' https: data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src ${fo}; form-action ${fo}; base-uri 'none'`;
  const c: Ctx = {
    spec,
    rc,
    from: slug,
    used: shared?.used ?? new Set(),
    focals: shared?.focals ?? new Set(),
    heroSeen: false,
    quiet:
      spec.design.genome.accentScarcity === "rare" ||
      spec.design.genome.paletteBehavior === "soft-neutral",
    letter: (spec.business.name.trim()[0] ?? "K").toUpperCase(),
    stamp: "",
  };
  const firstOffer = page.sections.find((s) => s.type === "offer");
  const hero0 = page.sections[0];
  c.stamp =
    (hero0?.type === "hero" && hero0.highlights[0]) ||
    (firstOffer?.type === "offer" && firstOffer.items[0]?.title) ||
    spec.business.name;
  const overlay =
    hero0?.type === "hero" &&
    hero0.layout === "cinematic" &&
    spec.design.genome.headerStyle === "overlay";
  const body = page.sections
    .map((s, i) =>
      sectionHtml(s, c, toneFor(spec, page.sections, i), `${s.type}${i}`),
    )
    .join("\n");
  const g = spec.design.genome;
  const preload = voiceFiles(g.typeVoice)
    .slice(0, 2)
    .map(
      (f) =>
        `<link rel="preload" href="/_kora/fonts/${f}" as="font" type="font/woff2" crossorigin>`,
    )
    .join("\n");
  const desc = spec.seo.description;
  const canon = spec.seo.canonicalOrigin
    ? `${spec.seo.canonicalOrigin}${slug === "home" ? "/" : `/${slug}/`}`
    : "";
  const b = spec.business;
  // Social preview picture: only a real picture of this business (its hero photo, else its logo), by absolute URL.
  // With no such picture there is no og:image at all; a generated placeholder would misrepresent the business.
  const heroMedia =
    hero0?.type === "hero" && hero0.media?.url ? hero0.media : undefined;
  const absolute = (u: string) =>
    u.startsWith("https://")
      ? u
      : spec.seo.canonicalOrigin && u.startsWith("/")
        ? `${spec.seo.canonicalOrigin}${u}`
        : "";
  const og = heroMedia
    ? {
        url: absolute(heroMedia.url),
        alt: heroMedia.alt || b.name,
        width: heroMedia.width,
        height: heroMedia.height,
      }
    : b.logo?.url
      ? {
          url: absolute(b.logo.url),
          alt: `${b.name} logo`,
          width: b.logo.width,
          height: b.logo.height,
        }
      : null;
  const ogImage = og && og.url ? og : null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: b.name,
    ...(b.description ? { description: b.description.slice(0, 300) } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.email ? { email: b.email } : {}),
    ...(b.location ? { address: b.location } : {}),
    ...(b.logo ? { logo: b.logo.url } : {}),
    ...(ogImage ? { image: ogImage.url } : {}),
    ...(b.social.length
      ? {
          sameAs: b.social
            .map((l) => l.href)
            .filter((h) => h.startsWith("https://")),
        }
      : {}),
    ...(canon ? { url: canon } : {}),
  };
  const ldJson = JSON.stringify(ld).replace(/</g, "\\u003c");
  const hasDock = !!dock(spec);
  return `<!doctype html>
<html lang="${esc(spec.business.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
${rc.formEndpoint ? `<meta name="kora-events" content="${esc(rc.formEndpoint.replace(/\/forms$/, "/events"))}">\n` : ""}<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canon ? `<link rel="canonical" href="${esc(canon)}">\n<meta property="og:url" content="${esc(canon)}">\n` : ""}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:site_name" content="${esc(b.name)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage.url)}">\n<meta property="og:image:alt" content="${esc(ogImage.alt)}">\n${ogImage.width && ogImage.height ? `<meta property="og:image:width" content="${ogImage.width}">\n<meta property="og:image:height" content="${ogImage.height}">\n` : ""}` : ""}<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
<meta name="theme-color" content="${esc(spec.design.palette.background)}">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
${preload}
<link rel="stylesheet" href="${root}styles.css">
<script type="application/ld+json">${ldJson}</script>
</head>
<body class="${hasDock ? "has-dock" : ""}">
<a class="skip" href="#main">Skip to content</a>
${header(spec, slug, overlay, c)}
<main id="main">
${body}
</main>
${footer(spec, slug, c)}
${dock(spec)}
<script src="${root}site.js" defer></script>
</body>
</html>
`;
}

const favicon = (spec: SiteSpecV3) => {
  const p = spec.design.palette;
  const r = ["none", "slight"].includes(spec.design.genome.radiusStyle)
    ? 0
    : 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${r}" fill="${p.primary}"/><circle cx="48" cy="16" r="6" fill="${p.accent}"/><text x="30" y="46" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="${p.primaryForeground}">${esc((spec.business.name.trim()[0] ?? "K").toUpperCase())}</text></svg>\n`;
};

export function renderSiteV3(
  spec: SiteSpecV3,
  rc: RenderContext = {},
): SiteFiles {
  const files: SiteFiles = {};
  const shared = { used: new Set<string>(), focals: new Set<string>() };
  for (const page of spec.pages)
    files[pagePath(page.slug)] = renderPageV3(spec, page.slug, rc, shared);
  const g = spec.design.genome;
  const parts = [...shared.used]
    .sort()
    .map((k) => PARTS[k] ?? "")
    .join("\n");
  const fp = [...shared.focals]
    .sort()
    .map((k) => {
      const [x, y] = k.split("-");
      return `.fp-${k} img{object-position:${x}% ${y}%}`;
    })
    .join("");
  files["styles.css"] =
    `${baseCss(g, spec.design.palette, spec.design.mode)}\n${parts}\n${fp}\n`;
  files["site.js"] = SITE_JS_V2;
  files["favicon.svg"] = favicon(spec);
  return files;
}
