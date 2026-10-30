import { z } from "zod";
import { parseSiteSpec, type SiteSpec } from "./spec.js";

export const briefSchema = z.object({
  name: z.string().min(1).max(100),
  /** The owner's own words about the business. */
  description: z.string().min(1).max(2000),
  industry: z.string().max(80).optional(),
  location: z.string().max(160).optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  services: z.array(z.string().min(1).max(100)).max(16).optional(),
  hours: z
    .array(z.object({ days: z.string().max(60), hours: z.string().max(60) }))
    .max(10)
    .optional(),
  primaryColor: z.string().optional(),
  wantsQuoteForm: z.boolean().optional(),
});
export type SiteBrief = z.infer<typeof briefSchema>;

/**
 * What must be asked before generating, and nothing more: the owner has to
 * give a business name and at least a sentence of what it does. Everything else
 * is optional and, when absent, the section is simply omitted.
 */
export function missingBlockingDetails(input: Partial<SiteBrief>): string[] {
  const missing: string[] = [];
  if (!input.name?.trim()) missing.push("name");
  if (!input.description || input.description.trim().length < 12)
    missing.push("description");
  return missing;
}

const titleCase = (s: string) => s.trim().replace(/^./, (c) => c.toUpperCase());
/** Services named in prose: "We provide X, Y and Z." (only what the owner wrote). */
export function extractServices(description: string): string[] {
  const m =
    /\b(?:we\s+(?:provide|offer|do|specialise in|specialize in)|services?\s*(?:include|are)?:?)\s+([^.\n]+)/i.exec(
      description,
    );
  if (!m) return [];
  const parts = m[1]!.split(",").map((s) => s.trim());
  // Only the final "and" separates the last two items; earlier ones are the
  // owner's own phrasing ("pickup and delivery").
  const last = parts.pop() ?? "";
  const tail = last.split(/\s+and\s+|\s*&\s*/i);
  const items =
    parts.length === 0 ? last.split(/\s*,\s*/) : [...parts, ...tail];
  return items
    .map((s) => s.replace(/^(?:also|then|and)\s+/i, "").trim())
    .filter((s) => s.length > 1 && s.length <= 60)
    .slice(0, 12)
    .map(titleCase);
}

const firstSentence = (s: string) =>
  (/^[^.!?]*[.!?]?/.exec(s.trim())?.[0] ?? s).trim();

/**
 * Deterministic site generator: used when no model is configured or the model
 * output is rejected. It only rearranges what the owner supplied, so it can
 * never invent services, prices, hours or testimonials.
 */
export function generateSpecFromBrief(rawBrief: SiteBrief): SiteSpec {
  const brief = briefSchema.parse(rawBrief);
  const services = brief.services?.length
    ? brief.services
    : extractServices(brief.description);
  const tagline = firstSentence(brief.description).slice(0, 280);
  const contactMethods = Boolean(brief.phone || brief.whatsapp || brief.email);
  const primaryCta = brief.whatsapp
    ? {
        label: "Chat on WhatsApp",
        href: `https://wa.me/${brief.whatsapp.replace(/[^0-9]/g, "")}`,
      }
    : brief.phone
      ? { label: "Call us", href: `tel:${brief.phone}` }
      : {
          label: brief.wantsQuoteForm === false ? "Contact us" : "Get in touch",
          href: "#contact",
        };
  const home: SiteSpec["pages"][number]["sections"] = [
    {
      type: "hero",
      heading: brief.name,
      subheading: tagline,
      cta: primaryCta,
      secondaryCta: services.length
        ? { label: "Our services", href: "/services" }
        : undefined,
    },
    {
      type: "about",
      heading: `About ${brief.name}`,
      body: [brief.description.trim().slice(0, 1200)],
    },
  ];
  const pages: SiteSpec["pages"] = [];
  const nav: SiteSpec["navigation"] = [{ label: "Home", pageSlug: "home" }];
  if (services.length) {
    home.push({
      type: "services",
      heading: "What we do",
      intro: "",
      items: services.slice(0, 6).map((s) => ({ title: s, description: "" })),
    });
    pages.push({
      slug: "services",
      title: "Services",
      sections: [
        {
          type: "services",
          heading: "Our services",
          intro: "",
          items: services.map((s) => ({ title: s, description: "" })),
        },
      ],
    });
    nav.push({ label: "Services", pageSlug: "services" });
  }
  const contactSections: SiteSpec["pages"][number]["sections"] = [];
  if (brief.hours?.length)
    contactSections.push({
      type: "hours",
      heading: "Opening hours",
      items: brief.hours,
    });
  contactSections.push({
    type: "contact",
    heading: "Contact us",
    intro:
      brief.wantsQuoteForm === false
        ? ""
        : "Tell us what you need and we will get back to you.",
    form: brief.wantsQuoteForm !== false,
    formFields: services.length
      ? ["name", "email", "phone", "service", "message"]
      : ["name", "email", "phone", "message"],
    submitLabel: "Request a quote",
  });
  home.push(...contactSections);
  pages.unshift({ slug: "home", title: "Home", sections: home });
  void contactMethods;
  return parseSiteSpec({
    version: 1,
    business: {
      name: brief.name,
      description: brief.description.slice(0, 600),
      industry: brief.industry ?? "",
      location: brief.location,
      phone: brief.phone,
      whatsapp: brief.whatsapp?.replace(/[^0-9+]/g, ""),
      email: brief.email,
    },
    brand: {
      tone: "professional",
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(brief.primaryColor ?? "")
        ? brief.primaryColor
        : "#1f4fd8",
      accentColor: "#f59e0b",
      typography: "modern",
      radius: "soft",
    },
    seo: {
      title:
        `${brief.name}${brief.location ? ` | ${brief.location}` : ""}`.slice(
          0,
          70,
        ),
      description: tagline.slice(0, 180),
      keywords: [
        brief.name,
        ...(brief.industry ? [brief.industry] : []),
        ...services.slice(0, 4),
      ].map((k) => k.slice(0, 40)),
    },
    navigation: nav,
    pages,
    footer: { text: `© ${brief.name}`, links: [] },
  });
}
