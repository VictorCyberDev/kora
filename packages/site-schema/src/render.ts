import { hashFiles, type SiteFiles } from "./hash.js";
import type { Section, SiteSpec } from "./spec.js";

export interface RenderContext {
  /** Absolute URL that accepts contact form POSTs. Without it the contact
   * section shows direct contact links only (never a dead form). */
  formEndpoint?: string;
  siteId?: string;
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
/** Escape for HTML text and double-quoted attribute values. */
export const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ESC[c]!);

const FONT: Record<SiteSpec["brand"]["typography"], string> = {
  modern:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  classic: 'Georgia, "Times New Roman", Times, serif',
  friendly: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
};
const RADIUS = { none: "0", soft: "10px", round: "22px" } as const;

/** Readable foreground (black/white) on a hex background, WCAG luminance. */
export function contrastOn(hex: string): "#ffffff" | "#111827" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111827" : "#ffffff";
}

export function renderCss(spec: SiteSpec): string {
  const { primaryColor: p, accentColor: a, typography, radius } = spec.brand;
  return `:root{--primary:${p};--on-primary:${contrastOn(p)};--accent:${a};--on-accent:${contrastOn(a)};--radius:${RADIUS[radius]};--font:${FONT[typography]};--ink:#16202e;--muted:#4b5563;--line:#e3e7ee;--bg:#ffffff;--soft:#f5f7fb}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:var(--font);color:var(--ink);background:var(--bg);line-height:1.6;font-size:17px}
img{max-width:100%;height:auto}a{color:var(--primary)}
.skip{position:absolute;left:-999px;top:0;background:#fff;padding:8px 12px;z-index:10}.skip:focus{left:8px;top:8px}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.site{border-bottom:1px solid var(--line);background:#fff;position:sticky;top:0;z-index:5}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;flex-wrap:wrap}
.brand{font-weight:700;font-size:1.15rem;color:var(--ink);text-decoration:none}
nav ul{list-style:none;display:flex;gap:6px;margin:0;padding:0;flex-wrap:wrap}
nav a{display:inline-block;padding:8px 12px;border-radius:var(--radius);text-decoration:none;color:var(--ink)}
nav a:hover,nav a[aria-current=page]{background:var(--soft)}
section{padding:56px 0}section:nth-of-type(even){background:var(--soft)}
h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.12;margin:0 0 16px}h2{font-size:clamp(1.5rem,3vw,2rem);margin:0 0 16px}h3{margin:0 0 6px;font-size:1.1rem}
.lead{font-size:1.15rem;color:var(--muted);max-width:60ch}
.hero{background:var(--primary);color:var(--on-primary);padding:80px 0}.hero .lead{color:inherit;opacity:.92}
.btn{display:inline-block;padding:12px 20px;border-radius:var(--radius);background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600;border:0;cursor:pointer;font:inherit;font-weight:600}
.btn.secondary{background:transparent;color:inherit;border:2px solid currentColor}
.btn:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:20px}
.card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:20px}.card p{margin:0;color:var(--muted)}
.stat{font-size:2rem;font-weight:700;color:var(--primary)}
.price{font-size:1.6rem;font-weight:700}ul.plain{padding-left:20px;margin:10px 0}
details{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;margin:10px 0}summary{cursor:pointer;font-weight:600}
.quote{font-style:italic}.who{color:var(--muted);font-style:normal;margin-top:8px}
table{border-collapse:collapse;width:100%;max-width:520px}td,th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
form{display:grid;gap:12px;max-width:520px}label{font-weight:600;display:grid;gap:4px}
input,textarea,select{font:inherit;padding:10px 12px;border:1px solid #b9c1cf;border-radius:var(--radius);width:100%}
.hp{position:absolute;left:-9999px;height:0;overflow:hidden}.form-status{min-height:1.4em;font-weight:600}
footer.site{border-top:1px solid var(--line);padding:28px 0;color:var(--muted);font-size:.95rem}
footer.site ul{list-style:none;display:flex;gap:16px;padding:0;margin:8px 0 0;flex-wrap:wrap}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}
@media (max-width:640px){body{font-size:16px}section{padding:40px 0}.hero{padding:56px 0}}
`;
}

const SITE_JS = `(function(){
  var forms=document.querySelectorAll('form[data-kora-form]');
  Array.prototype.forEach.call(forms,function(form){
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var status=form.querySelector('.form-status');
      var data={};
      new FormData(form).forEach(function(v,k){data[k]=String(v)});
      status.textContent='Sending\\u2026';
      fetch(form.getAttribute('data-endpoint'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
        .then(function(r){if(!r.ok)throw new Error('failed');status.textContent=form.getAttribute('data-success');form.reset();})
        .catch(function(){status.textContent=form.getAttribute('data-failure');});
    });
  });
})();
`;

const FAVICON = (spec: SiteSpec) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${spec.brand.primaryColor}"/><text x="32" y="43" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="${contrastOn(spec.brand.primaryColor)}">${esc((spec.business.name.trim()[0] ?? "K").toUpperCase())}</text></svg>\n`;

const pagePath = (slug: string) =>
  slug === "home" ? "index.html" : `${slug}/index.html`;
const relFrom = (fromSlug: string, toSlug: string) =>
  `${fromSlug === "home" ? "" : "../"}${pagePath(toSlug)}`;

function link(l: { label: string; href: string }, cls = "btn", from = "home") {
  const href = l.href.startsWith("/")
    ? relFrom(from, l.href === "/" ? "home" : l.href.slice(1))
    : l.href;
  return `<a class="${cls}" href="${esc(href)}">${esc(l.label)}</a>`;
}

function renderSection(
  s: Section,
  spec: SiteSpec,
  ctx: RenderContext,
  from: string,
  index: number,
): string {
  const id = `s${index}`;
  const h = (t: string) => (t ? `<h2 id="${id}">${esc(t)}</h2>` : "");
  const label = (t: string) =>
    t ? ` aria-labelledby="${id}"` : ` aria-label="${esc(s.type)}"`;
  switch (s.type) {
    case "hero":
      return `<section class="hero"${label("x")}><div class="wrap"><h1 id="${id}">${esc(s.heading)}</h1>${s.subheading ? `<p class="lead">${esc(s.subheading)}</p>` : ""}<p>${s.cta ? link(s.cta, "btn", from) : ""} ${s.secondaryCta ? link(s.secondaryCta, "btn secondary", from) : ""}</p></div></section>`;
    case "about":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}${s.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div></section>`;
    case "services":
    case "features":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}${"intro" in s && s.intro ? `<p class="lead">${esc(s.intro)}</p>` : ""}<div class="grid">${s.items.map((i) => `<div class="card"><h3>${esc(i.title)}</h3>${i.description ? `<p>${esc(i.description)}</p>` : ""}</div>`).join("")}</div></div></section>`;
    case "gallery":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}<div class="grid">${s.items.map((i) => `<figure class="card">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="${esc(i.alt)}" loading="lazy">` : ""}<figcaption>${esc(i.caption)}</figcaption></figure>`).join("")}</div></div></section>`;
    case "testimonials":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}<div class="grid">${s.items.map((i) => `<blockquote class="card"><p class="quote">&ldquo;${esc(i.quote)}&rdquo;</p><p class="who">${esc(i.author)}</p></blockquote>`).join("")}</div></div></section>`;
    case "pricing":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}<div class="grid">${s.tiers.map((t) => `<div class="card"><h3>${esc(t.name)}</h3><p class="price">${esc(t.price)}</p>${t.description ? `<p>${esc(t.description)}</p>` : ""}${t.features.length ? `<ul class="plain">${t.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}${t.cta ? `<p>${link(t.cta, "btn", from)}</p>` : ""}</div>`).join("")}</div></div></section>`;
    case "stats":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}<div class="grid">${s.items.map((i) => `<div class="card"><div class="stat">${esc(i.value)}</div><p>${esc(i.label)}</p></div>`).join("")}</div></div></section>`;
    case "faq":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}${s.items.map((i) => `<details><summary>${esc(i.question)}</summary><p>${esc(i.answer)}</p></details>`).join("")}</div></section>`;
    case "cta":
      return `<section${label(s.heading)}><div class="wrap"><h2 id="${id}">${esc(s.heading)}</h2>${s.body ? `<p class="lead">${esc(s.body)}</p>` : ""}<p>${link(s.button, "btn", from)}</p></div></section>`;
    case "hours":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}<table><tbody>${s.items.map((i) => `<tr><th scope="row">${esc(i.days)}</th><td>${esc(i.hours)}</td></tr>`).join("")}</tbody></table></div></section>`;
    case "social":
      return `<section${label(s.heading)}><div class="wrap">${h(s.heading)}<p>${s.links.map((l) => link(l, "btn secondary", from)).join(" ")}</p></div></section>`;
    case "contact": {
      const b = spec.business;
      const direct = [
        b.phone
          ? `<li>Phone: <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></li>`
          : "",
        b.whatsapp
          ? `<li>WhatsApp: <a href="https://wa.me/${esc(b.whatsapp.replace(/^\+/, ""))}">${esc(b.whatsapp)}</a></li>`
          : "",
        b.email
          ? `<li>Email: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>`
          : "",
        b.location ? `<li>${esc(b.location)}</li>` : "",
      ].join("");
      const field = (name: string) => {
        const labels: Record<string, string> = {
          name: "Your name",
          email: "Email",
          phone: "Phone",
          message: "Message",
          service: "Service you need",
        };
        const fid = `${id}-${name}`;
        const input =
          name === "message"
            ? `<textarea id="${fid}" name="message" rows="4" maxlength="2000" required></textarea>`
            : `<input id="${fid}" name="${name}" ${name === "email" ? 'type="email"' : name === "phone" ? 'type="tel"' : 'type="text"'} maxlength="200" ${name === "name" ? "required" : ""}>`;
        return `<label for="${fid}">${labels[name]}${input}</label>`;
      };
      const form =
        s.form && ctx.formEndpoint
          ? `<form data-kora-form data-endpoint="${esc(ctx.formEndpoint)}" data-success="Thank you. We have received your message." data-failure="Sorry, that did not send. Please use the contact details instead." method="post" action="${esc(ctx.formEndpoint)}">${s.formFields.map(field).join("")}<div class="hp" aria-hidden="true"><label>Leave empty<input name="website" tabindex="-1" autocomplete="off"></label></div><button class="btn" type="submit">${esc(s.submitLabel)}</button><p class="form-status" role="status" aria-live="polite"></p></form>`
          : "";
      return `<section id="contact"${label(s.heading)}><div class="wrap">${h(s.heading)}${s.intro ? `<p class="lead">${esc(s.intro)}</p>` : ""}${direct ? `<ul class="plain">${direct}</ul>` : ""}${form}</div></section>`;
    }
  }
}

function origin(url: string | undefined): string {
  if (!url) return "'none'";
  try {
    return new URL(url).origin;
  } catch {
    return "'none'";
  }
}

export function renderPage(
  spec: SiteSpec,
  slug: string,
  ctx: RenderContext,
): string {
  const page = spec.pages.find((p) => p.slug === slug)!;
  const root = slug === "home" ? "" : "../";
  const title =
    slug === "home" ? spec.seo.title : `${page.title} | ${spec.business.name}`;
  const csp = `default-src 'none'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src ${origin(ctx.formEndpoint)}; form-action ${origin(ctx.formEndpoint)}; base-uri 'none'`;
  const nav = spec.navigation
    .map(
      (n) =>
        `<li><a href="${esc(relFrom(slug, n.pageSlug))}"${n.pageSlug === slug ? ' aria-current="page"' : ""}>${esc(n.label)}</a></li>`,
    )
    .join("");
  const f = spec.footer;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(spec.seo.description)}">
${spec.seo.keywords.length ? `<meta name="keywords" content="${esc(spec.seo.keywords.join(", "))}">\n` : ""}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(spec.seo.description)}">
<meta property="og:site_name" content="${esc(spec.business.name)}">
<meta name="theme-color" content="${esc(spec.brand.primaryColor)}">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap"><a class="brand" href="${relFrom(slug, "home")}">${esc(spec.business.name)}</a>${nav ? `<nav aria-label="Main"><ul>${nav}</ul></nav>` : ""}</div></header>
<main id="main">
${page.sections.map((s, i) => renderSection(s, spec, ctx, slug, i)).join("\n")}
</main>
<footer class="site"><div class="wrap"><p>${esc(f.text || `© ${spec.business.name}`)}</p>${f.links.length ? `<ul>${f.links.map((l) => `<li>${link(l, "", slug)}</li>`).join("")}</ul>` : ""}</div></footer>
<script src="${root}site.js" defer></script>
</body>
</html>
`;
}

/** Renders the deterministic source artifact for a spec. */
export function renderSite(spec: SiteSpec, ctx: RenderContext = {}): SiteFiles {
  const files: SiteFiles = {
    "styles.css": renderCss(spec),
    "site.js": SITE_JS,
    "favicon.svg": FAVICON(spec),
  };
  for (const page of spec.pages)
    files[pagePath(page.slug)] = renderPage(spec, page.slug, ctx);
  return files;
}

/** Adds the host-specific files (sitemap, robots) once the public base URL is known. */
export function finalizeForPublish(
  files: SiteFiles,
  spec: SiteSpec,
  baseUrl: string,
): SiteFiles {
  const base = baseUrl.replace(/\/+$/, "");
  const urls = spec.pages
    .map(
      (p) =>
        `  <url><loc>${esc(`${base}/${p.slug === "home" ? "" : `${p.slug}/`}`)}</loc></url>`,
    )
    .join("\n");
  return {
    ...files,
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    "robots.txt": `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`,
  };
}

export const artifactHash = (files: SiteFiles) => hashFiles(files);

/** Cheap structural invariants the renderer guarantees; used by tests and as a publish gate. */
export function lintArtifact(files: SiteFiles): string[] {
  const problems: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith(".html")) {
      if (/<script(?![^>]*\bsrc=)/i.test(content))
        problems.push(`${path}: inline script`);
      // Quoted attribute values are removed first: escaped text such as
      // `onerror=` inside a value is data, only a real attribute counts.
      const tags = content.match(/<[a-z][^>]*>/gi) ?? [];
      if (tags.some((t) => /\son[a-z]+\s*=/i.test(t.replace(/"[^"]*"/g, '""'))))
        problems.push(`${path}: event-handler attribute`);
      if (/<iframe|<object|<embed/i.test(content))
        problems.push(`${path}: embedded content`);
      if (/javascript:/i.test(content))
        problems.push(`${path}: javascript: URL`);
      if (!/<title>[^<]+<\/title>/.test(content))
        problems.push(`${path}: missing title`);
    }
    if (path.includes("..") || path.startsWith("/"))
      problems.push(`${path}: unsafe path`);
  }
  return problems;
}
