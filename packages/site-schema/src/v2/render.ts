import type { SiteFiles } from "../hash.js";
import {
  esc,
  origin,
  pagePath,
  relFrom,
  type RenderContext,
} from "../render.js";
import { artSvg } from "./art.js";
import { renderCssV2 } from "./css.js";
import { fontFilesFor } from "./fonts.js";
import { ICONS } from "./icons.js";
import type { Media, SectionV2, SiteSpecV2 } from "./spec.js";

type Sec<T extends SectionV2["type"]> = Extract<SectionV2, { type: T }>;
type Ctx = {
  spec: SiteSpecV2;
  rc: RenderContext;
  from: string;
  page: SiteSpecV2["pages"][number];
  i: number;
  tone: string;
  first: Set<string>;
};

export function icon(name: string | undefined, fallback = "check"): string {
  const body = ICONS[name ?? ""] ?? ICONS[fallback] ?? "";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
const hasIcon = (it: { icon?: string | undefined }) =>
  Boolean(it.icon && ICONS[it.icon]);
/** A matched pictogram when the title says what it is; otherwise a quiet index mark, never a random symbol. */
/** One consistent mark per set: pictograms only when every item has a real match, else index numbers. */
const markFor =
  (items: Array<{ icon?: string | undefined }>) =>
  (it: { icon?: string | undefined }, n: number) =>
    items.every(hasIcon) ? icon(it.icon) : `<span class="mk">${num(n)}</span>`;

function href(h: string, from: string): string {
  return h.startsWith("/") ? relFrom(from, h === "/" ? "home" : h.slice(1)) : h;
}
function a(
  l: { label: string; href: string } | undefined,
  cls: string,
  from: string,
  withArrow = true,
): string {
  if (!l) return "";
  return `<a class="${cls}" href="${esc(href(l.href, from))}">${esc(l.label)}${withArrow ? icon("arrow-right") : ""}</a>`;
}
function visual(
  c: Ctx,
  media: Media | undefined,
  variant: number,
  ratio: "wide" | "tall" | "square" = "wide",
): string {
  if (media)
    return `<img src="${esc(media.url)}" alt="${esc(media.alt)}"${media.width ? ` width="${media.width}"` : ""}${media.height ? ` height="${media.height}"` : ""} loading="lazy" decoding="async"${media.focalPoint ? ` class="fp-${media.focalPoint.x < 0.34 ? "l" : media.focalPoint.x > 0.66 ? "r" : "c"}${media.focalPoint.y < 0.34 ? "t" : media.focalPoint.y > 0.66 ? "b" : "m"}"` : ""}>`;
  return artSvg(c.spec.design, variant, ratio);
}
const head = (
  c: Ctx,
  id: string,
  eyebrow: string | undefined,
  h: string,
  intro?: string,
  tag = "h2",
) =>
  `<div class="sec-head rv">${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}<${tag} id="${id}">${esc(h)}</${tag}>${intro ? `<p class="lead gap">${esc(intro)}</p>` : ""}</div>`;
const num = (n: number) => String(n + 1).padStart(2, "0");

function open(c: Ctx, s: SectionV2, cls: string, extra = ""): string {
  const anchor = !c.first.has(s.type);
  c.first.add(s.type);
  return `<section${anchor ? ` id="${s.type}"` : ""} class="sec ${cls} v-${esc(s.variant)}${c.tone ? ` tone-${c.tone}` : ""}" aria-labelledby="h${c.i}"${extra}>`;
}

/* ---------- hero ---------- */
function hero(s: Sec<"hero">, c: Ctx): string {
  const b = c.spec.business;
  const id = `h${c.i}`;
  const hl = s.highlights.length
    ? `<ul class="hl">${s.highlights.map((x) => `<li>${icon("check")}${esc(x)}</li>`).join("")}</ul>`
    : "";
  const ctas =
    s.primaryCta || s.secondaryCta
      ? `<div class="cta-row">${a(s.primaryCta, "btn", c.from)}${a(s.secondaryCta, "btn alt", c.from, false)}</div>`
      : "";
  const text = (extra = "") =>
    `${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ""}<h1 id="${id}"${s.heading.length > 78 ? ' class="h-xl"' : s.heading.length > 44 ? ' class="h-long"' : ""}>${esc(s.heading)}</h1>${s.subheading ? `<p class="lead">${esc(s.subheading)}</p>` : ""}${extra}${ctas}`;
  const banner = s.media
    ? `<div class="banner">${visual(c, s.media, 1)}</div>`
    : "";
  const wrapOpen = `<section class="sec hero v-${s.variant}" aria-labelledby="${id}">`;
  switch (s.variant) {
    case "split-art":
    case "media-left":
      return `${wrapOpen}<div class="wrap split"><div class="rv">${text()}${hl}</div><div class="art-slot rv">${visual(c, s.media, 1, "tall")}</div></div></section>`;
    case "full-bleed":
      return `${wrapOpen}<div class="bg">${visual(c, s.media, 2)}</div><div class="wrap">${text()}${hl}</div></section>`;
    case "bento": {
      const tiles = s.highlights.slice(0, 2);
      return `${wrapOpen}<div class="wrap"><div class="rv">${text()}</div><div class="grid"><div class="big">${visual(c, s.media, 1, "tall")}</div>${tiles.map((t) => `<div class="tile">${esc(t)}</div>`).join("")}<div>${visual(c, undefined, 3, "square")}</div></div></div></section>`;
    }
    case "collage":
      return `${wrapOpen}<div class="wrap split"><div class="rv">${text()}${hl}</div><div class="stack rv"><div class="a">${visual(c, s.media, 1, "tall")}</div><div class="b">${visual(c, undefined, 4, "square")}</div></div></div></section>`;
    case "local-service": {
      const quick = [
        b.phone
          ? `<a href="tel:${esc(b.phone)}">${icon("phone")}Call ${esc(b.phone)}</a>`
          : "",
        b.whatsapp
          ? `<a href="https://wa.me/${esc(b.whatsapp.replace(/^\+/, ""))}">${icon("message-circle")}WhatsApp us</a>`
          : "",
        b.location
          ? `<span class="qrow strong">${icon("map-pin")}${esc(b.location)}</span>`
          : "",
        b.hours[0]
          ? `<span class="qrow soft">${icon("clock")}${esc(b.hours[0].days)}: ${esc(b.hours[0].hours)}</span>`
          : "",
      ].filter(Boolean);
      if (s.media)
        // A real photograph leads; the contact card moves under the headline so it is never hidden.
        return `${wrapOpen}<div class="wrap split"><div class="rv">${text()}${quick.length ? `<div class="quick rv">${quick.join("")}</div>` : ""}</div><div class="art-slot rv">${visual(c, s.media, 1)}</div></div></section>`;
      return `${wrapOpen}<div class="wrap split"><div class="rv">${text()}${hl}</div>${quick.length ? `<div class="quick rv">${quick.join("")}</div>` : `<div class="art-slot rv">${visual(c, s.media, 1)}</div>`}</div></section>`;
    }
    case "portfolio":
      return `${wrapOpen}<div class="wrap"><div class="rv">${text()}</div><div class="reel">${[0, 1, 2].map((n) => `<div>${visual(c, n === 0 ? s.media : undefined, n + 1, "tall")}</div>`).join("")}</div></div></section>`;
    case "product":
      return `${wrapOpen}<div class="wrap"><div class="rv narrow">${text()}</div><div class="shot"><div class="chrome"><i></i><i></i><i></i></div><div class="body">${visual(c, s.media, 2)}</div></div></div></section>`;
    case "luxury":
      return `${wrapOpen}<div class="wrap"><div class="rule"></div>${text()}${banner}</div></section>`;
    case "minimal-statement":
      return `${wrapOpen}<div class="wrap">${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ""}<h1 id="${id}">${esc(s.heading)}</h1><div class="row">${s.subheading ? `<p class="lead">${esc(s.subheading)}</p>` : "<span></span>"}<div class="cta-row flush">${a(s.primaryCta, "btn", c.from)}${a(s.secondaryCta, "btn alt", c.from, false)}</div></div></div></section>`;
    case "stacked-story":
      return `${wrapOpen}<div class="wrap">${text()}${s.highlights.length ? `<div class="rail">${s.highlights.map((h, n) => `<div><span class="num">${num(n)}</span><span>${esc(h)}</span></div>`).join("")}</div>` : ""}</div></section>`;
    case "editorial-centered":
    default:
      return `${wrapOpen}<div class="wrap rv">${text()}${hl}${banner}</div></section>`;
  }
}

/* ---------- body sections ---------- */
function trust(s: Sec<"trust">): string {
  return `<section class="trust v-${s.variant}" aria-label="${esc(s.heading || "Why choose us")}"><div class="wrap"><ul>${s.heading ? `<li class="tl">${esc(s.heading)}</li>` : ""}${s.items.map((t) => `<li>${s.variant === "credentials" ? "" : icon("check")}${esc(t)}</li>`).join("")}</ul></div></section>`;
}

function services(s: Sec<"services">, c: Ctx): string {
  const id = `h${c.i}`;
  const hd = head(c, id, undefined, s.heading, s.intro);
  const o = open(c, s, "services");
  switch (s.variant) {
    case "list":
    case "editorial-list":
      return `${o}<div class="wrap">${hd}<div class="list rv">${s.items.map((it, n) => `<div><span class="n">${num(n)}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div>`).join("")}</div></div></section>`;
    case "numbered":
      return `${o}<div class="wrap">${hd}<div class="cards rv">${s.items.map((it, n) => `<article class="card"><span class="n">${num(n)}</span><h3 class="m0">${esc(it.title)}</h3><p>${esc(it.text)}</p></article>`).join("")}</div></div></section>`;
    case "image-cards":
      return `${o}<div class="wrap">${hd}<div class="cards rv">${s.items.map((it, n) => `<article class="card"><div class="thumb">${visual(c, it.media, n + 2)}</div><div class="tx"><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div></article>`).join("")}</div></div></section>`;
    case "split":
      return `${o}<div class="wrap split">${hd}<div class="acc rv">${s.items.map((it) => `<details><summary>${esc(it.title)}</summary><p>${esc(it.text)}</p></details>`).join("")}</div></div></section>`;
    case "accordion":
      return `${o}<div class="wrap">${hd}<div class="acc rv">${s.items.map((it, n) => `<details${n === 0 ? " open" : ""}><summary>${esc(it.title)}</summary><p>${esc(it.text)}</p></details>`).join("")}</div></div></section>`;
    case "grid":
    default:
      return `${o}<div class="wrap">${hd}<div class="cards rv">${s.items.map((it, n) => `<article class="card"><div class="ico">${markFor(s.items)(it, n)}</div><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></article>`).join("")}</div></div></section>`;
  }
}

function features(s: Sec<"features">, c: Ctx): string {
  const id = `h${c.i}`;
  const hd = head(c, id, undefined, s.heading, s.intro);
  const o = open(c, s, "feat");
  switch (s.variant) {
    case "statements":
      return `${o}<div class="wrap">${hd}<div class="st rv">${s.items.map((it) => `<div><h3>${esc(it.title)}</h3><p class="lead">${esc(it.text)}</p></div>`).join("")}</div></div></section>`;
    case "alternating":
      return `${o}<div class="wrap">${hd}${s.items.map((it, n) => `<div class="alt-row rv"><div><h3 class="h3-lg">${esc(it.title)}</h3><p class="lead gap">${esc(it.text)}</p></div><div class="frame">${visual(c, it.media, n + 1)}</div></div>`).join("")}</div></section>`;
    case "bento":
      return `${o}<div class="wrap">${hd}<div class="bento rv">${s.items
        .slice(0, 5)
        .map(
          (it, n) =>
            `<article class="card"><div class="ico">${markFor(s.items)(it, n)}</div><h3 class="mt">${esc(it.title)}</h3><p>${esc(it.text)}</p></article>`,
        )
        .join("")}</div></div></section>`;
    case "icon-led":
    default:
      return `${o}<div class="wrap">${hd}<div class="cards rv">${s.items.map((it, n) => `<article class="card"><div class="ico">${markFor(s.items)(it, n)}</div><h3 class="mt">${esc(it.title)}</h3><p>${esc(it.text)}</p></article>`).join("")}</div></div></section>`;
  }
}

function about(s: Sec<"about">, c: Ctx): string {
  const id = `h${c.i}`;
  const body = `<div class="body">${s.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>${s.values.length ? `<ul class="vals">${s.values.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : ""}`;
  const o = open(c, s, "about");
  switch (s.variant) {
    case "mission":
      return `${o}<div class="wrap rv"><h2 id="${id}">${esc(s.heading)}</h2>${body}</div></section>`;
    case "editorial":
      return `${o}<div class="wrap split rv"><h2 id="${id}">${esc(s.heading)}</h2><div>${body}</div></div></section>`;
    case "values":
      return `${o}<div class="wrap rv"><h2 id="${id}" class="mb">${esc(s.heading)}</h2>${body}</div></section>`;
    case "image-text":
    default:
      return `${o}<div class="wrap split"><div class="frame rv">${visual(c, s.media, 3, "tall")}</div><div class="rv"><h2 id="${id}" class="mb">${esc(s.heading)}</h2>${body}</div></div></section>`;
  }
}

function process(s: Sec<"process">, c: Ctx): string {
  const id = `h${c.i}`;
  return `${open(c, s, `process n${Math.min(s.items.length, 4)}`)}<div class="wrap">${head(c, id, undefined, s.heading, s.intro)}<ol class="steps rv">${s.items.map((it) => `<li class="step"><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></li>`).join("")}</ol></div></section>`;
}

function portfolio(s: Sec<"portfolio">, c: Ctx): string {
  const id = `h${c.i}`;
  const item = (it: Sec<"portfolio">["items"][number], n: number) =>
    `<article class="it"><div class="frame">${visual(c, it.media, n + 1)}</div><div class="t"><h3>${esc(it.title)}</h3>${it.tag ? `<span class="pill">${esc(it.tag)}</span>` : ""}</div>${it.text ? `<p>${esc(it.text)}</p>` : ""}</article>`;
  if (s.variant === "list")
    return `${open(c, s, "portfolio")}<div class="wrap">${head(c, id, undefined, s.heading, s.intro)}<div class="list rv">${s.items.map((it, n) => `<div><span class="n">${num(n)}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}${it.tag ? ` · ${esc(it.tag)}` : ""}</p></div>`).join("")}</div></div></section>`;
  if (s.variant === "featured") {
    const [first, ...rest] = s.items;
    return `${open(c, s, "portfolio")}<div class="wrap">${head(c, id, undefined, s.heading, s.intro)}<div class="feat1 rv">${item(first!, 0)}</div><div class="pf rv">${rest.map((it, n) => item(it, n + 1)).join("")}</div></div></section>`;
  }
  return `${open(c, s, "portfolio")}<div class="wrap">${head(c, id, undefined, s.heading, s.intro)}<div class="pf rv">${s.items.map(item).join("")}</div></div></section>`;
}

function testimonials(s: Sec<"testimonials">, c: Ctx): string {
  const id = `h${c.i}`;
  const hd = s.heading
    ? head(c, id, undefined, s.heading)
    : `<h2 id="${id}" class="sr">Testimonials</h2>`;
  const who = (t: Sec<"testimonials">["items"][number]) =>
    `<figcaption class="who"><b>${esc(t.author)}</b>${t.role ? esc(t.role) : ""}</figcaption>`;
  const o = open(c, s, "testi");
  if (s.variant === "grid")
    return `${o}<div class="wrap">${hd}<div class="cards rv">${s.items.map((t) => `<figure class="card m0"><blockquote class="m0"><p class="qt">&ldquo;${esc(t.quote)}&rdquo;</p></blockquote>${who(t)}</figure>`).join("")}</div></div></section>`;
  if (s.variant === "stacked")
    return `${o}<div class="wrap">${hd}<div class="stk rv">${s.items.map((t) => `<figure><blockquote class="quote m0">&ldquo;${esc(t.quote)}&rdquo;</blockquote>${who(t)}</figure>`).join("")}</div></div></section>`;
  const t = s.items[0]!;
  return `${o}<div class="wrap">${hd}<figure class="spot rv m0"><blockquote class="quote m0">${esc(t.quote)}</blockquote>${who(t)}</figure></div></section>`;
}

function team(s: Sec<"team">, c: Ctx): string {
  const id = `h${c.i}`;
  return `${open(c, s, "team")}<div class="wrap">${head(c, id, undefined, s.heading)}<div class="${s.variant === "list" ? "" : "cards "}rv">${s.items.map((m, n) => `<article class="tm">${s.variant === "cards" ? `<div class="frame ph">${artSvg(c.spec.design, n + 5, "square")}</div>` : ""}<h3>${esc(m.name)}</h3><p>${esc(m.role)}${m.bio ? ` — ${esc(m.bio)}` : ""}</p></article>`).join("")}</div></div></section>`;
}

function pricing(s: Sec<"pricing">, c: Ctx): string {
  const id = `h${c.i}`;
  return `${open(c, s, "pricing")}<div class="wrap">${head(c, id, undefined, s.heading, s.intro)}<div class="tiers rv">${s.tiers
    .map(
      (t) =>
        `<article class="card tier${t.featured && s.variant !== "minimal" ? " featured" : ""}"><h3>${esc(t.name)}</h3><div class="price">${esc(t.price)}</div>${t.description ? `<p>${esc(t.description)}</p>` : ""}${t.features.length ? `<ul>${t.features.map((f) => `<li>${icon("check")}<span>${esc(f)}</span></li>`).join("")}</ul>` : ""}${a(t.cta, "btn", c.from)}</article>`,
    )
    .join("")}</div></div></section>`;
}

function stats(s: Sec<"stats">, c: Ctx): string {
  const id = `h${c.i}`;
  const hd = s.heading
    ? head(c, id, undefined, s.heading)
    : `<h2 id="${id}" class="sr">Highlights</h2>`;
  return `${open(c, s, "stats")}<div class="wrap">${hd}<dl class="sg rv m0">${s.items.map((i) => `<div><dd class="big m0">${esc(i.value)}</dd><dt class="lbl">${esc(i.label)}</dt></div>`).join("")}</dl></div></section>`;
}

function faq(s: Sec<"faq">, c: Ctx): string {
  const id = `h${c.i}`;
  const list = `<div class="acc rv">${s.items.map((q) => `<details><summary>${esc(q.question)}</summary><p>${esc(q.answer)}</p></details>`).join("")}</div>`;
  return `${open(c, s, "faq")}<div class="wrap${s.variant === "split" ? " split" : ""}">${head(c, id, undefined, s.heading)}${list}</div></section>`;
}

function contact(s: Sec<"contact">, c: Ctx): string {
  const b = c.spec.business;
  const id = `h${c.i}`;
  const waLink = b.whatsapp
    ? `https://wa.me/${b.whatsapp.replace(/^\+/, "")}`
    : "";
  const mapLink = b.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.location)}`
    : "";
  const items = [
    b.phone
      ? `<li>${icon("phone")}<span><small>Phone</small><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></span></li>`
      : "",
    b.whatsapp
      ? `<li>${icon("message-circle")}<span><small>WhatsApp</small><a href="${esc(waLink)}">${esc(b.whatsapp)}</a></span></li>`
      : "",
    b.email
      ? `<li>${icon("mail")}<span><small>Email</small><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></span></li>`
      : "",
    b.location
      ? `<li>${icon("map-pin")}<span><small>Find us</small><a href="${esc(mapLink)}">${esc(b.location)}</a></span></li>`
      : "",
    ...(s.variant === "local"
      ? b.hours.map(
          (h) =>
            `<li>${icon("clock")}<span><small>${esc(h.days)}</small>${esc(h.hours)}</span></li>`,
        )
      : []),
  ].filter(Boolean);
  const details = items.length
    ? `<ul class="cdetails">${items.join("")}</ul>`
    : "";
  const fields =
    s.variant === "booking" && !s.formFields.includes("date")
      ? [...s.formFields, "date" as const]
      : s.formFields;
  const labels: Record<string, string> = {
    name: "Your name",
    email: "Email",
    phone: "Phone",
    message: "How can we help?",
    service: "Service you need",
    date: "Preferred date",
  };
  const field = (n: string) => {
    const fid = `${id}-${n}`;
    const inp =
      n === "message"
        ? `<textarea id="${fid}" name="message" rows="4" maxlength="2000" required></textarea>`
        : `<input id="${fid}" name="${n}" type="${n === "email" ? "email" : n === "phone" ? "tel" : n === "date" ? "date" : "text"}" maxlength="200"${n === "name" ? " required" : ""}>`;
    return `<label for="${fid}">${labels[n]}${inp}</label>`;
  };
  const form =
    s.form && c.rc.formEndpoint
      ? `<form data-kora-form data-endpoint="${esc(c.rc.formEndpoint)}" data-success="Thank you. We have received your message." data-failure="Sorry, that did not send. Please use the contact details instead." method="post" action="${esc(c.rc.formEndpoint)}">${fields.map(field).join("")}<div class="hp" aria-hidden="true"><label>Leave empty<input name="website" tabindex="-1" autocomplete="off"></label></div><button class="btn" type="submit">${esc(s.submitLabel)}</button><p class="form-status" role="status" aria-live="polite"></p></form>`
      : "";
  const wa =
    s.variant === "whatsapp" && waLink
      ? `<div class="cta-row"><a class="btn wa" href="${esc(waLink)}">${icon("message-circle")}Chat on WhatsApp</a></div>`
      : "";
  const intro = head(c, id, undefined, s.heading, s.intro);
  const o = open(c, s, "contact");
  if (s.variant === "conversion" || (!form && !details))
    return `${o}<div class="wrap">${intro}${wa}${details}${form ? `<div class="cform">${form}</div>` : ""}</div></section>`;
  return `${o}<div class="wrap split"><div>${intro}${wa}${details}</div>${form ? `<div class="rv">${form}</div>` : ""}</div></section>`;
}

function cta(s: Sec<"cta">, c: Ctx): string {
  const id = `h${c.i}`;
  const inner = `<div><h2 id="${id}">${esc(s.heading)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ""}</div>${a(s.button, "btn", c.from)}`;
  const o = open(c, s, "cta").replace(/ tone-\w+/, "");
  if (s.variant === "big-type")
    return `${o}<div class="wrap rv"><h2 id="${id}">${esc(s.heading)}</h2>${s.body ? `<p class="lead">${esc(s.body)}</p>` : ""}${a(s.button, "btn", c.from)}</div></section>`;
  return `${o}<div class="wrap rv"><div class="cta-band">${inner}</div></div></section>`;
}

function section(s: SectionV2, c: Ctx): string {
  switch (s.type) {
    case "hero":
      return hero(s, c);
    case "trust":
      return trust(s);
    case "services":
      return services(s, c);
    case "features":
      return features(s, c);
    case "about":
      return about(s, c);
    case "process":
      return process(s, c);
    case "portfolio":
      return portfolio(s, c);
    case "testimonials":
      return testimonials(s, c);
    case "team":
      return team(s, c);
    case "pricing":
      return pricing(s, c);
    case "stats":
      return stats(s, c);
    case "faq":
      return faq(s, c);
    case "contact":
      return contact(s, c);
    case "cta":
      return cta(s, c);
  }
}

/** Alternating background rhythm so long pages do not read as one flat sheet. */
function tones(page: SiteSpecV2["pages"][number]): string[] {
  let n = 0;
  return page.sections.map((s) => {
    if (s.type === "hero" || s.type === "trust" || s.type === "cta") return "";
    if (s.type === "stats") return "primary";
    n++;
    return n % 2 === 0 ? "muted" : "";
  });
}

/* ---------- chrome ---------- */
const ANCHOR_LABEL: Partial<Record<SectionV2["type"], string>> = {
  services: "Services",
  about: "About",
  process: "Process",
  portfolio: "Work",
  pricing: "Pricing",
  team: "Team",
  testimonials: "Reviews",
  faq: "FAQ",
};
function navItems(spec: SiteSpecV2, from: string) {
  if (spec.pages.length === 1) {
    // One-page sites navigate by section so the header is never empty.
    const seen = new Set<string>();
    return spec.pages[0]!.sections.flatMap((s) => {
      const label = ANCHOR_LABEL[s.type];
      if (!label || seen.has(s.type)) return [];
      seen.add(s.type);
      return [{ label, slug: "", href: `#${s.type}` }];
    });
  }
  return spec.pages
    .filter((p) => p.nav !== "")
    .map((p) => ({
      label: p.nav ?? p.title,
      slug: p.slug,
      href: relFrom(from, p.slug),
    }));
}
function header(spec: SiteSpecV2, from: string): string {
  const items = navItems(spec, from);
  const homeHasContact = spec.pages
    .find((p) => p.slug === "home")
    ?.sections.some((s) => s.type === "contact");
  const contactHref = homeHasContact
    ? from === "home"
      ? "#contact"
      : `${relFrom(from, "home")}#contact`
    : "";
  const li = (x: (typeof items)[number]) =>
    `<li><a href="${esc(x.href)}"${x.slug === from ? ' aria-current="page"' : ""}>${esc(x.label)}</a></li>`;
  const cta = contactHref
    ? `<li><a class="nav-cta" href="${esc(contactHref)}">Contact</a></li>`
    : "";
  const brand = `<a class="brand" href="${esc(relFrom(from, "home"))}"><i></i>${esc(spec.business.name)}</a>`;
  const v = spec.design.nav;
  const menu = `<details class="menu"><summary>Menu</summary><ul>${items.map(li).join("")}${cta}</ul></details>`;
  const desk = (list: string[], cls = "") =>
    `<ul class="links d ${cls}" aria-label="Main">${list.join("")}</ul>`;
  let inner: string;
  if (v === "split") {
    const mid = Math.ceil(items.length / 2);
    inner = `${desk(items.slice(0, mid).map(li), "l")}${brand}${desk([...items.slice(mid).map(li), cta], "r")}${menu}`;
  } else inner = `${brand}${desk([...items.map(li), cta])}${menu}`;
  return `<header class="site nav-${v}"><div class="wrap bar">${inner}</div></header>`;
}
function footer(spec: SiteSpecV2, from: string): string {
  const b = spec.business;
  const v = spec.design.footer;
  const items = navItems(spec, from);
  const contact = [
    b.phone && `<li><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></li>`,
    b.email && `<li><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>`,
    b.location && `<li>${esc(b.location)}</li>`,
  ]
    .filter(Boolean)
    .join("");
  const soc = spec.business.social
    .map(
      (l) =>
        `<li><a href="${esc(l.href)}" rel="noopener">${esc(l.label)}</a></li>`,
    )
    .join("");
  const links = spec.footer.links
    .map(
      (l) =>
        `<li><a href="${esc(href(l.href, from))}">${esc(l.label)}</a></li>`,
    )
    .join("");
  const brand = `<div><a class="brand" href="${esc(relFrom(from, "home"))}"><i></i>${esc(b.name)}</a>${b.description ? `<p class="fdesc">${esc(b.description.slice(0, 140))}</p>` : ""}</div>`;
  const legal = `<p class="legal">${esc(spec.footer.text || `© ${b.name}`)}</p>`;
  const nav = `<nav aria-label="Footer"><h4>Explore</h4><ul>${items.map((x) => `<li><a href="${esc(x.href)}">${esc(x.label)}</a></li>`).join("")}${links}</ul></nav>`;
  const reach =
    contact || soc
      ? `<div><h4>Get in touch</h4><ul>${contact}${soc}</ul></div>`
      : "";
  const hours = b.hours.length
    ? `<div><h4>Opening hours</h4><ul>${b.hours.map((h) => `<li>${esc(h.days)} · ${esc(h.hours)}</li>`).join("")}</ul></div>`
    : "";
  let body: string;
  if (v === "minimal") body = `<div class="fg">${brand}${nav}</div>${legal}`;
  else if (v === "brand-heavy")
    body = `<div class="big" aria-hidden="true">${esc(b.name)}</div><div class="fg">${nav}${reach}</div>${legal}`;
  else if (v === "local")
    body = `<div class="fg">${brand}${hours || nav}${reach}</div>${legal}`;
  else body = `<div class="fg">${brand}${nav}${reach}</div>${legal}`;
  return `<footer class="site v-${v}"><div class="wrap">${body}</div></footer>`;
}

function stickyCta(spec: SiteSpecV2): string {
  const b = spec.business;
  const home = spec.pages.find((p) => p.slug === "home");
  if (
    home?.sections[0]?.type !== "hero" ||
    home.sections[0].variant !== "local-service"
  )
    return "";
  const parts = [
    b.phone
      ? `<a class="btn" href="tel:${esc(b.phone)}">${icon("phone")}Call</a>`
      : "",
    b.whatsapp
      ? `<a class="btn accent" href="https://wa.me/${esc(b.whatsapp.replace(/^\+/, ""))}">${icon("message-circle")}WhatsApp</a>`
      : "",
  ].filter(Boolean);
  return parts.length ? `<div class="sticky-cta">${parts.join("")}</div>` : "";
}

export function renderPageV2(
  spec: SiteSpecV2,
  slug: string,
  rc: RenderContext,
): string {
  const page = spec.pages.find((p) => p.slug === slug)!;
  const root = slug === "home" ? "" : "../";
  const title =
    slug === "home" ? spec.seo.title : `${page.title} | ${spec.business.name}`;
  const fo = origin(rc.formEndpoint);
  const csp = `default-src 'none'; img-src 'self' https: data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src ${fo}; form-action ${fo}; base-uri 'none'`;
  const toneList = tones(page);
  const first = new Set<string>();
  const sticky = stickyCta(spec);
  const body = page.sections
    .map((s, i) =>
      section(s, {
        spec,
        rc,
        from: slug,
        page,
        i,
        tone: toneList[i] ?? "",
        first,
      }),
    )
    .join("\n");
  const preload = fontFilesFor(spec.design.typography.pairing)
    .slice(0, 2)
    .map(
      (f) =>
        `<link rel="preload" href="/_kora/fonts/${f}" as="font" type="font/woff2" crossorigin>`,
    )
    .join("\n");
  const desc = spec.seo.description;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
${rc.formEndpoint ? `<meta name="kora-events" content="${esc(rc.formEndpoint.replace(/\/forms$/, "/events"))}">\n` : ""}<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${spec.seo.keywords.length ? `<meta name="keywords" content="${esc(spec.seo.keywords.join(", "))}">\n` : ""}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:site_name" content="${esc(spec.business.name)}">
<meta name="theme-color" content="${esc(spec.design.palette.background)}">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
${preload}
<link rel="stylesheet" href="${root}styles.css">
</head>
<body${sticky ? ' class="has-sticky"' : ""}>
<a class="skip" href="#main">Skip to content</a>
${header(spec, slug)}
<main id="main">
${body}
</main>
${footer(spec, slug)}
${sticky}
<script src="${root}site.js" defer></script>
</body>
</html>
`;
}

/**
 * v2 sites only (v1 output stays byte-identical). Measures nothing about visitors in general: it acts only when a
 * visitor arrived through a Kora-tracked link (?k=<8 letters>), remembers that code for the tab session, and reports
 * three things to Kora: the landing, a tap on a call or WhatsApp link, and that code on an enquiry form.
 */
export const SITE_JS_V2 = `(function(){
  var m=document.querySelector('meta[name="kora-events"]'),ev=m&&m.getAttribute('content');
  var q=null;try{q=new URLSearchParams(location.search).get('k')}catch(e){}
  if(q&&!/^[a-z]{8}$/.test(q))q=null;
  try{if(q)sessionStorage.setItem('kora_k',q)}catch(e){}
  var k=q;try{k=k||sessionStorage.getItem('kora_k')}catch(e){}
  function send(t){if(!ev||!k)return;try{navigator.sendBeacon(ev,JSON.stringify({k:k,t:t}))}catch(e){}}
  if(q)send('visit');
  document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';if(/^tel:/i.test(h))send('call');else if(/(^|\\/\\/)(wa\\.me|api\\.whatsapp\\.com|wa\\.link)/i.test(h))send('whatsapp')},true);
  var forms=document.querySelectorAll('form[data-kora-form]');
  Array.prototype.forEach.call(forms,function(form){
    form.addEventListener('submit',function(ev2){
      ev2.preventDefault();
      var status=form.querySelector('.form-status');
      var data={};
      new FormData(form).forEach(function(v,key){data[key]=String(v)});
      if(k)data.k=k;
      status.textContent='Sending\\u2026';
      fetch(form.getAttribute('data-endpoint'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
        .then(function(r){if(!r.ok)throw new Error('failed');status.textContent=form.getAttribute('data-success');form.reset();})
        .catch(function(){status.textContent=form.getAttribute('data-failure');});
    });
  });
})();
`;

const faviconV2 = (spec: SiteSpecV2) => {
  const p = spec.design.palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${spec.design.shape === "sharp" ? 0 : 16}" fill="${p.primary}"/><circle cx="46" cy="18" r="6" fill="${p.accent}"/><text x="30" y="46" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="${p.primaryForeground}">${esc((spec.business.name.trim()[0] ?? "K").toUpperCase())}</text></svg>\n`;
};

export function renderSiteV2(
  spec: SiteSpecV2,
  rc: RenderContext = {},
): SiteFiles {
  const files: SiteFiles = {
    "styles.css": renderCssV2(spec.design),
    "site.js": SITE_JS_V2,
    "favicon.svg": faviconV2(spec),
  };
  for (const page of spec.pages)
    files[pagePath(page.slug)] = renderPageV2(spec, page.slug, rc);
  return files;
}
