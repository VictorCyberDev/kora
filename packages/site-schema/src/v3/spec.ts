/**
 * SiteSpec v3: the closed vocabulary behind Kora's creative engine. Everything a model, a person or the planner may
 * choose is an enum or a validated string; there is no field that can carry HTML, CSS, script or an unknown component.
 * The design is data: the genome, the strategy and the art direction travel with the spec, so a saved design
 * re-renders identically without asking a model again. v1 and v2 stay valid and keep their own renderers.
 */
import { z } from "zod";
import {
  BrandStrategySchema,
  DesignGenomeSchema,
  HERO_LAYOUTS,
  INTENTS,
  ImageBriefSchema,
  PRODUCT_LAYOUTS,
  PROCESS_LAYOUTS,
  PROOF_LAYOUTS,
  SERVICE_LAYOUTS,
} from "@kora/creative";
import { safeHref } from "../spec.js";
import { paletteSchema } from "../v2/spec.js";

/* eslint-disable no-control-regex */
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "control characters are not allowed",
    );
const line = (max = 160) => text(max).min(1);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);
const link = z.object({ label: line(60), href: safeHref });

export const PLATE_KINDS = [
  "arch",
  "stripes",
  "circles",
  "checker",
  "sunburst",
  "lines",
  "monogram",
  "stack",
] as const;
export const MEDIA_TREATMENTS = [
  "none",
  "mono",
  "warm",
  "cool",
  "contrast",
] as const;
export const MEDIA_ROLES = [
  "hero",
  "feature",
  "gallery",
  "about",
  "product",
  "background",
] as const;

export const mediaV3Schema = z.object({
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
  /** Responsive variants of the same picture (https only); the browser picks by width. */
  srcset: z
    .array(
      z.object({
        url: z
          .string()
          .max(500)
          .regex(/^https:\/\/[^\s"'<>,]+$/),
        width: z.number().int().min(100).max(4000),
      }),
    )
    .max(4)
    .optional(),
  role: z.enum(MEDIA_ROLES).default("feature"),
  treatment: z.enum(MEDIA_TREATMENTS).default("none"),
  provenance: z
    .object({
      sourceType: z.enum([
        "owner-supplied",
        "owner-approved-stored",
        "licensed-stock",
        "ai-generated",
      ]),
      provider: text(80).optional(),
      license: text(120).optional(),
      attribution: text(200).optional(),
      reviewStatus: z
        .enum(["owner-approved", "unreviewed", "kora-curated"])
        .default("unreviewed"),
    })
    .default({ sourceType: "licensed-stock", reviewStatus: "kora-curated" }),
});
export type MediaV3 = z.infer<typeof mediaV3Schema>;

const plate = z.object({
  kind: z.enum(PLATE_KINDS),
  seed: z.number().int().min(0).max(999_999),
});
const visual = { media: mediaV3Schema.optional(), plate: plate.optional() };

const item = z.object({
  title: line(100),
  text: text(400).default(""),
  tag: text(40).optional(),
  /** Only ever a price the owner supplied. */
  price: text(40).optional(),
  ...visual,
});

const sec = <T extends string, L extends readonly [string, ...string[]]>(
  type: T,
  layouts: L,
) => ({
  type: z.literal(type),
  layout: z.enum(layouts),
});

export const GALLERY_LAYOUTS = ["mosaic", "rail", "pair", "grid"] as const;
export const STORY_LAYOUTS = [
  "manifesto",
  "founder-note",
  "split-image",
  "craft",
] as const;
export const CONTACT_LAYOUTS = [
  "whatsapp-first",
  "call-first",
  "booking-form",
  "enquiry-form",
  "visit",
] as const;
export const CTA_LAYOUTS = ["statement", "outline", "marquee"] as const;

export const sectionV3Schema = z.discriminatedUnion("type", [
  z.object({
    ...sec("hero", HERO_LAYOUTS),
    eyebrow: text(80).optional(),
    heading: line(110),
    subheading: text(280).default(""),
    primaryCta: link.optional(),
    secondaryCta: link.optional(),
    highlights: z.array(line(60)).max(5).default([]),
    /** Which arrangement of the same layout family (e.g. where the call box sits). Chosen deterministically by the planner. */
    variant: z.number().int().min(0).max(3).default(0),
    ...visual,
  }),
  z.object({
    type: z.literal("ticker"),
    layout: z.literal("band"),
    items: z.array(line(40)).min(2).max(8),
  }),
  z.object({
    type: z.literal("statement"),
    layout: z.literal("large"),
    text: line(320),
    eyebrow: text(60).optional(),
  }),
  z.object({
    ...sec("offer", SERVICE_LAYOUTS),
    heading: line(90),
    intro: text(300).default(""),
    items: z.array(item).min(1).max(12),
  }),
  z.object({
    ...sec("products", PRODUCT_LAYOUTS),
    heading: line(90),
    intro: text(300).default(""),
    items: z.array(item).min(1).max(12),
  }),
  z.object({
    ...sec("story", STORY_LAYOUTS),
    heading: line(100),
    body: z.array(text(900).min(1)).min(1).max(4),
    values: z.array(line(70)).max(6).default([]),
    ...visual,
  }),
  z.object({
    ...sec("process", PROCESS_LAYOUTS),
    heading: line(90),
    intro: text(300).default(""),
    items: z.array(item).min(2).max(6),
  }),
  z.object({
    ...sec("gallery", GALLERY_LAYOUTS),
    heading: text(90).default(""),
    items: z
      .array(
        z.object({
          caption: text(120).default(""),
          media: mediaV3Schema.optional(),
          plate: plate.optional(),
        }),
      )
      .min(2)
      .max(9),
  }),
  z.object({
    ...sec("proof", PROOF_LAYOUTS),
    heading: text(90).default(""),
    /** Proof exists only when the owner supplied it. The literal makes an invented testimonial unrepresentable. */
    supplied: z.literal(true),
    quotes: z
      .array(
        z.object({
          quote: line(400),
          author: line(80),
          role: text(80).optional(),
        }),
      )
      .max(6)
      .default([]),
    facts: z
      .array(z.object({ value: line(24), label: line(80) }))
      .max(4)
      .default([]),
  }),
  z.object({
    type: z.literal("visit"),
    layout: z.enum(["card", "split"]),
    heading: line(90),
    intro: text(300).default(""),
  }),
  z.object({
    ...sec("contact", CONTACT_LAYOUTS),
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
    type: z.literal("faq"),
    layout: z.literal("accordion"),
    heading: line(90),
    items: z
      .array(z.object({ question: line(200), answer: line(700) }))
      .min(1)
      .max(10),
  }),
  z.object({
    ...sec("cta", CTA_LAYOUTS),
    heading: line(120),
    body: text(260).default(""),
    button: link,
  }),
]);
export type SectionV3 = z.infer<typeof sectionV3Schema>;

export const PAGE_PURPOSES = [
  "home",
  "menu",
  "services",
  "work",
  "gallery",
  "booking",
  "visit",
  "orders",
  "about",
  "approach",
  "contact",
  "products",
  "properties",
  "stay",
  "programmes",
  "faq",
] as const;

export const siteSpecV3Schema = z
  .object({
    version: z.literal(3),
    business: z.object({
      name: line(100),
      description: text(600).default(""),
      industry: text(80).default(""),
      location: text(160).optional(),
      /** A home-based or mobile business has a service area, not premises to visit: no directions, no "find us". */
      locationKind: z.enum(["premises", "service-area"]).default("premises"),
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
      /** The owner's own logo, re-encoded by Kora. Never generated, never altered. */
      logo: z
        .object({
          url: z
            .string()
            .max(500)
            .regex(/^https:\/\/[^\s"'<>]+$/),
          alt: text(120).default(""),
          assetId: z.string().max(60),
          width: z.number().int().min(1).max(4000),
          height: z.number().int().min(1).max(4000),
        })
        .optional(),
      language: z
        .string()
        .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
        .default("en"),
    }),
    brand: z.object({
      osVersion: z.number().int().min(1),
      osHash: z.string().regex(/^[a-f0-9]{64}$/),
      directionId: z.string().max(80),
      grammarId: z.string().max(40),
      directionName: z.string().max(60),
      strategy: BrandStrategySchema,
    }),
    design: z.object({
      genome: DesignGenomeSchema,
      palette: paletteSchema,
      colorwayId: z.string().max(40),
      mode: z.enum(["light", "dark"]),
      seed: z.number().int().min(0).max(4_294_967_295),
    }),
    artDirection: z.array(ImageBriefSchema).max(4).default([]),
    seo: z.object({
      title: line(70),
      description: text(180).default(""),
      keywords: z.array(line(40)).max(12).default([]),
      /** Absolute https origin when the site has a public address; enables canonical and og:url. */
      canonicalOrigin: z
        .string()
        .regex(/^https:\/\/[a-z0-9.-]+$/)
        .optional(),
    }),
    pages: z
      .array(
        z.object({
          slug,
          title: line(80),
          nav: text(30).optional(),
          purpose: z.enum(PAGE_PURPOSES),
          conversionGoal: z.enum(INTENTS),
          sections: z.array(sectionV3Schema).min(1).max(16),
        }),
      )
      .min(1)
      .max(8),
    footer: z.object({
      text: text(200).default(""),
      links: z.array(link).max(6).default([]),
    }),
    meta: z.object({
      engine: z.literal("kora-creative/1").default("kora-creative/1"),
      direction: z.number().int().min(0).max(2).default(0),
      generator: z
        .enum(["deterministic", "model", "edit"])
        .default("deterministic"),
    }),
  })
  .superRefine((spec, ctx) => {
    const slugs = spec.pages.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: "custom", message: "duplicate page slug" });
    if (!slugs.includes("home"))
      ctx.addIssue({ code: "custom", message: 'a "home" page is required' });
    for (const page of spec.pages)
      for (const s of page.sections) {
        const l =
          ("primaryCta" in s && s.primaryCta) ||
          ("button" in s && s.button) ||
          null;
        for (const x of [l, "secondaryCta" in s ? s.secondaryCta : null])
          if (
            x?.href.startsWith("#") &&
            x.href.length > 1 &&
            !page.sections.some((y) => y.type === x.href.slice(1))
          )
            ctx.addIssue({
              code: "custom",
              message: `link ${x.href} points at a section that is not on page ${page.slug}`,
            });
      }
  });
export type SiteSpecV3 = z.infer<typeof siteSpecV3Schema>;
export const parseSiteSpecV3 = (input: unknown): SiteSpecV3 =>
  siteSpecV3Schema.parse(input);
