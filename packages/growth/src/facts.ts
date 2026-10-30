import { z } from "zod";
import type { AnySiteSpec } from "@kora/site-schema";

const text = (max: number) => z.string().trim().max(max);
const phone = z.string().regex(/^\+?[0-9 ()-]{5,30}$/);
const wa = z.string().regex(/^\+?[0-9]{6,20}$/);

export const FACT_SOURCES = ["owner", "site", "import", "observed"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

const hoursRow = z.object({ days: text(60).min(1), hours: text(60).min(1) });
const offer = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  title: text(100).min(1),
  detail: text(300).default(""),
  /** Free text such as "₦5,000" — Kora never computes or invents prices. */
  price: text(40).optional(),
  /** ISO dates; an offer past `endsOn` is stale. */
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
});
export type Offer = z.infer<typeof offer>;

/** The facts an owner states about the business. Everything the presence layer says must trace back to these. */
export const BusinessFactsSchema = z.object({
  identity: z.object({
    name: text(100).min(1),
    description: text(600).default(""),
    industry: text(80).default(""),
    tagline: text(120).optional(),
  }),
  contact: z.object({
    phone: phone.optional(),
    whatsapp: wa.optional(),
    email: z.string().email().max(200).optional(),
    address: text(200).optional(),
    city: text(80).optional(),
    country: text(80).optional(),
  }),
  availability: z.object({
    hours: z.array(hoursRow).max(10).default([]),
    /** Owner-set override, e.g. a holiday closure. */
    notice: text(200).optional(),
  }),
  offer: z.object({
    services: z.array(text(100).min(1)).max(30).default([]),
    offers: z.array(offer).max(20).default([]),
  }),
  social: z
    .array(
      z.object({
        network: z.enum([
          "instagram",
          "facebook",
          "tiktok",
          "linkedin",
          "x",
          "youtube",
          "google_business",
        ]),
        handle: text(120).min(1),
        url: z.string().url().max(300).optional(),
      }),
    )
    .max(10)
    .default([]),
});
export type BusinessFacts = z.infer<typeof BusinessFactsSchema>;
export type BusinessFactsInput = z.input<typeof BusinessFactsSchema>;

export function emptyFacts(name: string): BusinessFacts {
  return BusinessFactsSchema.parse({
    identity: { name },
    contact: {},
    availability: {},
    offer: {},
  });
}

const NETWORK_BY_HOST: Array<
  [RegExp, BusinessFacts["social"][number]["network"]]
> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "facebook"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)youtube\.com$/, "youtube"],
];

/** Facts that can be read straight off a site spec. Nothing is guessed: absent stays absent. */
export function factsFromSpec(spec: AnySiteSpec): BusinessFacts {
  const b = spec.business;
  const hours = "hours" in b ? b.hours : [];
  const social: BusinessFacts["social"] = [];
  if ("social" in b)
    for (const l of b.social) {
      try {
        const u = new URL(l.href);
        const hit = NETWORK_BY_HOST.find(([re]) => re.test(u.hostname));
        if (!hit) continue;
        const handle = u.pathname.replace(/^\/+|\/+$/g, "") || l.label;
        social.push({ network: hit[1], handle, url: l.href });
      } catch {
        /* not an absolute URL: not a social profile we can name */
      }
    }
  const services: string[] = [];
  for (const page of spec.pages)
    for (const s of page.sections)
      if (s.type === "services")
        for (const it of s.items) {
          const title = "title" in it ? it.title : "";
          if (title && !services.includes(title)) services.push(title);
        }
  const location = b.location?.trim();
  return BusinessFactsSchema.parse({
    identity: {
      name: b.name,
      description: b.description,
      industry: b.industry,
    },
    contact: {
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.whatsapp ? { whatsapp: b.whatsapp } : {}),
      ...(b.email ? { email: b.email } : {}),
      ...(location ? { address: location } : {}),
    },
    availability: {
      hours: hours.map((h) => ({ days: h.days, hours: h.hours })),
    },
    offer: { services: services.slice(0, 30) },
    social,
  });
}
