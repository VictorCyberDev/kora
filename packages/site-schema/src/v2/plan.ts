import { z } from "zod";
import { catalogMediaFor } from "./catalog.js";
import { buildPalette, type PaletteStrategy } from "./palette.js";
import {
  LOOKS,
  pickRecipe,
  RECIPES,
  type Goal,
  type Recipe,
} from "./recipes.js";
import {
  parseSiteSpecV2,
  type Design,
  type Personality,
  type SectionV2,
  type SiteSpecV2,
} from "./spec.js";

export const GOALS = [
  "calls",
  "bookings",
  "leads",
  "sales",
  "visits",
  "show-work",
] as const;

/** What an owner types. Only the first two are required; everything else only ever adds sections. */
export const designBriefSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(12).max(2000),
  goal: z.enum(GOALS).optional(),
  /** Free words about the look they want ("calm", "bold", "dark"). Optional. */
  feel: z.string().max(120).optional(),
  industry: z.string().max(80).optional(),
  location: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  services: z.array(z.string().min(1).max(100)).max(12).optional(),
  hours: z
    .array(z.object({ days: z.string().max(60), hours: z.string().max(60) }))
    .max(10)
    .optional(),
});
export type DesignBrief = z.infer<typeof designBriefSchema>;

export function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const FEEL_LOOK: Array<[RegExp, string]> = [
  [/luxur|elegan|upscale|refined|high.?end/, "luxe-centered"],
  [/dark|night|moody/, "dark-premium"],
  [/bold|loud|strong|energ|confident/, "bold-grotesk"],
  [/play|fun|colou?rful|creative|vibrant/, "creative-collage"],
  [/minimal|clean|simple|quiet|calm|airy/, "portfolio-reel"],
  [/warm|cosy|cozy|craft|handmade|natural|organic|earth/, "warm-craft"],
  [/tech|modern|digital|futur|sleek/, "tech-product"],
  [/friend|approach|welcom|casual|soft/, "soft-friendly"],
  [/trust|professional|corporate|serious|reliab/, "corporate-calm"],
  [/editorial|magazine|gallery|art/, "gallery-editorial"],
];
export function lookFromFeel(feel: string | undefined): string | undefined {
  if (!feel) return undefined;
  const f = feel.toLowerCase();
  return FEEL_LOOK.find(([re]) => re.test(f))?.[1];
}

const sentences = (s: string) =>
  (
    s
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]*/g) ?? [s]
  )
    .map((x) => x.trim())
    .filter(Boolean);
const trimEnd = (s: string) => s.replace(/[.!?\s]+$/, "");
const cap = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
const digits = (s: string) => s.replace(/[^0-9+]/g, "");

const ICON_HINTS: Array<[RegExp, string]> = [
  [/repair|fix|plumb|mainten|service|install/, "wrench"],
  [/hair|barber|cut|braid|salon|trim/, "scissors"],
  [/food|menu|cater|cook|meal|dining|kitchen/, "utensils"],
  [/home|house|interior|decor|propert|estate|rent/, "house"],
  [/consult|advis|strategy|business|account|tax/, "briefcase"],
  [/photo|video|film|shoot|portrait/, "camera"],
  [/gym|train|fitness|workout|strength/, "dumbbell"],
  [/health|care|clinic|therap|massage|wellness|physio/, "heart-pulse"],
  [/teach|tutor|school|lesson|class|course|learn/, "graduation-cap"],
  [/build|construct|architect|civil|roof/, "building-2"],
  [/book|appoint|schedul|event|wedding|plan/, "calendar-check"],
  [/clean|polish|detail|wash|laundry/, "sparkles"],
  [/secur|legal|law|insur|compliance/, "shield-check"],
  [/paint|brand|design|logo|creative|graphic/, "palette"],
  [/web|software|app|digital|tech|code|automation/, "laptop"],
  [/deliver|logistic|courier|freight|move|transport/, "truck"],
  [/cloth|tailor|fashion|wear|sew/, "shirt"],
  [/music|dj|sound|audio/, "music"],
  [/garden|plant|flower|landscap/, "leaf"],
  [/car|auto|vehicle|tyre|garage/, "car"],
  [/jewel|gem|ring/, "gem"],
  [/dent|teeth|oral|medical|doctor/, "stethoscope"],
  [/write|print|document|publish|book/, "book-open"],
  [/pack|parcel|shop|store|retail|product/, "package"],
];
const iconFor = (title: string) =>
  ICON_HINTS.find(([re]) => re.test(title.toLowerCase()))?.[1];

export interface PlanOptions {
  direction?: 0 | 1 | 2;
  /** Override the look (used by the model to choose among known looks). */
  lookId?: string;
  /** Override the colourway. */
  paletteStrategy?: PaletteStrategy;
  /** Model-suggested copy; the caller has already checked it against the owner's facts. */
  copy?: {
    eyebrow?: string;
    heading?: string;
    subheading?: string;
    ctaHeading?: string;
  };
  art?: Design["imagery"]["art"];
  personality?: Personality[];
  generator?: "deterministic" | "model";
}

export interface DirectionPreview {
  index: 0 | 1 | 2;
  name: string;
  summary: string;
  recipe: string;
  look: string;
  palette: string;
  spec: SiteSpecV2;
}

const LOOK_NAME: Record<string, [string, string]> = {
  "gallery-editorial": [
    "Gallery editorial",
    "Generous space, serif headlines, calm and considered.",
  ],
  "luxe-centered": [
    "Quiet luxury",
    "Centred, restrained, fine type and lots of air.",
  ],
  "bold-grotesk": [
    "Bold & direct",
    "Large confident type, hard edges, strong rhythm.",
  ],
  "soft-friendly": [
    "Warm & welcoming",
    "Rounded shapes, friendly type, easy to act on.",
  ],
  "local-trust": [
    "Local & dependable",
    "Clear contact first, practical and reassuring.",
  ],
  "tech-product": [
    "Product-clean",
    "Crisp interface feel with a product-style hero.",
  ],
  "dark-premium": [
    "Dark & premium",
    "Dramatic full-bleed opening on a deep palette.",
  ],
  "creative-collage": [
    "Expressive collage",
    "Playful, layered, colour-forward.",
  ],
  "portfolio-reel": [
    "Portfolio first",
    "Minimal framing that lets the work lead.",
  ],
  "clinic-clean": [
    "Clear & caring",
    "Calm structure that makes booking obvious.",
  ],
  "warm-craft": ["Crafted & warm", "Earthy, tactile, handmade in feel."],
  "bento-modern": ["Modern bento", "Modular tiles, rounded, energetic."],
  "trade-solid": [
    "Solid & practical",
    "Sharp edges, tiles of proof, built for trades.",
  ],
  "corporate-calm": ["Calm professional", "Structured, steady, easy to trust."],
  "dark-tech": ["Dark technical", "Graphite surfaces with a sharp accent."],
  "pop-local": [
    "Bright & local",
    "High-energy colour with click-to-call up front.",
  ],
};

export function recipeFor(brief: DesignBrief): Recipe {
  const first = /^[^.!?]*/.exec(brief.description)?.[0] ?? "";
  return pickRecipe(
    `${brief.industry ?? ""} ${brief.name} ${first}`,
    `${brief.description} ${(brief.services ?? []).join(" ")}`,
  );
}

export function extractServicesV2(description: string): string[] {
  const m =
    /\b(?:we\s+(?:provide|offer|do|specialise in|specialize in|sell|repair|serve)|services?\s*(?:include|are)?:?|offering|including)\s+([^.\n]+)/i.exec(
      description,
    );
  if (!m) return [];
  const parts = m[1]!.split(",").map((s) => s.trim());
  const last = parts.pop() ?? "";
  const tail = last.split(/\s+and\s+|\s*&\s*/i);
  const items =
    parts.length === 0 ? last.split(/\s*,\s*/) : [...parts, ...tail];
  return items
    .map((s) =>
      s
        .replace(/^(?:also|then|and)\s+/i, "")
        .replace(/\s+(?:in|across|around|for)\s+[A-Z][\w\s,]+$/, "")
        .trim(),
    )
    .filter((s) => s.length > 1 && s.length <= 60)
    .slice(0, 12)
    .map((s) => s.replace(/^./, (c) => c.toUpperCase()));
}

/** The deterministic designer. Same brief + direction → byte-identical spec; never invents a fact. */
export function planSite(
  rawBrief: DesignBrief,
  opts: PlanOptions = {},
): SiteSpecV2 {
  const brief = designBriefSchema.parse(rawBrief);
  const recipe = recipeFor(brief);
  const dir = opts.direction ?? 0;
  const seed = fnv(brief.name.toLowerCase());
  const feelLook = lookFromFeel(brief.feel);
  // The owner's stated feel claims direction A; the other two keep their recipe looks.
  const lookIds = [...recipe.looks];
  if (feelLook) {
    lookIds[0] = feelLook;
    // never offer the same look twice: a duplicate falls back to a distinct, industry-neutral look
    const spare = [
      "soft-friendly",
      "corporate-calm",
      "bold-grotesk",
      "warm-craft",
      "tech-product",
      "gallery-editorial",
      "creative-collage",
    ];
    for (let i = 1; i < 3; i++)
      if (lookIds.indexOf(lookIds[i]!) !== i || lookIds[i] === feelLook)
        lookIds[i] = spare.find((x) => !lookIds.includes(x))!;
  }
  const wantDark = /dark|night|moody/.test(brief.feel ?? "");
  const look = LOOKS[opts.lookId ?? lookIds[dir]!] ?? LOOKS[recipe.looks[dir]]!;
  const colors = [...recipe.colors];
  if (wantDark) {
    colors[0] = look.id === "dark-tech" ? "graphite-lime" : "midnight-brass";
    const spare: PaletteStrategy[] = [
      "coastal-navy",
      "sage-linen",
      "terracotta-sand",
      "ink-paper",
      "sunrise",
      "plum-blush",
    ];
    for (let i = 1; i < 3; i++)
      if (colors[i] === colors[0])
        colors[i] = spare.find((x) => !colors.includes(x))!;
  }
  const strategy = opts.paletteStrategy ?? colors[dir]!;
  const hueShift = (((seed >>> 4) % 7) - 3) * 4;
  const { palette, mode } = buildPalette(strategy, hueShift);

  const goal: Goal = brief.goal ?? recipe.defaultGoal;
  const phone =
    brief.phone && /^\+?[0-9 ()-]{5,30}$/.test(brief.phone.trim())
      ? brief.phone.trim()
      : undefined;
  const whatsapp =
    brief.whatsapp && digits(brief.whatsapp).replace("+", "").length >= 6
      ? digits(brief.whatsapp)
      : undefined;
  const email =
    brief.email && z.string().email().safeParse(brief.email.trim()).success
      ? brief.email.trim()
      : undefined;
  const location = brief.location?.trim() || undefined;
  const hours = (brief.hours ?? []).filter(
    (h) => h.days.trim() && h.hours.trim(),
  );
  const services = (
    brief.services?.length
      ? brief.services
      : extractServicesV2(brief.description)
  ).map((s) => cap(s.trim(), 100));
  const hasServices = services.length >= 2;
  const sents = sentences(brief.description);
  const first = trimEnd(sents[0] ?? brief.description);
  const rest = sents.slice(1);

  // ---- hero copy: only the owner's words, rearranged
  const nameLed = [
    "luxury",
    "portfolio",
    "editorial-centered",
    "minimal-statement",
    "collage",
  ].includes(look.hero);
  const heading = cap(
    opts.copy?.heading ??
      (nameLed
        ? brief.name
        : first.length <= 100
          ? first
          : `${recipe.label}${location ? ` in ${location}` : ""}`),
    110,
  );
  const subheading = cap(
    opts.copy?.subheading ??
      (nameLed
        ? first + "."
        : rest.length
          ? rest.slice(0, 2).join(" ")
          : location
            ? `Based in ${location}.`
            : ""),
    280,
  );
  const eyebrow = cap(
    opts.copy?.eyebrow ?? `${recipe.label}${location ? ` · ${location}` : ""}`,
    80,
  );

  const wa = whatsapp
    ? `https://wa.me/${whatsapp.replace(/^\+/, "")}`
    : undefined;
  const primaryCta =
    goal === "calls" && phone
      ? { label: recipe.cta.calls, href: `tel:${phone}` }
      : (goal === "bookings" || goal === "sales") &&
          wa &&
          look.contact === "whatsapp"
        ? { label: "Message us on WhatsApp", href: wa }
        : goal === "show-work" && hasServices
          ? { label: recipe.cta["show-work"], href: "#services" }
          : { label: recipe.cta[goal], href: "#contact" };
  const secondaryCta =
    primaryCta.href === "#contact" && hasServices
      ? {
          label:
            recipe.cta["show-work"] === primaryCta.label
              ? "What we do"
              : recipe.cta["show-work"],
          href: "#services",
        }
      : primaryCta.href !== "#contact"
        ? {
            label: recipe.cta[goal === "calls" ? "leads" : goal],
            href: "#contact",
          }
        : wa
          ? { label: "WhatsApp us", href: wa }
          : phone
            ? { label: "Call us", href: `tel:${phone}` }
            : undefined;

  // ---- facts we may show
  const facts: string[] = [];
  if (location) facts.push(`Based in ${location}`);
  if (hours[0]) facts.push(`${hours[0].days}: ${hours[0].hours}`);
  if (wa) facts.push("Reach us on WhatsApp");
  else if (phone) facts.push(`Call ${phone}`);

  const sections: SectionV2[] = [];
  const heroLinks = {
    ...(primaryCta ? { primaryCta } : {}),
    ...(secondaryCta && secondaryCta.href !== primaryCta.href
      ? { secondaryCta }
      : {}),
  };
  sections.push({
    type: "hero",
    variant: look.hero,
    eyebrow,
    heading,
    subheading,
    ...heroLinks,
    highlights: ["luxury", "editorial-centered", "local-service"].includes(
      look.hero,
    )
      ? []
      : facts.slice(0, 3),
  });
  if (
    facts.length >= 2 &&
    look.hero !== "stacked-story" &&
    look.hero !== "local-service"
  )
    sections.push({
      type: "trust",
      variant: look.trust,
      heading: "",
      items: facts.slice(0, 4),
    });

  if (services.length >= 2) {
    sections.push({
      type: "services",
      variant:
        services.length < 3 &&
        ["grid", "image-cards", "numbered"].includes(look.services)
          ? "list"
          : look.services,
      heading:
        goal === "show-work" || recipe.traits.includes("visual")
          ? "What we do"
          : "Services",
      intro: "",
      items: services.slice(0, 8).map((title) => ({
        title,
        text: "",
        ...(iconFor(title) ? { icon: iconFor(title)! } : {}),
      })),
    });
  }
  // About only says what the hero and the services have not already said.
  const shownInHero = new Set<string>([
    first,
    ...(nameLed ? [] : rest.slice(0, 2).map(trimEnd)),
  ]);
  const aboutBody = sents
    .map(trimEnd)
    .filter(
      (x) =>
        x &&
        !shownInHero.has(x) &&
        !(
          services.length > 0 &&
          services.every((sv) =>
            x.toLowerCase().includes(sv.toLowerCase().slice(0, 12)),
          )
        ),
    )
    .map((x) => `${x}.`);
  if (aboutBody.length >= 1)
    sections.push({
      type: "about",
      variant: look.about,
      heading:
        look.about === "mission" ? `${brief.name}` : `About ${brief.name}`,
      body: aboutBody.slice(0, 4).map((x) => cap(x, 900)),
      values: [],
    });

  // process: generic, no promises about speed, price or results
  const steps: Record<Goal, [string, string][]> = {
    calls: [
      ["Call us", "Tell us what you need."],
      [
        "We confirm the details",
        "We agree what is needed before anything starts.",
      ],
      ["We get it done", "We carry out the work and check it with you."],
    ],
    bookings: [
      ["Choose a time", "Tell us what you would like and when suits you."],
      ["We confirm", "We reply to confirm the details."],
      ["Come in", "Visit us at the agreed time."],
    ],
    leads: [
      [
        "Tell us what you need",
        "Share the details through the form or contact us directly.",
      ],
      ["We agree the plan", "We discuss options and agree how to proceed."],
      ["We get to work", "We start once the details are settled."],
    ],
    sales: [
      ["Choose what you want", "Tell us what you would like to order."],
      [
        "We confirm the order",
        "We confirm the details and arrangements with you.",
      ],
      ["Receive it", "We arrange delivery or collection as agreed."],
    ],
    visits: [
      ["Find us", "See where we are and when we are open."],
      ["Come by", "Drop in or get in touch first."],
      ["Enjoy", "Take your time."],
    ],
    "show-work": [
      ["Look through our work", "See what we do."],
      ["Get in touch", "Tell us about your project."],
      ["We take it from there", "We agree the details and begin."],
    ],
  };
  sections.push({
    type: "process",
    variant: look.process,
    heading: "How it works",
    intro: "",
    items: steps[goal].map(([title, text]) => ({ title, text })),
  });

  const faq: Array<{ question: string; answer: string }> = [];
  const reach = [
    phone && `call ${phone}`,
    wa && "message us on WhatsApp",
    email && `email ${email}`,
  ].filter(Boolean) as string[];
  faq.push({
    question: "How do I get started?",
    answer: reach.length
      ? `Use the form below or ${reach.join(", ")}. Tell us what you need and we will reply.`
      : "Use the form below and tell us what you need. We will reply.",
  });
  if (location)
    faq.push({
      question: "Where are you based?",
      answer: `We are based in ${location}.`,
    });
  if (hours.length)
    faq.push({
      question: "When are you open?",
      answer: hours.map((h) => `${h.days}: ${h.hours}`).join(". ") + ".",
    });
  if (services.length)
    faq.push({
      question: "What do you offer?",
      answer: `${services.slice(0, 8).join(", ")}.`,
    });
  if (faq.length >= 2)
    sections.push({
      type: "faq",
      variant: look.faq,
      heading: "Good to know",
      items: faq.slice(0, 4),
    });

  const ctaHeading: Record<Goal, string> = {
    calls: "Need help? Call us.",
    bookings: "Ready to book?",
    leads: "Have something in mind?",
    sales: "Ready to order?",
    visits: "Come and see us.",
    "show-work": "Like what you see?",
  };
  sections.push({
    type: "cta",
    variant: look.cta,
    heading: opts.copy?.ctaHeading ?? ctaHeading[goal],
    body: "",
    button:
      primaryCta.href === "#contact" && look.contact === "whatsapp" && wa
        ? { label: "Message us on WhatsApp", href: wa }
        : primaryCta.href === "#contact"
          ? { label: recipe.cta[goal], href: "#contact" }
          : { label: recipe.cta.leads, href: "#contact" },
  });
  const wantsForm = true;
  const contactVariant =
    look.contact === "whatsapp" && !wa ? "split" : look.contact;
  sections.push({
    type: "contact",
    variant: contactVariant,
    heading: recipe.contactHeading,
    intro: recipe.formIntro,
    form: wantsForm,
    formFields: services.length
      ? ["name", "phone", "service", "message"]
      : ["name", "phone", "email", "message"],
    submitLabel: recipe.submit,
  });

  // Curated photography when an honest one exists; otherwise the page keeps its art/typography.
  const photo = catalogMediaFor(recipe.id, mode);
  if (photo) {
    const heroSec = sections[0];
    const aboutSec = sections.find((x) => x.type === "about");
    if (
      heroSec?.type === "hero" &&
      [
        "split-art",
        "media-left",
        "full-bleed",
        "collage",
        "bento",
        "portfolio",
        "local-service",
      ].includes(heroSec.variant)
    )
      heroSec.media = photo;
    else if (aboutSec?.type === "about" && aboutSec.variant === "image-text")
      aboutSec.media = photo;
  }

  const spec = {
    version: 2 as const,
    business: {
      name: brief.name.trim(),
      description: cap(brief.description, 600),
      industry: brief.industry?.trim() ?? recipe.label,
      ...(location ? { location } : {}),
      ...(phone ? { phone } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(email ? { email } : {}),
      hours,
      social: [],
    },
    design: {
      personality: opts.personality?.length
        ? opts.personality
        : look.personality,
      palette,
      paletteStrategy: strategy,
      mode,
      typography: { pairing: look.pairing, scale: look.scale },
      density: look.density,
      shape: look.shape,
      surface: look.surface,
      buttons: look.buttons,
      motion: look.motion,
      imagery: {
        style: "abstract" as const,
        art: opts.art ?? look.art,
        seed: (seed + dir * 17) % 999_999,
      },
      nav: look.nav,
      footer: look.footer,
    },
    seo: {
      title: cap(`${brief.name.trim()}${location ? ` | ${location}` : ""}`, 70),
      description: cap(first, 180),
      keywords: [
        brief.name.trim(),
        recipe.label,
        ...(location ? [location] : []),
        ...services.slice(0, 4),
      ].map((k) => cap(k, 40)),
    },
    pages: [{ slug: "home", title: "Home", sections }],
    footer: { text: `© ${brief.name.trim()}`, links: [] },
    meta: {
      recipe: recipe.id,
      direction: dir,
      generator: opts.generator ?? ("deterministic" as const),
    },
  };
  return parseSiteSpecV2(spec);
}

/** Three genuinely different directions. Direction 0 is also what "Choose for me" publishes. */
export function planDirections(brief: DesignBrief): DirectionPreview[] {
  return ([0, 1, 2] as const).map((index) => {
    const spec = planSite(brief, { direction: index });
    const recipe = RECIPES.find((r) => r.id === spec.meta.recipe)!;
    const lookId =
      Object.values(LOOKS).find(
        (l) =>
          l.hero ===
            (spec.pages[0]!.sections[0] as { variant: string }).variant &&
          l.pairing === spec.design.typography.pairing &&
          l.nav === spec.design.nav,
      )?.id ?? recipe.looks[index];
    const [name, summary] = LOOK_NAME[lookId] ?? ["Direction", ""];
    return {
      index,
      name,
      summary,
      recipe: recipe.id,
      look: lookId,
      palette: spec.design.paletteStrategy,
      spec,
    };
  });
}
