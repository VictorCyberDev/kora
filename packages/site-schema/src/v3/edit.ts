/**
 * Structured edits for v3. Natural language ("make it more premium") is translated into one of these validated
 * operations; nothing else can reach the spec. A content edit never touches the design; a design edit never invents
 * content ("more luxurious" changes type, spacing and palette, not claims).
 */
import { z } from "zod";
import {
  GRAMMARS,
  TYPE_VOICES,
  findCliches,
  ctaLabel,
  resolveVertical,
  hexToRgb,
  luminance,
  type Colorway,
  type DesignGenome,
} from "@kora/creative";
import { paletteFromColorway } from "./palette.js";
import {
  parseSiteSpecV3,
  mediaV3Schema,
  MAX_SITE_PAGES,
  type SectionV3,
  type SiteSpecV3,
} from "./spec.js";
import { claimIssues } from "@kora/creative";

export const NUDGES = [
  "premium",
  "bolder",
  "calmer",
  "playful",
  "less-text",
  "more-image",
  "stronger-whatsapp",
  "more-contrast",
  "warmer",
  "cooler",
  "darker",
  "lighter",
  "editorial",
  "product-focused",
  "minimal",
] as const;
export type Nudge = (typeof NUDGES)[number];

export const structuredEditV3Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hero-text"),
    heading: z.string().trim().min(1).max(110).optional(),
    subheading: z.string().trim().max(280).optional(),
    /** Defaults to "model": a caller must explicitly attest that the owner wrote the text to assert claims. */
    author: z.enum(["owner", "model"]).default("model"),
  }),
  z.object({
    kind: z.literal("contact"),
    phone: z
      .string()
      .regex(/^\+?[0-9 ()-]{5,30}$/)
      .optional(),
    whatsapp: z
      .string()
      .regex(/^\+?[0-9]{6,20}$/)
      .optional(),
    email: z.string().email().max(200).optional(),
    location: z.string().trim().min(1).max(160).optional(),
  }),
  z.object({ kind: z.literal("nudge"), nudge: z.enum(NUDGES) }),
  z.object({ kind: z.literal("colorway"), colorwayId: z.string().max(40) }),
  z.object({ kind: z.literal("type-voice"), typeVoice: z.enum(TYPE_VOICES) }),
  z.object({
    kind: z.literal("remove-section"),
    page: z.string().max(40),
    index: z.number().int().min(0).max(30),
  }),
  z.object({
    kind: z.literal("move-section"),
    page: z.string().max(40),
    from: z.number().int().min(0).max(30),
    to: z.number().int().min(0).max(30),
  }),
  z.object({
    kind: z.literal("remove-page"),
    slug: z.string().max(40),
  }),
  z.object({
    kind: z.literal("move-page"),
    slug: z.string().max(40),
    to: z.number().int().min(1).max(8),
  }),
  z.object({
    kind: z.literal("section-text"),
    page: z.string().max(40),
    index: z.number().int().min(0).max(30),
    heading: z.string().trim().min(1).max(120).optional(),
    intro: z.string().trim().max(300).optional(),
    body: z.array(z.string().trim().min(1).max(900)).min(1).max(4).optional(),
    /** Text written by the owner is theirs to assert. Text proposed by a model must not read as an unsupplied claim. */
    author: z.enum(["owner", "model"]).default("model"),
  }),
  z.object({
    kind: z.literal("replace-media"),
    page: z.string().max(40),
    index: z.number().int().min(0).max(30),
    /** Which picture inside the section: gallery or offer item index. Omit for a hero or story picture. */
    item: z.number().int().min(0).max(12).optional(),
    media: mediaV3Schema,
  }),
  z.object({
    kind: z.literal("cta-label"),
    label: z.string().trim().min(2).max(40),
  }),
]);
export type StructuredEditV3 = z.infer<typeof structuredEditV3Schema>;

export class EditV3Error extends Error {
  constructor(m: string) {
    super(m);
    this.name = "EditV3Error";
  }
}

/** What each nudge does to the genome. All values are vocabulary members, so the result always validates. */
function nudge(g: DesignGenome, n: Nudge): DesignGenome {
  const x = { ...g };
  switch (n) {
    case "premium":
      x.density = "airy";
      x.spacingRhythm = "dramatic";
      x.accentScarcity = "rare";
      x.radiusStyle = "none";
      x.borderStyle = x.borderStyle === "heavy" ? "hairline" : x.borderStyle;
      x.typeContrast = "high";
      x.motionIntensity = "restrained";
      x.buttonCharacter = "outline-fine";
      if (
        ![
          "editorial-luxury",
          "soft-luxury",
          "high-fashion",
          "classical-roman",
          "heritage-serif",
          "modern-serif",
        ].includes(x.typeVoice)
      )
        x.typeVoice = "editorial-luxury";
      break;
    case "bolder":
      x.typeContrast = "extreme";
      x.headlineBehavior = "oversized";
      x.accentScarcity = "frequent";
      x.borderStyle = "heavy";
      x.density = x.density === "airy" ? "balanced" : x.density;
      x.motionIntensity = "measured";
      break;
    case "calmer":
      x.motionIntensity = "restrained";
      x.accentScarcity = "rare";
      x.spacingRhythm = "steady";
      x.density = "airy";
      x.typeContrast = x.typeContrast === "extreme" ? "high" : x.typeContrast;
      x.headlineBehavior =
        x.headlineBehavior === "uppercase" || x.headlineBehavior === "oversized"
          ? "sentence"
          : x.headlineBehavior;
      break;
    case "playful":
      x.radiusStyle = "round";
      x.buttonCharacter = "solid-pill";
      x.motionIntensity = "measured";
      x.motionCharacter = "float";
      x.accentScarcity = "frequent";
      x.typeVoice = "rounded-playful";
      break;
    case "less-text":
      x.density = "airy";
      x.servicePresentation = "ladder";
      break;
    case "more-image":
      x.imageDominance = "dominant";
      break;
    case "stronger-whatsapp":
      x.mobileStrategy = "action-dock";
      break;
    case "editorial":
      x.headlineBehavior = "mixed-italic";
      x.typeContrast = "high";
      x.alignment = "mixed";
      x.spacingRhythm = "dramatic";
      x.density = x.density === "dense" ? "balanced" : x.density;
      if (
        ![
          "editorial-luxury",
          "modern-serif",
          "heritage-serif",
          "high-fashion",
          "soft-luxury",
        ].includes(x.typeVoice)
      )
        x.typeVoice = "modern-serif";
      break;
    case "product-focused":
      x.imageDominance = "dominant";
      x.headlineBehavior =
        x.headlineBehavior === "oversized" ? "sentence" : x.headlineBehavior;
      x.density = x.density === "airy" ? "balanced" : x.density;
      break;
    case "minimal":
      x.density = "airy";
      x.borderStyle = "hairline";
      x.radiusStyle = "none";
      x.accentScarcity = "rare";
      x.motionIntensity = "restrained";
      x.headlineBehavior = "sentence";
      x.typeContrast = x.typeContrast === "extreme" ? "high" : x.typeContrast;
      break;
    case "more-contrast":
      x.typeContrast = x.typeContrast === "low" ? "medium" : "high";
      x.borderStyle = x.borderStyle === "none" ? "hairline" : x.borderStyle;
      break;
  }
  return x;
}

const hueOf = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [
    number,
    number,
    number,
  ];
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d < 0.02) return 0;
  const h =
    mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
/** 1 at orange-red (25 degrees), 0 at the opposite blue-cyan side. Greys count as neutral (0.5). */
const warmth = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex);
  if (Math.max(r, g, b) - Math.min(r, g, b) < 14) return 0.5;
  const d = Math.abs(((hueOf(hex) - 25 + 540) % 360) - 180);
  return d / 180;
};
const palWarmth = (c: { primary: string; accent: string; bg: string }) =>
  warmth(c.primary) * 0.5 + warmth(c.accent) * 0.3 + warmth(c.bg) * 0.2;

/**
 * Palette nudges choose another colour set that belongs to the same design language, so the brand keeps its voice and
 * every text pair stays legible. When no such set exists the owner is told, rather than the brand being bent.
 */
function colorwayNudge(
  grammarId: string | undefined,
  currentId: string | undefined,
  n: Nudge,
): Colorway {
  const gram = GRAMMARS.find((g) => g.id === grammarId);
  const sets = gram?.colorways ?? [];
  const cur = sets.find((c) => c.id === currentId) ?? sets[0];
  if (!cur) throw new EditV3Error("This design has no alternative colours.");
  const score = (c: Colorway) =>
    n === "warmer"
      ? palWarmth(c)
      : n === "cooler"
        ? -palWarmth(c)
        : n === "darker"
          ? -luminance(c.bg)
          : luminance(c.bg);
  const better = sets
    .filter((c) => c.id !== cur.id && score(c) > score(cur) + 0.02)
    .sort((a, b) => score(b) - score(a));
  const pick = better[0];
  if (!pick)
    throw new EditV3Error(
      `This design language has no ${n} colours than the ones you have. Try a different direction for that.`,
    );
  return pick;
}

export function applyStructuredEditV3(
  spec: SiteSpecV3,
  raw: unknown,
): SiteSpecV3 {
  const edit = structuredEditV3Schema.safeParse(raw);
  if (!edit.success)
    throw new EditV3Error("That change is not one Kora can make.");
  const e = edit.data;
  const next = structuredClone(spec);
  const home = next.pages.find((p) => p.slug === "home")!;
  switch (e.kind) {
    case "hero-text": {
      const hero = home.sections[0];
      if (!hero || hero.type !== "hero")
        throw new EditV3Error("This page has no hero to edit.");
      for (const t of [e.heading, e.subheading]) {
        if (t && findCliches(t).length)
          throw new EditV3Error(
            `"${findCliches(t)[0]}" is a generic phrase; say what you actually do.`,
          );
        if (t && e.author === "model" && claimIssues(t).length)
          throw new EditV3Error(
            `Suggested wording must not state ${claimIssues(t)[0]} the owner has not supplied.`,
          );
      }
      if (e.heading) hero.heading = e.heading;
      if (e.subheading !== undefined) hero.subheading = e.subheading;
      break;
    }
    case "contact":
      if (e.phone) next.business.phone = e.phone;
      if (e.whatsapp)
        next.business.whatsapp = e.whatsapp.replace(/[^\d+]/g, "");
      if (e.email) next.business.email = e.email;
      if (e.location) next.business.location = e.location;
      break;
    case "nudge":
      if (["warmer", "cooler", "darker", "lighter"].includes(e.nudge)) {
        const cw = colorwayNudge(
          next.brand.grammarId,
          next.design.colorwayId,
          e.nudge,
        );
        next.design.palette = paletteFromColorway(cw);
        next.design.colorwayId = cw.id;
        next.design.mode = cw.mode;
      } else next.design.genome = nudge(next.design.genome, e.nudge);
      break;
    case "colorway": {
      const gram = GRAMMARS.find((g) => g.id === next.brand.grammarId);
      const cw = gram?.colorways.find((c) => c.id === e.colorwayId);
      if (!cw)
        throw new EditV3Error(
          "That colour set does not belong to this design language.",
        );
      next.design.palette = paletteFromColorway(cw);
      next.design.colorwayId = cw.id;
      next.design.mode = cw.mode;
      break;
    }
    case "type-voice":
      next.design.genome.typeVoice = e.typeVoice;
      break;
    case "remove-section":
    case "move-section": {
      const page = next.pages.find((p) => p.slug === e.page);
      if (!page) throw new EditV3Error("That page does not exist.");
      const at = e.kind === "remove-section" ? e.index : e.from;
      const s = page.sections[at];
      if (!s) throw new EditV3Error("That section does not exist.");
      if (s.type === "hero" || s.type === "contact")
        throw new EditV3Error(
          "The opening and the way to contact you stay on every page.",
        );
      if (e.kind === "remove-section") page.sections.splice(at, 1);
      else {
        if (e.to < 1 || e.to >= page.sections.length)
          throw new EditV3Error("That position is not available.");
        page.sections.splice(at, 1);
        page.sections.splice(e.to, 0, s as SectionV3);
      }
      break;
    }
    case "remove-page": {
      if (e.slug === "home" || e.slug === "contact")
        throw new EditV3Error("The home page and the contact page stay.");
      const at = next.pages.findIndex((p) => p.slug === e.slug);
      if (at < 0) throw new EditV3Error("That page does not exist.");
      next.pages.splice(at, 1);
      // Nothing may keep pointing at a page that is gone.
      const dead = new Set([`/${e.slug}`, `/${e.slug}/`]);
      for (const p of next.pages)
        for (const sec of p.sections) {
          for (const k of ["primaryCta", "secondaryCta", "button"] as const) {
            const l = (sec as Record<string, unknown>)[k] as
              { href?: string } | undefined;
            if (l?.href && dead.has(l.href)) l.href = "/contact";
          }
        }
      next.footer.links = next.footer.links.filter((l) => !dead.has(l.href));
      break;
    }
    case "move-page": {
      if (e.slug === "home")
        throw new EditV3Error("The home page stays first.");
      const at = next.pages.findIndex((p) => p.slug === e.slug);
      if (at < 0) throw new EditV3Error("That page does not exist.");
      const [pg] = next.pages.splice(at, 1);
      next.pages.splice(Math.min(e.to, next.pages.length), 0, pg!);
      break;
    }
    case "section-text": {
      const page = next.pages.find((p) => p.slug === e.page);
      const sec = page?.sections[e.index] as
        Record<string, unknown> | undefined;
      if (!page || !sec) throw new EditV3Error("That section does not exist.");
      const texts = [e.heading, e.intro, ...(e.body ?? [])].filter(
        (t): t is string => !!t,
      );
      for (const t of texts) {
        if (findCliches(t).length)
          throw new EditV3Error(
            `"${findCliches(t)[0]}" is a generic phrase; say what you actually do.`,
          );
        if (e.author === "model" && claimIssues(t).length)
          throw new EditV3Error(
            `Suggested wording must not state ${claimIssues(t)[0]} the owner has not supplied.`,
          );
      }
      if (e.heading !== undefined) {
        if (!("heading" in sec))
          throw new EditV3Error("This section has no heading.");
        sec.heading = e.heading;
      }
      if (e.intro !== undefined) {
        if (!("intro" in sec))
          throw new EditV3Error("This section has no introduction.");
        sec.intro = e.intro;
      }
      if (e.body) {
        if (sec.type !== "story")
          throw new EditV3Error("Only story sections have body text.");
        sec.body = e.body;
      }
      break;
    }
    case "replace-media": {
      const page = next.pages.find((p) => p.slug === e.page);
      const sec = page?.sections[e.index] as unknown as
        Record<string, unknown> | undefined;
      if (!page || !sec) throw new EditV3Error("That section does not exist.");
      const target =
        e.item !== undefined
          ? (sec.items as Array<Record<string, unknown>> | undefined)?.[e.item]
          : sec;
      if (
        !target ||
        !(
          "media" in target ||
          "plate" in target ||
          sec.type === "hero" ||
          sec.type === "story"
        )
      )
        throw new EditV3Error("There is no picture to replace there.");
      const pv = e.media.provenance;
      if (
        pv.sourceType === "licensed-stock" &&
        !e.media.url.startsWith("/_kora/media/")
      ) {
        const host = (u?: string) => {
          try {
            return u ? new URL(u).hostname : "";
          } catch {
            return "";
          }
        };
        const unsplash = (h: string) =>
          h === "unsplash.com" || h.endsWith(".unsplash.com");
        if (
          host(e.media.url) !== "images.unsplash.com" ||
          (pv.creatorUrl && !unsplash(host(pv.creatorUrl))) ||
          (pv.providerUrl && !unsplash(host(pv.providerUrl)))
        )
          throw new EditV3Error(
            "A stock photo can only come from the provider it is credited to.",
          );
      }
      for (const t of [e.media.alt, pv.attribution])
        if (t && claimIssues(t).some((c) => c !== "a number"))
          throw new EditV3Error(
            "Picture text must not state unsupplied claims.",
          );
      target.media = e.media;
      delete target.plate;
      break;
    }
    case "cta-label": {
      const v = resolveVertical(
        `${next.business.name} ${next.business.industry} ${next.business.description}`,
      );
      void v;
      void ctaLabel;
      for (const p of next.pages)
        for (const s of p.sections) {
          if (s.type === "hero" && s.primaryCta) s.primaryCta.label = e.label;
          if (s.type === "cta") s.button.label = e.label;
        }
      break;
    }
  }
  // A site is never grown past the page limit. A historical site that already exceeds it is kept as it is.
  if (next.pages.length > Math.max(MAX_SITE_PAGES, spec.pages.length))
    throw new EditV3Error(`A site can have at most ${MAX_SITE_PAGES} pages.`);
  try {
    return parseSiteSpecV3(next);
  } catch {
    throw new EditV3Error(
      "That change would break the design, so nothing was changed.",
    );
  }
}

/** Plain-language requests that map to a validated edit. Anything else returns null and is never guessed at. */
export function ruleBasedEditV3(instruction: string): StructuredEditV3 | null {
  const t = instruction.toLowerCase();
  const map: Array<[RegExp, Nudge]> = [
    [/premium|luxur|upmarket|expensive|classy|elegant/, "premium"],
    [/bolder|more bold|louder|stronger look|punchier|more energy/, "bolder"],
    [/calm|quiet|softer|more subtle|less busy|relax/, "calmer"],
    [/playful|fun\b|friendlier|more fun|cheerful/, "playful"],
    [/warmer|cosier|cozier|more warmth|warm(er)? colou?rs?/, "warmer"],
    [/cooler|colder|fresher colou?rs?/, "cooler"],
    [/darker|moodier|more dramatic|dark mode|night/, "darker"],
    [/lighter|brighter|more airy colou?rs?|paler/, "lighter"],
    [/editorial|magazine|more (stylish|refined)/, "editorial"],
    [
      /product[- ]focus|focus on (the )?products?|sell(ing)? (the )?products?/,
      "product-focused",
    ],
    [/minimal|cleaner|stripped|less clutter/, "minimal"],
    [/less text|fewer words|shorter|simpler/, "less-text"],
    [
      /show .*(product|photo|image|picture)|more (image|photo|picture)s?|bigger (image|photo)/,
      "more-image",
    ],
    [
      /whatsapp.*(stronger|prominent|bigger|easier)|stronger whatsapp|make whatsapp/,
      "stronger-whatsapp",
    ],
    [/more contrast|easier to read|clearer text/, "more-contrast"],
  ];
  for (const [re, n] of map) if (re.test(t)) return { kind: "nudge", nudge: n };
  const wa = /whatsapp (?:number )?(?:is|to)\s*(\+?[0-9 ()-]{6,24})/.exec(t);
  if (wa) return { kind: "contact", whatsapp: wa[1]!.replace(/[^\d+]/g, "") };
  const ph =
    /(?:phone|call|number)(?: number)? (?:is|to)\s*(\+?[0-9 ()-]{6,24})/.exec(
      t,
    );
  if (ph) return { kind: "contact", phone: ph[1]!.trim() };
  return null;
}
