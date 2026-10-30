import { z } from "zod";
import { safeHref } from "../spec.js";
import { contrast } from "./color.js";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      // eslint-disable-next-line no-control-regex
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "control characters are not allowed",
    );
const line = (max = 160) => text(max).min(1);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const link = z.object({ label: line(60), href: safeHref });

export const PERSONALITIES = [
  "editorial",
  "luxury",
  "minimal",
  "warm",
  "approachable",
  "energetic",
  "technical",
  "trustworthy",
  "bold",
  "elegant",
  "playful",
  "organic",
  "corporate",
  "artisanal",
  "futuristic",
  "local",
  "premium",
  "expressive",
] as const;
export type Personality = (typeof PERSONALITIES)[number];

export const PAIRING_IDS = [
  "editorial-serif",
  "luxury-serif",
  "modern-grotesk",
  "humanist",
  "geometric",
  "soft-rounded",
  "technical",
  "high-contrast-serif",
  "warm-serif",
  "expressive",
  "creative-display",
] as const;
export type PairingId = (typeof PAIRING_IDS)[number];

/** The only component variants that exist. The model chooses from this list; it cannot invent one. */
export const VARIANTS = {
  nav: ["classic", "minimal", "centered", "floating", "split", "dark"],
  hero: [
    "editorial-centered",
    "split-art",
    "full-bleed",
    "media-left",
    "bento",
    "collage",
    "local-service",
    "portfolio",
    "product",
    "luxury",
    "minimal-statement",
    "stacked-story",
  ],
  trust: ["strip", "checklist", "credentials"],
  services: [
    "grid",
    "list",
    "editorial-list",
    "image-cards",
    "numbered",
    "split",
    "accordion",
  ],
  features: ["statements", "icon-led", "alternating", "bento"],
  about: ["image-text", "editorial", "mission", "values"],
  process: ["numbered", "timeline", "steps", "horizontal"],
  portfolio: ["grid", "editorial", "featured", "list"],
  testimonials: ["spotlight", "grid", "stacked"],
  team: ["cards", "list"],
  pricing: ["columns", "featured", "minimal"],
  stats: ["row", "big"],
  faq: ["accordion", "split", "minimal"],
  contact: ["split", "conversion", "whatsapp", "booking", "local"],
  cta: ["band", "outline", "split", "big-type"],
  footer: ["minimal", "columns", "brand-heavy", "local"],
} as const;
export type VariantMap = typeof VARIANTS;
const variantOf = <K extends keyof VariantMap>(k: K) =>
  z.enum(VARIANTS[k] as unknown as [string, ...string[]]);

export const PALETTE_ROLES = [
  "background",
  "foreground",
  "surface",
  "surfaceRaised",
  "surfaceMuted",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "accent",
  "accentForeground",
  "muted",
  "mutedForeground",
  "border",
  "success",
  "warning",
  "danger",
] as const;
export const paletteSchema = z
  .object(
    Object.fromEntries(PALETTE_ROLES.map((r) => [r, hex])) as Record<
      (typeof PALETTE_ROLES)[number],
      z.ZodString
    >,
  )
  .superRefine((p, ctx) => {
    // Pairs that carry text must be readable (WCAG AA for normal text).
    const pairs: Array<[keyof typeof p, keyof typeof p]> = [
      ["foreground", "background"],
      ["foreground", "surface"],
      ["foreground", "surfaceRaised"],
      ["foreground", "surfaceMuted"],
      ["primaryForeground", "primary"],
      ["secondaryForeground", "secondary"],
      ["accentForeground", "accent"],
      ["mutedForeground", "background"],
      ["mutedForeground", "surfaceMuted"],
    ];
    for (const [fg, bg] of pairs)
      if (contrast(p[fg], p[bg]) < 4.5)
        ctx.addIssue({
          code: "custom",
          message: `${fg} on ${bg} has contrast ${contrast(p[fg], p[bg]).toFixed(2)} (< 4.5)`,
        });
  });
export type Palette = z.infer<typeof paletteSchema>;

export const ART_STYLES = [
  "mesh",
  "rings",
  "grid",
  "waves",
  "blocks",
  "arch",
] as const;
export const mediaSchema = z.object({
  url: z
    .string()
    .max(500)
    .regex(/^(?:https:\/\/[^\s"'<>]+|\/_kora\/media\/[a-z0-9-]+\.webp)$/),
  alt: text(200).default(""),
  width: z.number().int().min(1).max(8000).optional(),
  height: z.number().int().min(1).max(8000).optional(),
  focalPoint: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
  source: z.enum(["upload", "bundled", "external"]).default("external"),
  attribution: text(200).optional(),
  license: text(120).optional(),
});
export type Media = z.infer<typeof mediaSchema>;

const item = z.object({
  title: line(100),
  text: text(400).default(""),
  tag: text(40).optional(),
  icon: text(30).optional(),
  media: mediaSchema.optional(),
});

const base = <K extends keyof VariantMap>(k: K) => ({ variant: variantOf(k) });
export const sectionV2Schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hero"),
    ...base("hero"),
    eyebrow: text(80).optional(),
    heading: line(110),
    subheading: text(280).default(""),
    primaryCta: link.optional(),
    secondaryCta: link.optional(),
    highlights: z.array(line(60)).max(5).default([]),
    media: mediaSchema.optional(),
  }),
  z.object({
    type: z.literal("trust"),
    ...base("trust"),
    heading: text(80).default(""),
    items: z.array(line(80)).min(1).max(8),
  }),
  z.object({
    type: z.literal("services"),
    ...base("services"),
    heading: line(90),
    intro: text(300).default(""),
    items: z.array(item).min(1).max(12),
  }),
  z.object({
    type: z.literal("features"),
    ...base("features"),
    heading: line(90),
    intro: text(300).default(""),
    items: z.array(item).min(1).max(8),
  }),
  z.object({
    type: z.literal("about"),
    ...base("about"),
    heading: line(100),
    body: z.array(text(900).min(1)).min(1).max(4),
    values: z.array(line(70)).max(6).default([]),
    media: mediaSchema.optional(),
  }),
  z.object({
    type: z.literal("process"),
    ...base("process"),
    heading: line(90),
    intro: text(300).default(""),
    items: z.array(item).min(2).max(6),
  }),
  z.object({
    type: z.literal("portfolio"),
    ...base("portfolio"),
    heading: line(90),
    intro: text(300).default(""),
    items: z.array(item).min(1).max(9),
  }),
  z.object({
    type: z.literal("testimonials"),
    ...base("testimonials"),
    heading: text(90).default(""),
    items: z
      .array(
        z.object({
          quote: line(400),
          author: line(80),
          role: text(80).optional(),
        }),
      )
      .min(1)
      .max(6),
  }),
  z.object({
    type: z.literal("team"),
    ...base("team"),
    heading: line(90),
    items: z
      .array(
        z.object({
          name: line(80),
          role: line(80),
          bio: text(300).default(""),
        }),
      )
      .min(1)
      .max(8),
  }),
  z.object({
    type: z.literal("pricing"),
    ...base("pricing"),
    heading: line(90),
    intro: text(300).default(""),
    tiers: z
      .array(
        z.object({
          name: line(60),
          price: line(40),
          description: text(240).default(""),
          features: z.array(line(100)).max(10).default([]),
          cta: link.optional(),
          featured: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(4),
  }),
  z.object({
    type: z.literal("stats"),
    ...base("stats"),
    heading: text(90).default(""),
    items: z
      .array(z.object({ value: line(24), label: line(80) }))
      .min(1)
      .max(4),
  }),
  z.object({
    type: z.literal("faq"),
    ...base("faq"),
    heading: line(90),
    items: z
      .array(z.object({ question: line(200), answer: line(700) }))
      .min(1)
      .max(10),
  }),
  z.object({
    type: z.literal("contact"),
    ...base("contact"),
    heading: line(100),
    intro: text(300).default(""),
    form: z.boolean().default(true),
    formFields: z
      .array(z.enum(["name", "email", "phone", "message", "service", "date"]))
      .min(1)
      .max(6)
      .default(["name", "phone", "message"]),
    submitLabel: line(40).default("Send message"),
  }),
  z.object({
    type: z.literal("cta"),
    ...base("cta"),
    heading: line(120),
    body: text(260).default(""),
    button: link,
  }),
]);
export type SectionV2 = z.infer<typeof sectionV2Schema>;

export const designSchema = z.object({
  personality: z.array(z.enum(PERSONALITIES)).min(1).max(3),
  palette: paletteSchema,
  paletteStrategy: z.string().max(40).default("custom"),
  mode: z.enum(["light", "dark"]).default("light"),
  typography: z.object({
    pairing: z.enum(PAIRING_IDS),
    scale: z.enum(["compact", "balanced", "dramatic"]).default("balanced"),
  }),
  density: z
    .enum(["compact", "balanced", "spacious", "editorial"])
    .default("balanced"),
  shape: z.enum(["sharp", "soft", "rounded"]).default("soft"),
  surface: z.enum(["flat", "outlined", "raised"]).default("outlined"),
  buttons: z.enum(["solid", "outline", "pill", "underline"]).default("solid"),
  motion: z.enum(["none", "subtle", "expressive"]).default("subtle"),
  imagery: z.object({
    style: z.enum(["abstract", "photo-led", "minimal"]).default("abstract"),
    art: z.enum(ART_STYLES).default("mesh"),
    seed: z.number().int().min(0).max(999_999).default(1),
  }),
  nav: variantOf("nav"),
  footer: variantOf("footer"),
});
export type Design = z.infer<typeof designSchema>;

export const siteSpecV2Schema = z
  .object({
    version: z.literal(2),
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
      hours: z
        .array(z.object({ days: line(60), hours: line(60) }))
        .max(10)
        .default([]),
      social: z.array(link).max(8).default([]),
    }),
    design: designSchema,
    seo: z.object({
      title: line(70),
      description: text(180).default(""),
      keywords: z.array(line(40)).max(12).default([]),
    }),
    pages: z
      .array(
        z.object({
          slug,
          title: line(80),
          nav: text(30).optional(),
          sections: z.array(sectionV2Schema).min(1).max(14),
        }),
      )
      .min(1)
      .max(8),
    footer: z.object({
      text: text(200).default(""),
      links: z.array(link).max(6).default([]),
    }),
    meta: z
      .object({
        recipe: text(40).default(""),
        direction: z.number().int().min(0).max(2).default(0),
        generator: z
          .enum(["deterministic", "model", "edit"])
          .default("deterministic"),
      })
      .default({ recipe: "", direction: 0, generator: "deterministic" }),
  })
  .superRefine((spec, ctx) => {
    const slugs = spec.pages.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: "custom", message: "duplicate page slug" });
    if (!slugs.includes("home"))
      ctx.addIssue({ code: "custom", message: 'a "home" page is required' });
    for (const page of spec.pages)
      for (const s of page.sections)
        for (const l of [
          ("primaryCta" in s && s.primaryCta) || null,
          ("secondaryCta" in s && s.secondaryCta) || null,
          ("button" in s && s.button) || null,
        ])
          if (
            l?.href.startsWith("#") &&
            l.href.length > 1 &&
            !page.sections.some((x) => x.type === l.href.slice(1))
          )
            ctx.addIssue({
              code: "custom",
              message: `link ${l.href} points at a section that is not on page ${page.slug}`,
            });
  });
export type SiteSpecV2 = z.infer<typeof siteSpecV2Schema>;
export const parseSiteSpecV2 = (input: unknown): SiteSpecV2 =>
  siteSpecV2Schema.parse(input);
