/** M18/M22: being found. Structured data from owner facts, a Google Business checklist, and a public page audit. */
import type { BusinessFacts } from "./facts.js";

export function localBusinessJsonLd(
  f: BusinessFacts,
  url?: string,
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: f.identity.name,
  };
  if (f.identity.description) ld.description = f.identity.description;
  if (url) ld.url = url;
  if (f.contact.phone) ld.telephone = f.contact.phone;
  if (f.contact.email) ld.email = f.contact.email;
  if (f.contact.address || f.contact.city || f.contact.country)
    ld.address = {
      "@type": "PostalAddress",
      ...(f.contact.address && { streetAddress: f.contact.address }),
      ...(f.contact.city && { addressLocality: f.contact.city }),
      ...(f.contact.country && { addressCountry: f.contact.country }),
    };
  const DAY: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  const spec = f.availability.hours.flatMap((h) => {
    const m = /^(\w{3})\w*\s*[-–]\s*(\w{3})\w*$/.exec(
      h.days.trim().toLowerCase(),
    );
    const t =
      /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(
        h.hours.trim(),
      );
    if (!m || !t || !DAY[m[1]!] || !DAY[m[2]!]) return [];
    const order = Object.keys(DAY);
    const a = order.indexOf(m[1]!),
      b = order.indexOf(m[2]!);
    if (a < 0 || b < a) return [];
    const to24 = (
      hh: string,
      mm: string | undefined,
      ap: string | undefined,
      fallback?: string,
    ) => {
      let H = Number(hh);
      const p = (ap ?? fallback ?? "").toLowerCase();
      if (p === "pm" && H < 12) H += 12;
      if (p === "am" && H === 12) H = 0;
      return `${String(H).padStart(2, "0")}:${mm ?? "00"}`;
    };
    return [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: order.slice(a, b + 1).map((d) => DAY[d]),
        opens: to24(t[1]!, t[2], t[3], t[6]),
        closes: to24(t[4]!, t[5], t[6]),
      },
    ];
  });
  if (spec.length) ld.openingHoursSpecification = spec;
  const sameAs = f.social
    .map((s) => (s as { url?: string }).url)
    .filter((u): u is string => Boolean(u));
  if (sameAs.length) ld.sameAs = sameAs;
  return ld;
}

export function gbpChecklist(
  f: BusinessFacts,
): Array<{ id: string; done: boolean; what: string }> {
  return [
    {
      id: "name",
      done: Boolean(f.identity.name),
      what: "Business name matches your signboard",
    },
    {
      id: "category",
      done: Boolean(f.identity.industry),
      what: "Primary category chosen",
    },
    {
      id: "phone",
      done: Boolean(f.contact.phone || f.contact.whatsapp),
      what: "Phone number added",
    },
    {
      id: "address",
      done: Boolean(f.contact.address),
      what: "Address or service area added",
    },
    {
      id: "hours",
      done: f.availability.hours.length > 0,
      what: "Opening hours added",
    },
    {
      id: "services",
      done: f.offer.services.length > 0,
      what: "Services or products listed",
    },
    {
      id: "description",
      done: f.identity.description.length >= 50,
      what: "A description of at least 50 characters",
    },
  ];
}

export interface AuditFinding {
  id: string;
  ok: boolean;
  observed: string;
  fix: string | null;
  weight: number;
}

/** Audit one public page from its HTML. Only things that can be read from the page; nothing is guessed. */
export function auditHtml(
  html: string,
  finalUrl: string,
): { findings: AuditFinding[]; passed: number; total: number } {
  const f: AuditFinding[] = [];
  const add = (
    id: string,
    ok: boolean,
    observed: string,
    fix: string,
    weight: number,
  ) => f.push({ id, ok, observed, fix: ok ? null : fix, weight });
  const title =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  add(
    "title",
    title.length >= 10 && title.length <= 70,
    title ? `Title: "${title.slice(0, 70)}"` : "No page title",
    "Write a title of 10–70 characters that names the business and what it does.",
    3,
  );
  const desc =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i.exec(
      html,
    )?.[1] ?? "";
  add(
    "description",
    desc.length >= 50 && desc.length <= 170,
    desc ? `Description is ${desc.length} characters` : "No meta description",
    "Add a 50–170 character description customers see in search.",
    2,
  );
  add(
    "viewport",
    /<meta[^>]+name=["']viewport["']/i.test(html),
    /<meta[^>]+name=["']viewport["']/i.test(html)
      ? "Mobile viewport set"
      : "No mobile viewport tag",
    "Add a viewport meta tag so the page works on phones.",
    3,
  );
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  add(
    "h1",
    h1 === 1,
    `${h1} main heading(s)`,
    "Use exactly one main heading.",
    2,
  );
  add(
    "https",
    finalUrl.startsWith("https://"),
    finalUrl.startsWith("https://")
      ? "Served over HTTPS"
      : "Not served over HTTPS",
    "Serve the site over HTTPS.",
    3,
  );
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)];
  const noAlt = imgs.filter((m) => !/\balt=["'][^"']+/i.test(m[0])).length;
  add(
    "alt",
    noAlt === 0,
    imgs.length
      ? `${noAlt} of ${imgs.length} images lack a description`
      : "No images",
    "Describe each image for people using screen readers and for search.",
    2,
  );
  add(
    "jsonld",
    /application\/ld\+json/i.test(html),
    /application\/ld\+json/i.test(html)
      ? "Structured business data found"
      : "No structured business data",
    "Add LocalBusiness structured data so search engines read your details.",
    2,
  );
  add(
    "phone",
    /tel:|wa\.me|api\.whatsapp\.com/i.test(html),
    /tel:|wa\.me|api\.whatsapp\.com/i.test(html)
      ? "A tap-to-call or WhatsApp link exists"
      : "No tap-to-call or WhatsApp link",
    "Add a call or WhatsApp button customers can tap.",
    3,
  );
  add(
    "lang",
    /<html[^>]+lang=/i.test(html),
    /<html[^>]+lang=/i.test(html)
      ? "Page language declared"
      : "No page language",
    "Declare the page language.",
    1,
  );
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  add(
    "weight",
    kb <= 200,
    `HTML is ${kb} KB`,
    "Keep the page HTML under 200 KB.",
    1,
  );
  return { findings: f, passed: f.filter((x) => x.ok).length, total: f.length };
}
