/**
 * The v3 planner: Business Truth + a Creative Direction -> a validated SiteSpecV3.
 * It decides pages from customer intent, builds copy only from supplied facts and the vertical's plain verbs,
 * drops any section that has no fact behind it, and never calls a model. A model may later suggest wording, but only
 * through the same schema and the same checks.
 */
import {
  brandOsFromDirection,
  brandOsHash,
  buildTruth,
  chooseForMe,
  composeDirections,
  ctaLabel,
  offerPhrase,
  resolveVertical,
  type BrandOS,
  type BusinessTruth,
  type ComposeOptions,
  type CreativeBrief,
  type CreativeDirection,
  type HeroLayout,
  type PageKind,
  type VerticalIntel,
} from "@kora/creative";
import { catalogMediaSetFor } from "../v2/catalog.js";
import { extractServicesV2 } from "../v2/plan.js";
import { paletteFromColorway } from "./palette.js";
import { GRAMMARS } from "@kora/creative";
import {
  parseSiteSpecV3,
  type MediaV3,
  type SectionV3,
  type SiteSpecV3,
} from "./spec.js";

type Page = SiteSpecV3["pages"][number];

/** Stock that would misrepresent the business is excluded even when the catalogue tags it for the trade. */
const CATALOG_EXCLUDE: Record<string, RegExp> = {
  bakery: /interior|dining|tables?\b|window|room|restaurant|cafe|café/i,
  cafe: /portrait/i,
};
/** Sentences that talk about the owner's situation or wishes, not the business; never public copy. */
const META =
  /\b(i|we)\s+(only\s+|just\s+)?(have|want|need|would like|am looking|are looking|hope)\b|\bmore\s+(bookings|customers|orders|sales|clients|leads)\b|\bmy\s+(photos?|logo|whatsapp|website)\b|\bphone photos?\b/i;
const HOME_BASED =
  /\bfrom\s+(my\s+)?home\b|home.?based|online only|delivery only|mobile (service|barber|mechanic)|we come to you|house calls?/i;
const CATALOG: Record<string, string> = {
  bakery: "cake-business",
  cafe: "cafe-bakery",
  restaurant: "restaurant",
  bukka: "bukka",
  catering: "catering",
  barber: "barber",
  law: "law",
  accounting: "accounting",
  consulting: "consulting",
  "electronics-repair": "electronics-repair",
  gadgets: "phone-accessories",
};

export interface PlanV3Options {
  /** Owner-supplied pictures, already validated (https/bundled + alt). Used before any stock. */
  ownerMedia?: MediaV3[];
  /** Real reviews the owner supplied. Without them no testimonial section exists. */
  quotes?: Array<{ quote: string; author: string; role?: string }>;
  /** Real figures the owner supplied ("Since 2015", "3 branches") as value/label pairs. */
  facts?: Array<{ value: string; label: string }>;
  canonicalOrigin?: string;
  /** Overrides for the engine (owner re-rolled one direction, recent-design avoidance). */
  compose?: ComposeOptions;
  previousBrandOsVersion?: number;
}

/** encodeURIComponent leaves ' unescaped, which safeHref rejects; escape it too. */
const enc = (s: string) => encodeURIComponent(s).replace(/'/g, "%27");
const cap = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
const up = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sentences = (s: string) =>
  (
    s
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]*/g) ?? [s]
  )
    .map((x) => x.trim())
    .filter(Boolean);
const city = (loc?: string) => loc?.split(",")[0]?.trim();
const fnvH = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

function servicesOf(truth: BusinessTruth, thing: string): string[] {
  const b = truth.brief;
  const given = (b.services ?? []).map((x) => up(x.trim())).filter(Boolean);
  if (given.length) return given.slice(0, 12);
  const fromText = extractServicesV2(b.description);
  if (fromText.length >= 2) return fromText;
  const parts = thing
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((x) => up(x.trim()))
    .filter((x) => x.length > 2 && x.length <= 48);
  return parts.length >= 2 ? parts.slice(0, 6) : [];
}

function mediaFor(
  vertical: VerticalIntel,
  mode: "light" | "dark",
  opts: PlanV3Options,
): MediaV3[] {
  // Owner media keeps its own provenance and review status; Kora never upgrades an unreviewed image.
  const owner = opts.ownerMedia ?? [];
  if (owner.length) return owner;
  const recipe = CATALOG[vertical.id];
  if (!recipe) return [];
  const ex = CATALOG_EXCLUDE[vertical.id];
  return catalogMediaSetFor(recipe, mode, 8)
    .filter((m) => !ex || !ex.test(m.alt))
    .slice(0, 4)
    .map((m) => ({
      url: m.url,
      alt: m.alt,
      ...(m.width ? { width: m.width } : {}),
      ...(m.height ? { height: m.height } : {}),
      ...(m.focalPoint ? { focalPoint: m.focalPoint } : {}),
      role: "feature" as const,
      treatment: "none" as const,
      provenance: {
        sourceType: "licensed-stock" as const,
        provider: "Pexels",
        ...(m.license ? { license: m.license } : {}),
        ...(m.attribution ? { attribution: m.attribution } : {}),
        reviewStatus: "kora-curated" as const,
      },
    }));
}

function resolveHero(
  want: HeroLayout,
  ctx: { hasMedia: boolean; truth: BusinessTruth; highlights: number },
): HeroLayout {
  const { truth } = ctx;
  if (want === "menu-focus" && ctx.highlights < 2)
    return ctx.hasMedia ? "editorial-split" : "type-dominant";
  if (want === "booking-focus" && !(truth.can.phone || truth.can.whatsapp))
    return "editorial-split";
  if (want === "location-focus" && !truth.can.location)
    return "minimal-statement";
  if (want === "call-first" && !(truth.can.phone || truth.can.whatsapp))
    return "editorial-split";
  return want;
}

export interface PlanV3Result {
  spec: SiteSpecV3;
  direction: CreativeDirection;
  /** The Brand OS version this spec was designed from; its hash is stored in spec.brand.osHash. */
  brandOs: BrandOS;
}

export function planSiteV3(
  input: CreativeBrief,
  direction: CreativeDirection,
  opts: PlanV3Options = {},
): PlanV3Result {
  const truth = buildTruth(input);
  const b = truth.brief;
  const v = resolveVertical(`${b.name} ${b.industry ?? ""} ${b.description}`);
  const g = direction.genome;
  const colorway = GRAMMARS.find(
    (x) => x.id === direction.grammarId,
  )!.colorways.find((c) => c.id === direction.colorwayId)!;
  const palette = paletteFromColorway(colorway);
  const thing = offerPhrase(truth, v);
  const services = servicesOf(truth, thing);
  const media = mediaFor(v, colorway.mode, opts);
  const hasMedia = media.length > 0;
  const seed = direction.seed;
  const homeBased = HOME_BASED.test(b.description);
  const cty = city(b.location);

  // ---- CTAs from the channels that actually exist
  const wa = b.whatsapp?.replace(/[^\d+]/g, "");
  const tel = b.phone?.replace(/[^\d+]/g, "");
  const waHref = wa
    ? `https://wa.me/${wa.replace(/^\+/, "")}?text=${enc(`Hello ${b.name}`)}`
    : "";
  const intentHref = (intent: typeof v.primaryIntent) => {
    if (intent === "call" && tel) return `tel:${tel}`;
    if (
      (intent === "whatsapp" ||
        intent === "order" ||
        intent === "book" ||
        intent === "reserve" ||
        intent === "buy") &&
      waHref
    )
      return waHref;
    if (tel) return `tel:${tel}`;
    return "#contact";
  };
  const primaryHref = intentHref(v.primaryIntent);
  let primaryLabel = ctaLabel(v.id, v.primaryIntent);
  if (primaryHref.startsWith("tel:") && /whatsapp/i.test(primaryLabel))
    primaryLabel =
      v.primaryIntent === "order"
        ? "Call to order"
        : v.primaryIntent === "book"
          ? "Call to book"
          : "Call us";
  if (
    primaryHref === "#contact" &&
    !/enquiry|quote|consult|view|see/i.test(primaryLabel)
  )
    primaryLabel =
      v.primaryIntent === "quote" ? "Get a quote" : "Send an enquiry";
  const hasVisit = (truth.can.location && !homeBased) || truth.can.hours;
  const secondary =
    hasVisit &&
    (v.secondaryIntent === "visit" || v.secondaryIntent === "call") &&
    (truth.can.hours ||
      ["hospitality", "health", "professional", "civic", "education"].includes(
        v.cluster,
      ))
      ? { label: ctaLabel(v.id, "visit"), href: "#visit" }
      : tel && primaryHref !== `tel:${tel}`
        ? { label: "Call us", href: `tel:${tel}` }
        : services.length
          ? { label: `See ${v.offerHeading.toLowerCase()}`, href: "#offer" }
          : undefined;

  // ---- copy: the owner's words first
  const sents = sentences(b.description).filter((x) => !META.test(x));
  const ownerFirst = sents[0] ?? b.description;
  const heading = cap(
    g.headlineBehavior === "uppercase" ||
      g.headlineBehavior === "oversized" ||
      g.headlineBehavior === "tight-stack"
      ? `${up(thing)}.`
      : `${up(thing)}${/[.!?]$/.test(thing) ? "" : "."}`,
    100,
  );
  const action = primaryHref.startsWith("https://wa.me")
    ? "Message us on WhatsApp."
    : primaryHref.startsWith("tel:")
      ? "Call us to get started."
      : "Send us a message.";
  const subheading = cap(
    sents.length > 1
      ? sents.slice(0, 2).join(" ")
      : `${b.name}${cty ? `, ${cty}` : ""}. ${action}`,
    240,
  );
  const eyebrow =
    cap(b.industry?.trim() || (cty ? `${cty}` : ""), 70) || undefined;
  const highlights = services.slice(0, 3).map((x) => cap(x, 56));
  const wantHero: HeroLayout =
    (v.primaryIntent === "call" || v.primaryIntent === "quote") &&
    (truth.can.phone || truth.can.whatsapp) &&
    g.mobileStrategy === "action-dock" &&
    !["cinematic", "arch-portrait"].includes(g.heroPhilosophy)
      ? "call-first"
      : g.heroPhilosophy;
  const heroLayout = resolveHero(wantHero, {
    hasMedia,
    truth,
    highlights: highlights.length,
  });
  const plateKinds = [
    "arch",
    "circles",
    "stripes",
    "sunburst",
    "lines",
    "checker",
    "stack",
    "monogram",
  ] as const;
  const plateFor = (i: number) => ({
    kind: plateKinds[(seed + i * 3) % plateKinds.length]!,
    seed: (seed + i * 17) % 999_999,
  });
  const heroMedia = media[0];

  const hero = (
    layout: HeroLayout,
    o: {
      heading: string;
      sub: string;
      eyebrow?: string | undefined;
      ctas?: boolean;
    },
  ): SectionV3 => ({
    type: "hero",
    layout,
    ...(o.eyebrow ? { eyebrow: o.eyebrow } : {}),
    heading: o.heading,
    subheading: o.sub,
    ...(o.ctas === false
      ? {}
      : {
          primaryCta: { label: primaryLabel, href: primaryHref },
          ...(secondary ? { secondaryCta: secondary } : {}),
        }),
    highlights: o.ctas === false ? [] : highlights,
    ...(heroMedia && layout !== "type-dominant"
      ? { media: { ...heroMedia, role: "hero" as const } }
      : {}),
    plate: plateFor(0),
  });
  const lite = (title: string, sub: string): SectionV3 =>
    hero(g.density === "airy" ? "minimal-statement" : "type-dominant", {
      heading: cap(title, 100),
      sub,
      ctas: false,
    });

  // ---- section builders (each returns null when no fact supports it)
  const offerLayout = (() => {
    const L = g.servicePresentation;
    const noText = true; // service lines come from the owner's list only; no invented descriptions
    if (noText && L === "accordion") return "editorial-index" as const;
    if (noText && L === "stacked-panels")
      return hasMedia ? ("stacked-panels" as const) : ("image-tiles" as const);
    return L;
  })();
  const offerItems = services.map((s, i) => ({
    title: s,
    text: "",
    ...(truth.can.prices ? {} : {}),
    ...(!hasMedia
      ? { plate: plateFor(i + 1) }
      : media[i % media.length]
        ? {
            media: {
              ...media[(i + 1) % media.length]!,
              role: "feature" as const,
            },
          }
        : {}),
  }));
  const offer = (): SectionV3 | null =>
    services.length
      ? {
          type: "offer",
          layout: offerLayout,
          heading: v.offerHeading,
          intro: "",
          items: offerItems.slice(0, 8),
        }
      : null;
  const products = (): SectionV3 | null =>
    services.length
      ? {
          type: "products",
          layout: g.productPresentation,
          heading: v.offerHeading,
          intro: "",
          items: offerItems.slice(0, 8),
        }
      : null;
  const isProductCluster = v.cluster === "retail" || v.cluster === "agri";
  const main = () =>
    isProductCluster && v.id !== "tailor" ? (products() ?? offer()) : offer();
  const statement = (): SectionV3 | null => {
    const t = ownerFirst.replace(/[.!?]+$/, "");
    return t.length >= 24 && t.length <= 300 && sents.length > 1
      ? {
          type: "statement",
          layout: "large",
          text: `${t}.`,
          eyebrow: undefined as never,
        }
      : null;
  };
  const storyBody = sents.slice(2).join(" ");
  const story = (force = false): SectionV3 | null => {
    const body = storyBody || (force ? b.description : "");
    if (!body) return null;
    const layout =
      hasMedia && g.imageDominance !== "none"
        ? "split-image"
        : g.compositionMode === "centered-classical"
          ? "founder-note"
          : g.compositionMode === "split-narrative" ||
              g.compositionMode === "editorial-asymmetric"
            ? "manifesto"
            : "craft";
    return {
      type: "story",
      layout,
      heading: `About ${b.name}`,
      body: [cap(body, 880)],
      values: [],
      ...(hasMedia
        ? {
            media: {
              ...media[Math.min(1, media.length - 1)]!,
              role: "about" as const,
            },
          }
        : { plate: plateFor(7) }),
    };
  };
  const gallery = (): SectionV3 | null =>
    media.length >= 2
      ? {
          type: "gallery",
          layout:
            g.compositionMode === "monograph"
              ? "pair"
              : g.compositionMode === "poster-bold"
                ? "mosaic"
                : "grid",
          heading: "",
          items: media
            .slice(
              0,
              g.compositionMode === "monograph" ||
                g.compositionMode === "poster-bold"
                ? 4
                : media.length >= 6
                  ? 6
                  : media.length >= 3
                    ? 3
                    : 2,
            )
            .map((m) => ({
              caption: "",
              media: { ...m, role: "gallery" as const },
            })),
        }
      : null;
  const ticker = (): SectionV3 | null =>
    services.length >= 2 &&
    (g.signatureMotif === "marquee-band" || heroLayout === "ticker-energy")
      ? {
          type: "ticker",
          layout: "band",
          items: services.slice(0, 6).map((x) => cap(x, 36)),
        }
      : null;
  const proof = (): SectionV3 | null => {
    if (opts.quotes?.length)
      return {
        type: "proof",
        layout:
          g.proofPresentation === "facts-band"
            ? "spotlight"
            : g.proofPresentation,
        heading: "",
        supplied: true,
        quotes: opts.quotes.slice(0, 4),
        facts: [],
      };
    if (opts.facts?.length)
      return {
        type: "proof",
        layout: "facts-band",
        heading: "",
        supplied: true,
        quotes: [],
        facts: opts.facts.slice(0, 4),
      };
    return null;
  };
  const visit = (): SectionV3 | null =>
    hasVisit
      ? {
          type: "visit",
          layout: "card",
          heading: truth.can.location ? "Find us" : "When we are open",
          intro: "",
        }
      : null;
  const faq = (): SectionV3 | null => {
    const items: Array<{ question: string; answer: string }> = [];
    if (b.location && !homeBased)
      items.push({ question: "Where are you?", answer: b.location });
    if (b.hours?.length)
      items.push({
        question: "When are you open?",
        answer: b.hours.map((h) => `${h.days}: ${h.hours}`).join(". "),
      });
    if (waHref || tel)
      items.push({
        question:
          v.primaryIntent === "order"
            ? "How do I order?"
            : v.primaryIntent === "book"
              ? "How do I book?"
              : "How do I get in touch?",
        answer:
          `${wa ? `Message us on WhatsApp (${b.whatsapp})` : ""}${wa && tel ? " or " : ""}${tel ? `call ${b.phone}` : ""}.`.replace(
            /^call/,
            "Call",
          ),
      });
    return items.length >= 2
      ? { type: "faq", layout: "accordion", heading: "Good to know", items }
      : null;
  };
  const contactLayout = (() => {
    const m = v.contactMethod;
    if (m === "whatsapp" && wa) return "whatsapp-first" as const;
    if (m === "phone" && tel) return "call-first" as const;
    if (m === "booking")
      return wa || tel || b.email
        ? ("booking-form" as const)
        : ("enquiry-form" as const);
    if (m === "visit" && hasVisit) return "visit" as const;
    return b.email || !wa
      ? ("enquiry-form" as const)
      : ("whatsapp-first" as const);
  })();
  const contact = (layout = contactLayout): SectionV3 => ({
    type: "contact",
    layout,
    heading:
      layout === "booking-form"
        ? "Request your slot"
        : layout === "call-first"
          ? "Call us"
          : layout === "whatsapp-first"
            ? `Talk to ${b.name}`
            : "Send us a message",
    intro: "",
    form: layout === "booking-form" || layout === "enquiry-form",
    formFields:
      layout === "booking-form"
        ? ["name", "phone", "service", "date", "message"]
        : (["name", "phone", "email", "message"].filter(
            (f) => f !== "email" || true,
          ) as never),
    submitLabel: layout === "booking-form" ? "Request booking" : "Send message",
  });
  const cta = (): SectionV3 => ({
    type: "cta",
    layout:
      g.paletteBehavior === "color-field" && g.accentScarcity === "frequent"
        ? "marquee"
        : g.borderStyle === "heavy" || g.compositionMode === "split-narrative"
          ? "outline"
          : "statement",
    heading: cap(
      primaryLabel.replace(/\.$/, "") +
        (cty && /visit|find|book|order/i.test(primaryLabel)
          ? ` in ${cty}`
          : ""),
      110,
    ),
    body: "",
    button: { label: primaryLabel, href: primaryHref },
  });
  const process = (): SectionV3 | null =>
    v.primaryIntent === "book" ||
    v.primaryIntent === "quote" ||
    v.primaryIntent === "enquire"
      ? {
          type: "process",
          layout: g.processPresentation,
          heading:
            v.primaryIntent === "book"
              ? "How to book"
              : v.primaryIntent === "quote"
                ? "How to get a quote"
                : "How to start",
          intro: "",
          items: [
            {
              title:
                v.primaryIntent === "book"
                  ? "Choose what you need"
                  : "Tell us what you need",
              text: "",
            },
            { title: "Send us a message", text: "" },
            { title: "Agree the details with us", text: "" },
          ],
        }
      : null;

  const compact = <T>(a: Array<T | null>): T[] =>
    a.filter((x): x is T => x !== null);

  // ---- home: the order of sections follows the composition mode, not a fixed template
  const heroSec = hero(heroLayout, { heading, sub: subheading, eyebrow });
  const seq: Record<string, Array<SectionV3 | null>> = {
    "cinematic-minimal": [
      statement(),
      main(),
      gallery(),
      story(),
      visit(),
      contact(),
    ],
    "editorial-asymmetric": [
      main(),
      story(),
      gallery(),
      proof(),
      visit(),
      contact(),
    ],
    "poster-bold": [
      ticker(),
      main(),
      gallery(),
      proof(),
      visit(),
      cta(),
      contact(),
    ],
    "catalog-grid": [main(), ticker(), story(), proof(), visit(), contact()],
    "centered-classical": [
      statement(),
      main(),
      story(),
      process(),
      faq(),
      contact(),
    ],
    "split-narrative": [main(), process(), story(), proof(), faq(), contact()],
    "collage-layered": [
      main(),
      story(),
      gallery(),
      proof(),
      visit(),
      cta(),
      contact(),
    ],
    "stacked-utility": [main(), proof(), gallery(), faq(), contact()],
    "menu-led": [main(), story(), gallery(), visit(), contact()],
    monograph: [gallery(), statement(), main(), story(), proof(), contact()],
  };
  let homeSections = compact([
    heroSec,
    ...(seq[g.compositionMode] ?? seq["editorial-asymmetric"]!),
  ]);
  // ticker-energy heroes sit directly above the band
  if (heroLayout === "ticker-energy") {
    const t = ticker();
    if (t && !homeSections.some((s) => s.type === "ticker"))
      homeSections.splice(1, 0, t);
  }
  // Where the business can be visited, the page says so, whatever the composition.
  if (hasVisit && !homeSections.some((s) => s.type === "visit")) {
    const v2 = visit();
    if (v2)
      homeSections.splice(
        Math.max(
          1,
          homeSections.findIndex((s) => s.type === "contact"),
        ),
        0,
        v2,
      );
  }
  // A page needs a way to act on it.
  if (!homeSections.some((s) => s.type === "contact"))
    homeSections.push(contact());
  homeSections = homeSections.slice(0, 12);

  const home: Page = {
    slug: "home",
    title: b.name,
    purpose: "home",
    conversionGoal: v.primaryIntent,
    sections: homeSections,
  };

  // ---- subpages from intent
  const slugOf: Record<PageKind, string> = {
    home: "home",
    menu: "menu",
    services: "services",
    work: "work",
    gallery: "gallery",
    booking: "booking",
    visit: "visit",
    orders: "orders",
    about: "about",
    approach: "approach",
    contact: "contact",
    products: "products",
    properties: "properties",
    stay: "stay",
    programmes: "programmes",
    faq: "faq",
  };
  const titleOf: Record<PageKind, string> = {
    home: b.name,
    menu: "Menu",
    services: v.offerHeading,
    work: "Our work",
    gallery: "Gallery",
    booking: "Book",
    visit: "Visit",
    orders: "Order",
    about: "About",
    approach: "Our approach",
    contact: "Contact",
    products: "Products",
    properties: "Properties",
    stay: "Stay",
    programmes: "Programmes",
    faq: "Questions",
  };
  const pages: Page[] = [home];
  const addPage = (
    kind: PageKind,
    sections: Array<SectionV3 | null>,
    goal = v.primaryIntent,
  ) => {
    const secs = compact(sections);
    if (secs.length < 2) return;
    pages.push({
      slug: slugOf[kind],
      title: titleOf[kind],
      nav: titleOf[kind].slice(0, 28),
      purpose: kind,
      conversionGoal: goal,
      sections: secs,
    });
  };
  const wantSub = !(
    v.singlePageSuffices &&
    !truth.can.photos &&
    services.length < 4
  );
  if (wantSub)
    for (const kind of v.pages) {
      if (kind === "home") continue;
      switch (kind) {
        case "menu":
        case "services":
        case "programmes":
        case "stay":
          if (services.length >= 2)
            addPage(kind, [
              lite(titleOf[kind], `${b.name}${cty ? ` · ${cty}` : ""}`),
              offer(),
              cta(),
            ]);
          break;
        case "products":
        case "properties":
          if (services.length >= 2)
            addPage(kind, [
              lite(titleOf[kind], `${b.name}${cty ? ` · ${cty}` : ""}`),
              isProductCluster ? products() : offer(),
              cta(),
            ]);
          break;
        case "work":
        case "gallery":
          if (media.length >= 2)
            addPage(
              kind,
              [
                lite(titleOf[kind], `${b.name}${cty ? ` · ${cty}` : ""}`),
                gallery(),
                cta(),
              ],
              "view-work",
            );
          break;
        case "booking":
        case "orders":
          if (wa || tel || b.email)
            addPage(
              kind,
              [
                lite(
                  kind === "booking" ? "Book your visit" : "Place an order",
                  `${b.name}`,
                ),
                contact(
                  kind === "orders" && wa
                    ? "whatsapp-first"
                    : kind === "booking"
                      ? "booking-form"
                      : contactLayout,
                ),
                process(),
                faq(),
              ],
              kind === "booking" ? "book" : "order",
            );
          break;
        case "visit":
          if (hasVisit)
            addPage(
              kind,
              [
                lite("Visit us", b.location ?? b.name),
                visit(),
                contact("visit"),
              ],
              "visit",
            );
          break;
        case "about":
          if (storyBody || sents.length > 1)
            addPage(
              kind,
              [
                lite(`About ${b.name}`, cty ? `${cty}` : ""),
                story(true),
                cta(),
              ],
              "trust",
            );
          break;
        case "approach":
          addPage(
            kind,
            [lite(titleOf[kind], b.name), process(), story(true)],
            "trust",
          );
          break;
        case "contact":
          addPage(
            kind,
            [
              lite("Get in touch", b.name),
              contact(
                contactLayout === "visit" ? "enquiry-form" : contactLayout,
              ),
              visit(),
            ],
            "enquire",
          );
          break;
        default:
          break;
      }
    }

  // Anchors must land somewhere: an unresolved secondary CTA is dropped, never left dangling.
  for (const pg of pages) {
    const has = (a: string) => pg.sections.some((x) => x.type === a.slice(1));
    for (const sec of pg.sections) {
      if (
        sec.type === "hero" &&
        sec.secondaryCta?.href.startsWith("#") &&
        !has(sec.secondaryCta.href)
      )
        delete sec.secondaryCta;
      if (
        sec.type === "hero" &&
        sec.primaryCta?.href.startsWith("#") &&
        !has(sec.primaryCta.href)
      )
        delete sec.primaryCta;
      if (
        sec.type === "cta" &&
        sec.button.href.startsWith("#") &&
        !has(sec.button.href)
      )
        sec.button = {
          ...sec.button,
          href: pages.some((x) => x.slug === "contact") ? "/contact" : "/",
        };
    }
  }

  const title = cap(
    `${b.name}${thing.length < 40 ? ` | ${up(thing)}` : ""}${cty && !b.name.includes(cty) ? ` in ${cty}` : ""}`,
    70,
  );
  const strategy = direction.strategy;
  const osBase = brandOsFromDirection(direction, {
    name: b.name,
    palette: {
      background: palette.background,
      foreground: palette.foreground,
      primary: palette.primary,
      secondary: palette.secondary,
      accent: palette.accent,
    },
    mode: colorway.mode,
    ctas: [primaryLabel],
    ...(opts.previousBrandOsVersion
      ? { previous: { version: opts.previousBrandOsVersion } as never }
      : {}),
  });

  const spec = parseSiteSpecV3({
    version: 3,
    business: {
      name: b.name,
      description: cap(sents.join(" ") || b.description, 600),
      industry: b.industry ?? "",
      ...(b.location ? { location: b.location } : {}),
      locationKind: homeBased ? "service-area" : "premises",
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.whatsapp ? { whatsapp: b.whatsapp.replace(/[^\d+]/g, "") } : {}),
      ...(b.email ? { email: b.email } : {}),
      hours: b.hours ?? [],
      social: [],
      language: "en",
    },
    brand: {
      osVersion: osBase.version,
      osHash: brandOsHash(osBase),
      directionId: direction.id,
      grammarId: direction.grammarId,
      directionName: direction.name,
      strategy,
    },
    design: {
      genome: g,
      palette,
      colorwayId: colorway.id,
      mode: colorway.mode,
      seed: fnvH(`${seed}`),
    },
    artDirection: direction.artDirection,
    seo: {
      title,
      description: cap(sents.slice(0, 2).join(" ") || b.description, 175),
      keywords: [...services.slice(0, 5), ...(cty ? [cty] : [])].map((x) =>
        cap(x.toLowerCase(), 38),
      ),
      ...(opts.canonicalOrigin
        ? { canonicalOrigin: opts.canonicalOrigin }
        : {}),
    },
    pages,
    footer: { text: `© ${b.name}`, links: [] },
    meta: {
      engine: "kora-creative/1",
      direction: direction.index,
      generator: "deterministic",
    },
  });
  return { spec, direction, brandOs: osBase };
}

export interface DirectionPreviewV3 {
  index: 0 | 1 | 2;
  name: string;
  summary: string;
  look: string;
  palette: string;
  recommended: boolean;
  spec: SiteSpecV3;
  direction: CreativeDirection;
  brandOs: BrandOS;
}

/** Three genuinely different directions for one brief, each a complete validated spec. Nothing is persisted. */
export function planDirectionsV3(
  input: CreativeBrief,
  opts: PlanV3Options = {},
): {
  directions: DirectionPreviewV3[];
  recommended: { index: number; reason: string };
} {
  const dirs = composeDirections(input, opts.compose ?? {});
  const rec = chooseForMe(dirs, input);
  const directions = dirs.map((d) => {
    const { spec, brandOs } = planSiteV3(input, d, opts);
    return {
      index: d.index as 0 | 1 | 2,
      name: d.name,
      summary: d.concept,
      look: d.genome.compositionMode,
      palette: d.colorwayId,
      recommended: d.index === rec.index,
      spec,
      direction: d,
      brandOs,
    };
  });
  return { directions, recommended: { index: rec.index, reason: rec.reason } };
}
