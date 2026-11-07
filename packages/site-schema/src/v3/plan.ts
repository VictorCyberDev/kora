/**
 * The v3 planner: Business Truth + a Creative Direction -> a validated SiteSpecV3.
 * It decides pages from customer intent, builds copy only from supplied facts and the vertical's plain verbs,
 * drops any section that has no fact behind it, and never calls a model. A model may later suggest wording, but only
 * through the same schema and the same checks.
 */
import {
  brandOsFromDirection,
  brandOsHash,
  buildBlueprint,
  buildTruth,
  chooseForMe,
  MAX_PAGES,
  profileFor,
  type PagePlan,
  composeDirections,
  rerankByTaste,
  ctaLabel,
  offerPhrase,
  resolveVertical,
  type BrandOS,
  type BusinessTruth,
  type ComposeOptions,
  type CreativeBrief,
  type CreativeDirection,
  type TasteSignals,
  type HeroLayout,
  type VerticalIntel,
} from "@kora/creative";
import {
  catalogExclude,
  catalogMediaPool,
  catalogTopicsForUrl,
  recipeForVertical,
} from "../v2/catalog.js";
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

/** Sentences that talk about the owner's situation or wishes, not the business; never public copy. */
const META =
  /\b(i|we)\s+(only\s+|just\s+)?(have|want|need|would like|am looking|are looking|hope)\b|\bmore\s+(bookings|customers|orders|sales|clients|leads)\b|\bmy\s+(photos?|logo|whatsapp|website)\b|\bphone photos?\b/i;
const HOME_BASED =
  /\bfrom\s+(my\s+)?home\b|home.?based|online only|delivery only|mobile (service|barber|mechanic)|we come to you|house calls?/i;

export interface OwnerPhotoInput {
  id: string;
  role: string;
  url: string;
  srcset: Array<{ url: string; width: number }>;
  alt: string;
  width: number;
  height: number;
  focal: { x: number; y: number };
  quality: {
    score: number;
    heroReady: boolean;
    orientation: "landscape" | "portrait" | "square";
    flags: string[];
  };
}
export interface OwnerLogoInput {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface PlanV3Options {
  /** Owner-supplied pictures, already validated (https/bundled + alt). Used before any stock. */
  /** The owner's own photos, already validated and re-encoded by the API. Used before any stock. */
  ownerPhotos?: OwnerPhotoInput[];
  ownerLogo?: OwnerLogoInput;
  /** Real reviews the owner supplied. Without them no testimonial section exists. */
  quotes?: Array<{ quote: string; author: string; role?: string }>;
  /** Real figures the owner supplied ("Since 2015", "3 branches") as value/label pairs. */
  facts?: Array<{ value: string; label: string }>;
  canonicalOrigin?: string;
  /** Overrides for the engine (owner re-rolled one direction, recent-design avoidance). */
  compose?: ComposeOptions;
  /** What this owner has repeatedly chosen (three or more judgements). Only moves the recommendation. */
  taste?: TasteSignals;
  previousBrandOsVersion?: number;
}

/** encodeURIComponent leaves ' unescaped, which safeHref rejects; escape it too. */
const enc = (s: string) => encodeURIComponent(s).replace(/'/g, "%27");
const cap = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
/**
 * Fits finished copy into a field without ever cutting it mid-thought. Whole sentences are kept while they fit; a single
 * over-long sentence is shortened at its last clause boundary and closed with a full stop. There is no ellipsis.
 */
export function fitText(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const sents = (t.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [t]).map((x) =>
    x.trim(),
  );
  let out = "";
  for (const x of sents) {
    const next = out ? `${out} ${x}` : x;
    if (next.length > n) break;
    out = next;
  }
  if (out) return out;
  const first = sents[0] ?? t;
  const boundary =
    /(?:,\s+(?:and|but|so|while|which|then)\s+|;\s+|\s[\u2013\u2014-]\s+|,\s+)/g;
  let cut = -1;
  for (let m = boundary.exec(first); m; m = boundary.exec(first))
    if (m.index > 12 && m.index <= n - 1) cut = m.index;
  const base =
    cut > 0
      ? first.slice(0, cut)
      : first.slice(0, n - 1).replace(/\s+\S*$/, "");
  return `${base.replace(/[\s,;:\u2013\u2014-]+$/, "")}.`;
}
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

const ROLE_WORD: Record<string, string> = {
  product: "Product photo",
  service: "Photo of our work",
  portfolio: "Portfolio photo",
  team: "Photo of the team",
  location: "Photo of the place",
  environment: "Photo of the space",
  process: "Photo of the process",
  gallery: "Photo",
  general: "Photo",
};
const MEDIA_ROLE: Record<string, MediaV3["role"]> = {
  product: "product",
  team: "about",
  gallery: "gallery",
  portfolio: "gallery",
};

/** Usable owner pictures, best first: hero-ready ones lead, then by quality score. Blurry or tiny ones are left out. */
function ownerMedia(
  opts: PlanV3Options,
  name: string,
): { all: MediaV3[]; hero: MediaV3 | undefined } {
  const usable = (opts.ownerPhotos ?? []).filter(
    (p) => p.quality.score >= 40 && !p.quality.flags.includes("BLURRY"),
  );
  const ranked = [...usable].sort(
    (a, b) =>
      Number(b.quality.heroReady) - Number(a.quality.heroReady) ||
      b.quality.score - a.quality.score,
  );
  const toMedia = (p: OwnerPhotoInput): MediaV3 => ({
    url: p.url,
    alt: p.alt.trim() || `${ROLE_WORD[p.role] ?? "Photo"} from ${name}`,
    width: p.width,
    height: p.height,
    focalPoint: p.focal,
    ...(p.srcset.length ? { srcset: p.srcset } : {}),
    role: MEDIA_ROLE[p.role] ?? "feature",
    treatment: "none",
    provenance: {
      sourceType: "owner-supplied",
      reviewStatus: "owner-approved",
    },
  });
  const heroPick = ranked.find((p) => p.quality.heroReady && p.role !== "team");
  const all = ranked.map(toMedia);
  const hero = heroPick ? toMedia(heroPick) : undefined;
  // hero first, then the rest in rank order (without repeating it)
  return {
    all: hero ? [hero, ...all.filter((m) => m.url !== hero.url)] : all,
    hero,
  };
}

/**
 * Media hierarchy: the owner's real, good pictures first; then licensed stock that genuinely matches the trade;
 * otherwise nothing (the design then leads with type and honest graphics). A weak picture is never used just because
 * it exists: blurry and tiny ones are skipped, and a low-resolution one is never the hero.
 */
function mediaFor(
  vertical: VerticalIntel,
  mode: "light" | "dark",
  opts: PlanV3Options,
  name: string,
  topicIds: readonly string[] = [],
): {
  media: MediaV3[];
  hero: MediaV3 | undefined;
  source: "owner" | "stock" | "none";
  ownerCount: number;
} {
  const own = ownerMedia(opts, name);
  if (own.all.length)
    return {
      media: own.all,
      hero: own.hero,
      source: "owner",
      ownerCount: own.all.length,
    };
  const recipe = recipeForVertical(vertical.id);
  const ex = catalogExclude(vertical.id);
  // The trade's own pictures plus any picture tagged for an offering the owner confirmed (a bakery that sells small chops
  // draws those too). Never a picture for something the owner did not say.
  const stock = catalogMediaPool(recipe, topicIds, mode, 18)
    .filter((m) => !ex || !ex.test(m.alt))
    .map((m): MediaV3 => ({
      url: m.url,
      alt: m.alt,
      ...(m.width ? { width: m.width } : {}),
      ...(m.height ? { height: m.height } : {}),
      ...(m.focalPoint ? { focalPoint: m.focalPoint } : {}),
      role: "feature",
      treatment: "none",
      provenance: {
        sourceType: "licensed-stock",
        provider: "Pexels",
        ...(m.license ? { license: m.license } : {}),
        ...(m.attribution ? { attribution: m.attribution } : {}),
        reviewStatus: "kora-curated",
      },
    }));
  return {
    media: stock,
    hero: stock[0],
    source: stock.length ? "stock" : "none",
    ownerCount: 0,
  };
}

const PHOTO_HEROES: readonly HeroLayout[] = [
  "cinematic",
  "arch-portrait",
  "product-dominant",
  "collage",
  "editorial-split",
];
const TYPE_HEROES: readonly HeroLayout[] = [
  "type-dominant",
  "poster",
  "ticker-energy",
  "menu-focus",
  "location-focus",
  "minimal-statement",
];
const FUNCTIONAL_HEROES: readonly HeroLayout[] = [
  "call-first",
  "booking-focus",
];

/**
 * The composition follows the assets. A strong owner photograph makes the design photography-led; no usable picture
 * makes it typographic or graphic. Function-first heroes (call, booking) are never swapped.
 */
function adaptHero(
  want: HeroLayout,
  alt: readonly HeroLayout[],
  a: {
    hasHeroPhoto: boolean;
    photoTrust: boolean;
    ownerHero: boolean;
    quiet: boolean;
  },
): HeroLayout {
  if (FUNCTIONAL_HEROES.includes(want)) return want;
  // A menu card is the fallback for having no picture; with a good one the picture leads.
  if (want === "menu-focus" && a.hasHeroPhoto)
    return alt.includes("arch-portrait") ? "arch-portrait" : "editorial-split";
  if (
    a.ownerHero &&
    !PHOTO_HEROES.includes(want) &&
    want !== "minimal-statement"
  )
    return alt.find((h) => PHOTO_HEROES.includes(h)) ?? "editorial-split";
  if (
    !a.hasHeroPhoto &&
    PHOTO_HEROES.includes(want) &&
    (a.photoTrust || a.quiet)
  )
    return alt.find((h) => TYPE_HEROES.includes(h)) ?? "type-dominant";
  return want;
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
  // What the owner said they offer decides which topic-tagged pictures are relevant, so the blueprint is read first.
  const confirmedTopics = buildBlueprint(input)
    .confirmedOfferCategories.map((c) => c.topicId)
    .filter((t): t is string => !!t);
  const mp = mediaFor(v, colorway.mode, opts, b.name, confirmedTopics);
  const media = mp.media;
  const hasMedia = media.length > 0;
  const bp = buildBlueprint(input, { mediaAvailable: media.length });
  const profile = profileFor(v.id, v.offerNoun, v.usefulContent);
  const topicById = (id?: string) => profile.topics.find((t) => t.id === id);
  const firstSentence = (x: string) => sentences(x)[0] ?? x;
  const confirmedCats = bp.confirmedOfferCategories;
  const services = confirmedCats.length
    ? confirmedCats.map((c) => c.label).slice(0, 12)
    : servicesOf(truth, thing);
  const topicForService = (label: string) =>
    topicById(confirmedCats.find((c) => c.label === label)?.topicId);
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
  const subheading = fitText(
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
    !["cinematic", "arch-portrait"].includes(g.heroPhilosophy) &&
    // one in four call-led businesses opens differently (the phone stays one tap away in the action dock)
    fnvH(`${seed}|hero`) % 4 !== 3
      ? "call-first"
      : g.heroPhilosophy;
  const gram = GRAMMARS.find((x) => x.id === direction.grammarId);
  const heroLayout = resolveHero(
    adaptHero(wantHero, gram?.alternates.hero ?? [], {
      hasHeroPhoto: !!mp.hero,
      photoTrust: v.photoTrust,
      ownerHero: mp.source === "owner" && !!mp.hero,
      quiet:
        g.accentScarcity === "rare" || g.paletteBehavior === "soft-neutral",
    }),
    {
      hasMedia: !!mp.hero,
      truth,
      highlights: highlights.length,
    },
  );
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
  const heroMedia = mp.hero;

  const hero = (
    layout: HeroLayout,
    o: {
      heading: string;
      sub: string;
      eyebrow?: string | undefined;
      ctas?: boolean;
      /** Subpages do not inherit the home hero photo; they show their own picture or none. */
      pic?: MediaV3 | undefined;
      own?: boolean;
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
    variant: layout === "call-first" ? fnvH(`${seed}|cv`) % 3 : 0,
    ...(o.own
      ? o.pic
        ? { media: { ...o.pic, role: "hero" as const } }
        : {}
      : heroMedia && layout !== "type-dominant"
        ? { media: { ...heroMedia, role: "hero" as const } }
        : {}),
    plate: plateFor(0),
  });
  const lite = (title: string, sub: string, pic?: MediaV3): SectionV3 =>
    // With a picture of its own the opening is a statement over the picture; without one it leads with type, never a placeholder.
    hero(pic ? "minimal-statement" : "type-dominant", {
      heading: cap(title, 100),
      sub,
      ctas: false,
      own: true,
      pic,
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
    text: topicForService(s) ? firstSentence(topicForService(s)!.intro) : "",
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
      body: [fitText(body, 880)],
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
  const process = (): SectionV3 | null => ({
    type: "process",
    layout: g.processPresentation,
    heading:
      v.primaryIntent === "book"
        ? "How to book"
        : v.primaryIntent === "quote"
          ? "How to get a quote"
          : v.primaryIntent === "order"
            ? "How to order"
            : "How to get started",
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
  });

  const compact = <T>(a: Array<T | null>): T[] =>
    a.filter((x): x is T => x !== null);

  const used = new Set<string>(heroMedia ? [heroMedia.url] : []);
  /** Pictures for one page, preferring ones no earlier page has used and ones that match the subject. */
  const pickMedia = (
    subjects: string[],
    n: number,
    topicId?: string,
  ): MediaV3[] => {
    // A picture is relevant to a topic when the owner supplied it (they chose it) or the catalogue tags it for that topic.
    // A catalogue picture tagged for another topic, or untagged, never stands in for an offering it does not show.
    const relevant = (m: MediaV3) => {
      if (!topicId || m.provenance.sourceType === "owner-supplied") return true;
      return catalogTopicsForUrl(m.url)?.includes(topicId) ?? false;
    };
    const words = subjects
      .join(" ")
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const scored = media
      .filter(relevant)
      .map((m, ix) => ({
        m,
        ix,
        score:
          words.filter((w) => m.alt.toLowerCase().includes(w)).length * 2 -
          (used.has(m.url) ? 1 : 0),
      }))
      .sort((x, y) => y.score - x.score || x.ix - y.ix)
      .slice(0, n)
      .map((x) => x.m);
    for (const m of scored) used.add(m.url);
    return scored;
  };
  const subLabel = `${b.name}${cty ? ` · ${cty}` : ""}`;
  const storyOf = (
    heading: string,
    body: string[],
    pic: MediaV3 | undefined,
    values: string[] = [],
  ): SectionV3 => ({
    type: "story",
    layout:
      pic && g.imageDominance !== "none"
        ? "split-image"
        : g.compositionMode === "centered-classical"
          ? "founder-note"
          : g.compositionMode === "split-narrative" ||
              g.compositionMode === "editorial-asymmetric"
            ? "manifesto"
            : "craft",
    heading: cap(heading, 100),
    body: body.map((x) => fitText(x, 880)).slice(0, 4),
    values: values.slice(0, 6).map((x) => cap(x, 70)),
    ...(pic
      ? { media: { ...pic, role: "feature" as const } }
      : { plate: plateFor(heading.length) }),
  });
  const includeList = (items: string[], heading: string): SectionV3 | null =>
    items.length >= 2
      ? {
          type: "process",
          layout: g.processPresentation,
          eyebrow: "Your enquiry",
          heading: cap(heading, 90),
          intro: "",
          items: items
            .slice(0, 6)
            .map((t) => ({ title: cap(t, 100), text: "" })),
        }
      : null;
  const approachSection = (): SectionV3 | null =>
    profile.approachNotes.length >= 2
      ? {
          type: "process",
          layout: g.processPresentation,
          eyebrow: "Getting started",
          heading: "How to get started",
          intro: "",
          items: profile.approachNotes.slice(0, 5).map((n) => ({
            title: cap(n.title, 100),
            text: fitText(n.text, 400),
          })),
        }
      : process();
  const faqSection = (): SectionV3 | null => {
    const items = profile.faq.map((f) => ({
      question: cap(f.question, 200),
      answer: fitText(f.answer, 700),
    }));
    const contactQ = faq();
    if (contactQ && contactQ.type === "faq") items.push(...contactQ.items);
    return items.length >= 2
      ? {
          type: "faq",
          layout: "accordion",
          heading: "Good to know",
          items: items.slice(0, 8),
        }
      : null;
  };
  const offerFull = (): SectionV3 | null => {
    const sec = main();
    if (!sec || (sec.type !== "offer" && sec.type !== "products")) return sec;
    return {
      ...sec,
      items: sec.items.map((it) => {
        const t = topicForService(it.title);
        return t ? { ...it, text: fitText(t.intro, 400) } : it;
      }),
    };
  };

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
    "stacked-utility": [
      [main(), proof(), gallery(), faq(), contact()],
      [statement(), main(), process(), faq(), contact()],
      [main(), gallery(), proof(), visit(), contact()],
    ][fnvH(`${seed}|seq`) % 3]!,
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
  // A home page is a complete introduction: how to start and the questions people have are always answered, whatever
  // the composition mode left out. Each is added before the closing action and only while there is room.
  const beforeClose = (sec: SectionV3 | null) => {
    if (!sec || homeSections.length >= 10) return;
    if (homeSections.some((x) => x.type === sec.type)) return;
    const at = homeSections.findIndex(
      (x) => x.type === "cta" || x.type === "contact",
    );
    homeSections.splice(at < 0 ? homeSections.length : at, 0, sec);
  };
  beforeClose(approachSection());
  beforeClose(faqSection());
  homeSections = homeSections.slice(0, 12);

  const home: Page = {
    slug: "home",
    title: b.name,
    purpose: "home",
    conversionGoal: v.primaryIntent,
    sections: homeSections,
  };

  // ---- subpages from the Business Blueprint: chosen from the trade and the customer, never from how much was typed
  const build = (plan: PagePlan): Page | null => {
    const topic = topicById(plan.topicId);
    const pics = topic ? pickMedia(topic.imageSubjects, 4, topic.id) : [];
    const secs: Array<SectionV3 | null> = plan.sections.map((sp) => {
      switch (sp.kind) {
        case "hero-lite":
          return lite(
            plan.title,
            plan.slug === "contact"
              ? b.name
              : topic
                ? `${b.name} · ${topic.label}`
                : subLabel,
            pics[0],
          );
        case "topic-intro":
          return topic
            ? {
                ...storyOf(topic.label, [topic.intro], pics[1] ?? pics[0]),
                eyebrow: "About this",
              }
            : null;
        case "what-to-include":
          return includeList(
            topic?.considerations ?? profile.enquiryPrompts,
            "What to include when you get in touch",
          );
        case "offer":
          return offerFull();
        case "process":
          return plan.slug === "approach"
            ? includeList(
                profile.enquiryPrompts,
                "What to bring to the first conversation",
              )
            : process();
        case "approach":
          return plan.slug === "about"
            ? includeList(profile.enquiryPrompts, "Before you get in touch")
            : approachSection();
        case "story": {
          const own = fitText(sents.join(" ") || b.description, 880);
          return storyOf(
            `About ${b.name}`,
            [own],
            pickMedia(["about team workspace"], 1)[0],
            services,
          );
        }
        case "gallery": {
          const set = topic
            ? pics.slice(2)
            : pickMedia(
                [profile.searchIntents.join(" ")],
                plan.slug === "gallery" ? 6 : 3,
              );
          return set.length >= 2
            ? {
                type: "gallery",
                layout:
                  plan.slug === "gallery"
                    ? g.compositionMode === "monograph"
                      ? "pair"
                      : "grid"
                    : "grid",
                heading: plan.slug === "gallery" ? "" : "A look at the style",
                ...(mp.source === "stock"
                  ? { eyebrow: "Illustrative photography" }
                  : {}),
                items: set.map((m) => ({
                  caption: "",
                  media: { ...m, role: "gallery" as const },
                })),
              }
            : null;
        }
        case "faq":
          return faqSection();
        case "visit":
          return visit();
        case "contact":
          return contact(
            plan.slug === "contact" && contactLayout === "visit"
              ? "enquiry-form"
              : contactLayout,
          );
        case "cta":
          return cta();
        default:
          return null;
      }
    });
    const sections = compact(secs);
    if (sections.length < 3 && plan.slug !== "contact") return null;
    return {
      slug: plan.slug,
      title: cap(plan.title, 80),
      nav: cap(plan.nav, 28),
      purpose: plan.purpose,
      conversionGoal: plan.goal,
      sections,
    };
  };
  const pages: Page[] = [home];
  for (const plan of bp.pageArchitecture) {
    if (plan.slug === "home") continue;
    const pg = build(plan);
    if (pg) pages.push(pg);
  }
  pages.splice(MAX_PAGES);

  // No picture appears more than twice on a site. A small pool is stretched with honest graphics and type, never with
  // the same photograph again and again; a gallery that would be left with fewer than two pictures is dropped.
  // Pictures are claimed in order of how much a page needs them: the home opening, the gallery page, pages built for one
  // offering (they may show only that offering), then everything else.
  {
    const uses = new Map<string, number>();
    const over = (m?: { url: string }) => {
      if (!m) return false;
      const n = (uses.get(m.url) ?? 0) + 1;
      uses.set(m.url, n);
      return n > 2;
    };
    const topicSlugs = new Set(
      bp.pageArchitecture.filter((p) => p.topicId).map((p) => p.slug),
    );
    const rank = (pg: Page, i: number) =>
      pg.slug === "home" && i === 0
        ? 0
        : pg.slug === "gallery"
          ? 1
          : topicSlugs.has(pg.slug)
            ? 2
            : pg.slug === "home"
              ? 3
              : 4;
    const slots = pages
      .flatMap((pg) => pg.sections.map((_, i) => ({ pg, i })))
      .sort(
        (x, y) =>
          rank(x.pg, x.i) - rank(y.pg, y.i) ||
          pages.indexOf(x.pg) - pages.indexOf(y.pg) ||
          x.i - y.i,
      );
    const dropped = new Set<SectionV3>();
    let ix = 0;
    for (const { pg, i } of slots) {
      const sec = pg.sections[i]!;
      const a = sec as unknown as {
        media?: { url: string };
        plate?: unknown;
        items?: Array<{ media?: { url: string }; plate?: unknown }>;
      };
      if (sec.type === "gallery") {
        const kept = (a.items ?? []).filter((it) => !over(it.media));
        if (kept.length < 2) dropped.add(sec);
        else (sec as unknown as { items: typeof kept }).items = kept;
        continue;
      }
      if (over(a.media)) {
        delete a.media;
        // A page opening that loses its photograph leads with type; only content blocks get a graphic in its place.
        if (sec.type !== "hero") a.plate = plateFor(++ix + 11);
      }
      for (const it of a.items ?? [])
        if (over(it.media)) {
          delete it.media;
          it.plate = plateFor(++ix + 23);
        }
    }
    for (const pg of pages) {
      pg.sections = pg.sections.filter((x) => !dropped.has(x));
      // A gallery keeps its rows whole: a three-column grid holds three or six, anything else is shown two across.
      for (const sec of pg.sections) {
        if (sec.type !== "gallery") continue;
        const n = sec.items.length;
        if (sec.layout === "grid" || sec.layout === "mosaic") {
          if (n === 2 || n === 4 || (sec.layout === "grid" && n === 5))
            sec.layout = "pair";
          if (sec.layout === "pair" && n === 5)
            sec.items = sec.items.slice(0, 4);
          if (sec.layout === "grid" && (n === 7 || n === 8))
            sec.items = sec.items.slice(0, 6);
        }
      }
    }
    // A page that has lost everything but its heading and a button is not a page.
    for (let i = pages.length - 1; i > 0; i--) {
      const pg = pages[i]!;
      if (
        pg.slug !== "contact" &&
        !pg.sections.some((x) => !["hero", "cta", "contact"].includes(x.type))
      )
        pages.splice(i, 1);
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
  // With several good owner photographs the design becomes photography-led; with none it stays typographic or graphic.
  const effGenome =
    mp.source === "owner" &&
    mp.ownerCount >= 3 &&
    g.imageDominance !== "dominant"
      ? { ...g, imageDominance: "dominant" as const }
      : g;
  const logo = opts.ownerLogo
    ? {
        url: opts.ownerLogo.url,
        alt: opts.ownerLogo.alt || `${b.name} logo`,
        assetId: opts.ownerLogo.id,
        width: opts.ownerLogo.width,
        height: opts.ownerLogo.height,
      }
    : undefined;
  const osBase = brandOsFromDirection(
    { ...direction, genome: effGenome },
    {
      ...(logo ? { logoAssetId: logo.assetId } : {}),
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
    },
  );

  const spec = parseSiteSpecV3({
    version: 3,
    business: {
      name: b.name,
      description: fitText(sents.join(" ") || b.description, 600),
      industry: b.industry ?? "",
      ...(b.location ? { location: b.location } : {}),
      locationKind: homeBased ? "service-area" : "premises",
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.whatsapp ? { whatsapp: b.whatsapp.replace(/[^\d+]/g, "") } : {}),
      ...(b.email ? { email: b.email } : {}),
      hours: b.hours ?? [],
      social: [],
      language: "en",
      ...(logo ? { logo } : {}),
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
      genome: effGenome,
      palette,
      colorwayId: colorway.id,
      mode: colorway.mode,
      seed: fnvH(`${seed}`),
    },
    artDirection: direction.artDirection.map((x) =>
      mp.source === "owner"
        ? { ...x, preferredSource: "owner-supplied" as const }
        : x,
    ),
    seo: {
      title,
      description: fitText(sents.slice(0, 2).join(" ") || b.description, 175),
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
  const base = chooseForMe(dirs, input);
  const tasted = opts.taste
    ? rerankByTaste(dirs, base.scores, opts.taste)
    : null;
  const rec =
    tasted?.changed && tasted.because
      ? {
          ...base,
          index: tasted.index,
          reason: `${dirs[tasted.index]!.name}: ${tasted.because}, and it still fits what you told us.`,
        }
      : base;
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
