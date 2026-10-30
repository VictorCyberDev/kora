import { z } from "zod";

/** Short human text: no control characters, bounded. */
const text = (max: number) =>
  z
    .string()
    .max(max)
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), {
      message: "control characters are not allowed",
    });
const line = (max = 160) => text(max).min(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);
/** Only https links, mailto, tel and in-page anchors can appear in a site. */
export const safeHref = z
  .string()
  .max(500)
  .refine(
    (v) =>
      /^https:\/\/[^\s"'<>]+$/.test(v) ||
      /^mailto:[^\s"'<>]+$/.test(v) ||
      /^tel:\+?[0-9 ()-]{3,30}$/.test(v) ||
      /^#[A-Za-z0-9_-]*$/.test(v) ||
      /^\/[a-z0-9-]*$/.test(v),
    { message: "href must be https, mailto, tel, an anchor or a site path" },
  );
const httpsUrl = z
  .string()
  .max(500)
  .regex(/^https:\/\/[^\s"'<>]+$/, "https URL required");

const item = z.object({ title: line(100), description: text(400).default("") });
const link = z.object({ label: line(60), href: safeHref });

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hero"),
    heading: line(140),
    subheading: text(300).default(""),
    cta: link.optional(),
    secondaryCta: link.optional(),
  }),
  z.object({
    type: z.literal("about"),
    heading: line(100),
    body: z.array(text(1200).min(1)).min(1).max(6),
  }),
  z.object({
    type: z.literal("services"),
    heading: line(100),
    intro: text(400).default(""),
    items: z.array(item).min(1).max(16),
  }),
  z.object({
    type: z.literal("features"),
    heading: line(100),
    items: z.array(item).min(1).max(12),
  }),
  z.object({
    type: z.literal("gallery"),
    heading: line(100),
    items: z
      .array(
        z.object({
          caption: line(160),
          imageUrl: httpsUrl.optional(),
          alt: text(160).default(""),
        }),
      )
      .min(1)
      .max(24),
  }),
  z.object({
    type: z.literal("testimonials"),
    heading: line(100),
    items: z
      .array(z.object({ quote: line(500), author: line(80) }))
      .min(1)
      .max(9),
  }),
  z.object({
    type: z.literal("pricing"),
    heading: line(100),
    tiers: z
      .array(
        z.object({
          name: line(60),
          price: line(40),
          description: text(300).default(""),
          features: z.array(line(120)).max(12).default([]),
          cta: link.optional(),
        }),
      )
      .min(1)
      .max(6),
  }),
  z.object({
    type: z.literal("stats"),
    heading: text(100).default(""),
    items: z
      .array(z.object({ value: line(24), label: line(80) }))
      .min(1)
      .max(6),
  }),
  z.object({
    type: z.literal("faq"),
    heading: line(100),
    items: z
      .array(z.object({ question: line(200), answer: line(800) }))
      .min(1)
      .max(20),
  }),
  z.object({
    type: z.literal("cta"),
    heading: line(140),
    body: text(300).default(""),
    button: link,
  }),
  z.object({
    type: z.literal("contact"),
    heading: line(100),
    intro: text(300).default(""),
    form: z.boolean().default(true),
    formFields: z
      .array(z.enum(["name", "email", "phone", "message", "service"]))
      .min(1)
      .max(5)
      .default(["name", "email", "phone", "message"]),
    submitLabel: line(40).default("Send"),
  }),
  z.object({
    type: z.literal("hours"),
    heading: line(100),
    items: z
      .array(z.object({ days: line(60), hours: line(60) }))
      .min(1)
      .max(10),
  }),
  z.object({
    type: z.literal("social"),
    heading: text(100).default(""),
    links: z.array(link).min(1).max(8),
  }),
]);
export type Section = z.infer<typeof sectionSchema>;

export const siteSpecSchema = z
  .object({
    version: z.literal(1),
    business: z.object({
      name: line(100),
      description: text(600).default(""),
      industry: text(80).default(""),
      location: text(160).optional(),
      phone: z
        .string()
        .regex(/^\+?[0-9 ()-]{5,30}$/)
        .optional(),
      whatsapp: z
        .string()
        .regex(/^\+?[0-9]{6,20}$/)
        .optional(),
      email: z.string().email().max(200).optional(),
    }),
    brand: z.object({
      tone: z
        .enum(["professional", "friendly", "premium", "playful", "minimal"])
        .default("professional"),
      primaryColor: hexColor.default("#1f4fd8"),
      accentColor: hexColor.default("#f59e0b"),
      typography: z.enum(["modern", "classic", "friendly"]).default("modern"),
      radius: z.enum(["none", "soft", "round"]).default("soft"),
    }),
    seo: z.object({
      title: line(70),
      description: text(180).default(""),
      keywords: z.array(line(40)).max(12).default([]),
    }),
    navigation: z
      .array(z.object({ label: line(30), pageSlug: slug }))
      .max(8)
      .default([]),
    pages: z
      .array(
        z.object({
          slug: slug,
          title: line(80),
          sections: z.array(sectionSchema).min(1).max(20),
        }),
      )
      .min(1)
      .max(10),
    footer: z.object({
      text: text(200).default(""),
      links: z.array(link).max(6).default([]),
    }),
  })
  .superRefine((spec, ctx) => {
    const slugs = spec.pages.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: "custom", message: "duplicate page slug" });
    if (!slugs.includes("home"))
      ctx.addIssue({ code: "custom", message: 'a "home" page is required' });
    for (const nav of spec.navigation)
      if (!slugs.includes(nav.pageSlug))
        ctx.addIssue({
          code: "custom",
          message: `navigation points at unknown page ${nav.pageSlug}`,
        });
  });
export type SiteSpec = z.infer<typeof siteSpecSchema>;
export type SiteSpecInput = z.input<typeof siteSpecSchema>;

export const parseSiteSpec = (input: unknown): SiteSpec =>
  siteSpecSchema.parse(input);
