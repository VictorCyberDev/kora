/**
 * Business Blueprint. The structured understanding of a business that is built from a name and a sentence, before any
 * page is designed. It keeps what the owner said (OWNER_CONFIRMED), what is general knowledge about the trade
 * (INDUSTRY_GENERAL), what is merely a suggestion to confirm (SUGGESTED_UNCONFIRMED) and what is unknown (UNKNOWN)
 * strictly apart, so that nothing unconfirmed can silently become a statement about the business.
 *
 * Pure and deterministic: the same brief always yields the same blueprint, and no model is needed.
 */
import { buildTruth, type BusinessTruth, type CreativeBrief } from "./truth.js";
import {
  classifyVertical,
  type Cluster,
  type Intent,
  type PageKind,
  type VerticalIntel,
} from "./verticals.js";
import {
  profileFor,
  claimIssues,
  type IndustryProfile,
  type OfferTopic,
  type Provenance,
} from "./knowledge.js";

export const MAX_PAGES = 7;
export const MIN_PAGES = 4;

export interface ProvenanceRecord {
  field: string;
  provenance: Provenance;
  source: string;
}
export interface ConfidenceRecord {
  field: string;
  confidence: number;
  basis: string;
}
export interface VerifiedBusinessFact {
  key: string;
  value: string;
  provenance: "OWNER_CONFIRMED" | "VERIFIED_EXTERNAL";
}
export interface MissingBusinessFact {
  key: string;
  label: string;
  provenance: "UNKNOWN";
  /** What the site does instead of inventing it. */
  handling: string;
  /** A short question to ask the owner, or null when asking would not change the site. */
  ask: string | null;
}
export interface OfferCategory {
  id: string;
  label: string;
  provenance: "OWNER_CONFIRMED" | "SUGGESTED_UNCONFIRMED";
  /** The owner's own words that confirm it. Required for OWNER_CONFIRMED. */
  evidence?: string;
  topicId?: string;
  ownPage: boolean;
}

export type SectionPlanKind =
  | "hero-lite"
  | "statement"
  | "offer"
  | "topic-intro"
  | "what-to-include"
  | "gallery"
  | "process"
  | "approach"
  | "faq"
  | "story"
  | "visit"
  | "contact"
  | "cta";
export interface SectionPlan {
  kind: SectionPlanKind;
  topicId?: string;
}
export interface PagePlan {
  slug: string;
  title: string;
  nav: string;
  purpose: PageKind;
  goal: Intent;
  /** Why this page exists for this customer. */
  rationale: string;
  topicId?: string;
  sections: SectionPlan[];
}
export interface ImageSlot {
  slot: string;
  page: string;
  role: "hero" | "feature" | "gallery" | "about";
  subject: string;
}
export interface ImagePlan {
  searchIntents: string[];
  slots: ImageSlot[];
  /** How many distinct visual placements this site is designed to carry. */
  targetPlacements: number;
  visualRichness: "rich" | "moderate" | "light";
}
export interface ConversionStrategy {
  primary: Intent;
  secondary: Intent;
  channels: Array<"whatsapp" | "phone" | "email" | "form">;
  /** True when the only way to reach the owner is the on-site enquiry form. */
  formOnly: boolean;
  enquiryPrompts: string[];
}
export interface ContentPlan {
  voice: string;
  pageCount: number;
  /** Things the copy must never state about this business. */
  mustNotClaim: string[];
  industryGeneralSections: number;
}
export interface BrandDirectionHint {
  customer: string;
  jobToBeDone: string;
  trustBarrier: string;
  antiTraits: string[];
}

export interface BusinessBlueprint {
  schemaVersion: 1;
  identity: { name: string; description: string; location?: string };
  classification: {
    verticalId: string;
    label: string;
    cluster: Cluster;
    subcategory?: { id: string; label: string };
    confidence: number;
    alternatives: Array<{ id: string; score: number }>;
    evidence: string[];
    /** True when the description does not identify a trade. The site then stays broad instead of guessing. */
    ambiguous: boolean;
  };
  confirmedFacts: VerifiedBusinessFact[];
  inferredIndustryKnowledge: Array<{
    topicId: string;
    label: string;
    provenance: "INDUSTRY_GENERAL";
    profileVersion: string;
  }>;
  unknownFacts: MissingBusinessFact[];
  audiences: Array<{ label: string; provenance: "INDUSTRY_GENERAL" }>;
  customerIntents: Array<{ intent: Intent; label: string }>;
  /** What the owner said they offer, in their words. The only offerings a site may present as real. */
  confirmedOfferCategories: OfferCategory[];
  suggestedOfferCategories: OfferCategory[];
  conversionStrategy: ConversionStrategy;
  pageArchitecture: PagePlan[];
  contentPlan: ContentPlan;
  imagePlan: ImagePlan;
  brandStrategy: BrandDirectionHint;
  /** An optional, single, skippable question. Null when the site can proceed on what it has. */
  followUp: string | null;
  profile: { verticalId: string; profileVersion: string; validation: string };
  provenance: ProvenanceRecord[];
  confidence: ConfidenceRecord[];
}

const RICH_CLUSTERS: ReadonlySet<Cluster> = new Set<Cluster>([
  "food",
  "beauty",
  "creative",
  "retail",
  "hospitality",
]);

const up = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** A navigation label that fits without ever being cut: the first natural chunk, else the first two words. */
export function navLabel(s: string, max = 24): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const chunk = t.split(/\s+(?:and|&)\s+|,\s*/i)[0]!.trim();
  if (chunk.length <= max) return chunk;
  return t.split(/\s+/).slice(0, 2).join(" ").slice(0, max).trim();
}
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const MISSING_LABELS: Array<{
  needle: RegExp;
  key: string;
  label: string;
  handling: string;
  ask: string | null;
}> = [
  {
    needle: /reach you/,
    key: "contact",
    label: "A phone number, WhatsApp or email",
    handling:
      "A working on-site enquiry form is used. No phone number or address is shown.",
    ask: null,
  },
  {
    needle: /where you are/,
    key: "location",
    label: "Where you are or the area you serve",
    handling: "No address, map or area-specific wording is written.",
    ask: null,
  },
  {
    needle: /opening hours/,
    key: "hours",
    label: "Opening hours",
    handling: "No hours are shown.",
    ask: null,
  },
  {
    needle: /list of what you offer/,
    key: "offerings",
    label: "A list of what you offer",
    handling:
      "Offerings come only from the owner's sentence. Typical categories are shown as suggestions to confirm, not as a catalogue.",
    ask: "What are the main things you offer?",
  },
  {
    needle: /price list/,
    key: "prices",
    label: "Prices",
    handling: "No prices are shown; visitors are invited to enquire.",
    ask: null,
  },
  {
    needle: /own photos/,
    key: "photos",
    label: "Your own photos",
    handling:
      "Illustrative licensed photography is used and labelled as illustrative until the owner adds their own.",
    ask: null,
  },
  {
    needle: /logo/,
    key: "logo",
    label: "A logo",
    handling: "The business name is set in type.",
    ask: null,
  },
  {
    needle: /customer reviews/,
    key: "testimonials",
    label: "Real customer reviews",
    handling: "No testimonials are shown.",
    ask: null,
  },
];

/** Splits "cakes and small chops" style lists into clean items. */
function splitList(s: string): string[] {
  return s
    .split(/\s*(?:,|;|&|\band\b|\bplus\b)\s*/i)
    .map((x) =>
      x
        .replace(/^(?:also|then|some|lots of|a range of|all kinds of)\s+/i, "")
        .replace(/\b(?:for|in|at|around|across)\s+.*$/i, "")
        .trim(),
    )
    .filter((x) => x.length > 2 && x.length <= 48);
}

const OFFER_VERBS =
  "bake|make|sell|offer|provide|repair|fix|cook|cater|design|build|clean|install|teach|sew|supply|deliver|plan|organi[sz]e|photograph|style|braid|cut|treat|manage|rent|lease|buy";

/** What the owner says they do, in their words. Never from the vertical's defaults. */
function ownerOfferings(
  truth: BusinessTruth,
): Array<{ label: string; evidence: string }> {
  const b = truth.brief;
  const out: Array<{ label: string; evidence: string }> = [];
  for (const s of b.services ?? [])
    if (s.trim()) out.push({ label: up(s.trim()), evidence: s.trim() });
  if (out.length) return out;
  const m = new RegExp(
    `\\b(?:we|i|our team|my team)\\s+(?:also\\s+|mainly\\s+|specially\\s+)?(?:${OFFER_VERBS})s?\\s+([^.;\\n]+)`,
    "i",
  ).exec(b.description);
  if (m?.[1]) {
    const parts = splitList(m[1]);
    if (parts.length >= 1)
      return parts
        .slice(0, 8)
        .map((p) => ({ label: up(p), evidence: m[0].trim() }));
  }
  return out;
}

function matchTopic(profile: IndustryProfile, text: string): OfferTopic[] {
  return profile.topics.filter((t) => new RegExp(t.match, "i").test(text));
}

function classifySubcategory(profile: IndustryProfile, text: string) {
  const hit = profile.subcategories.find((s) =>
    new RegExp(s.match, "i").test(text),
  );
  return hit ? { id: hit.id, label: hit.label } : undefined;
}

export interface PageArchitectureInput {
  vertical: VerticalIntel;
  profile: IndustryProfile;
  truth: BusinessTruth;
  confirmed: OfferCategory[];
  ambiguous: boolean;
  visualCapacity: number;
}

const OFFER_PAGE_KINDS: PageKind[] = [
  "menu",
  "services",
  "products",
  "properties",
  "stay",
  "programmes",
];

/**
 * Chooses four to seven pages from what is known about the trade and the customer, never from how much the owner typed.
 * A short description changes how much is said, not whether the site is complete.
 */
export function planPages(i: PageArchitectureInput): PagePlan[] {
  const { vertical: v, profile, truth, confirmed, ambiguous } = i;
  const name = truth.brief.name;
  const hasContact = truth.can.phone || truth.can.whatsapp || truth.can.email;
  const goal = v.primaryIntent;
  const offerKind: PageKind =
    v.pages.find((p) => OFFER_PAGE_KINDS.includes(p)) ?? "services";
  const offerTitle: Record<string, string> = {
    menu: "Menu",
    services: v.offerHeading,
    products: "Products",
    properties: "Properties",
    stay: "Stay",
    programmes: "Programmes",
  };
  const pages: PagePlan[] = [];
  const add = (p: PagePlan) => {
    if (!pages.some((x) => x.slug === p.slug)) pages.push(p);
  };

  add({
    slug: "home",
    title: name,
    nav: "Home",
    purpose: "home",
    goal,
    rationale:
      "Introduces the business and routes visitors to what they came for.",
    sections: [],
  });

  // Offerings: one page each for up to two confirmed, page-worthy topics; otherwise one consolidated page.
  const pageTopics = confirmed.filter((c) => c.ownPage && c.topicId);
  if (!ambiguous && pageTopics.length >= 1 && pageTopics.length <= 2) {
    for (const c of pageTopics) {
      add({
        slug: slugify(c.label) || c.id,
        title: c.label,
        nav: navLabel(c.label),
        purpose: offerKind,
        goal,
        rationale: `Explains ${c.label.toLowerCase()} for a visitor deciding whether to enquire.`,
        topicId: c.topicId!,
        sections: [
          { kind: "hero-lite" },
          { kind: "topic-intro", topicId: c.topicId! },
          { kind: "what-to-include", topicId: c.topicId! },
          { kind: "gallery", topicId: c.topicId! },
          { kind: "cta" },
        ],
      });
    }
  } else {
    add({
      slug: offerKind === "services" ? "services" : offerKind,
      title: offerTitle[offerKind] ?? "Services",
      nav: navLabel(offerTitle[offerKind] ?? "Services"),
      purpose: offerKind,
      goal,
      rationale: ambiguous
        ? "Explains what the business does in the owner's own words."
        : "Lays out everything the business offers on one page.",
      sections: [
        { kind: "hero-lite" },
        { kind: "offer" },
        { kind: "process" },
        { kind: "cta" },
      ],
    });
  }

  // A way of working is a real page for trades that sell by conversation.
  const conversational = (
    ["quote", "enquire", "book", "inspect", "view-work"] as Intent[]
  ).includes(goal);
  if (
    conversational ||
    v.cluster === "creative" ||
    v.cluster === "tech" ||
    v.cluster === "professional"
  ) {
    add({
      slug: "approach",
      title: "How we work",
      nav: "How we work",
      purpose: "approach",
      goal: "trust",
      rationale:
        "Shows what working together looks like, so the first message feels safe to send.",
      sections: [
        { kind: "hero-lite" },
        { kind: "approach" },
        { kind: "process" },
        { kind: "cta" },
      ],
    });
  }

  // Imagery earns its own page only where pictures are the product.
  if (
    i.visualCapacity >= 3 &&
    (RICH_CLUSTERS.has(v.cluster) || v.photoTrust) &&
    !ambiguous
  ) {
    add({
      slug: "gallery",
      title: "Gallery",
      nav: "Gallery",
      purpose: "gallery",
      goal: "view-work",
      rationale: "Lets a visitor see the kind of work before they ask.",
      sections: [{ kind: "hero-lite" }, { kind: "gallery" }, { kind: "cta" }],
    });
  }

  add({
    slug: "about",
    title: `About ${name}`,
    nav: "About",
    purpose: "about",
    goal: "trust",
    rationale:
      "Says who is behind the business using only what the owner has told us.",
    sections: [
      { kind: "hero-lite" },
      { kind: "story" },
      { kind: "approach" },
      { kind: "cta" },
    ],
  });

  if (pages.length < 5 && profile.faq.length >= 2) {
    add({
      slug: "faq",
      title: "Questions",
      nav: "Questions",
      purpose: "faq",
      goal,
      rationale:
        "Answers the questions a customer has before they get in touch.",
      sections: [
        { kind: "hero-lite" },
        { kind: "faq" },
        { kind: "what-to-include" },
        { kind: "cta" },
      ],
    });
  }

  add({
    slug: "contact",
    title: "Contact",
    nav: "Contact",
    purpose: "contact",
    goal,
    rationale: hasContact
      ? "Gives every way to reach the owner that they supplied."
      : "Provides a working enquiry form because no other contact was supplied.",
    sections: [
      { kind: "hero-lite" },
      { kind: "contact" },
      ...(truth.can.location || truth.can.hours
        ? [{ kind: "visit" } as SectionPlan]
        : []),
      { kind: "faq" },
    ],
  });

  // Enforce the ceiling by dropping the most optional pages first, never home, offerings, about or contact.
  const dropOrder = ["faq", "gallery", "approach"];
  while (pages.length > MAX_PAGES) {
    const victim = dropOrder
      .map((s) => pages.findIndex((p) => p.slug === s))
      .find((ix) => ix >= 0);
    if (victim === undefined) {
      const extraOffer = pages
        .map((p, ix) => (p.topicId ? ix : -1))
        .filter((ix) => ix >= 0)
        .pop();
      pages.splice(extraOffer ?? pages.length - 2, 1);
    } else pages.splice(victim, 1);
  }
  // Home goes first, contact last, the rest keep the order they were chosen in.
  const home = pages.filter((p) => p.slug === "home");
  const contact = pages.filter((p) => p.slug === "contact");
  const middle = pages.filter((p) => p.slug !== "home" && p.slug !== "contact");
  return [...home, ...middle, ...contact];
}

function countSlots(pages: PagePlan[]): ImageSlot[] {
  const slots: ImageSlot[] = [];
  for (const p of pages)
    for (const [ix, s] of p.sections.entries()) {
      if (s.kind === "hero-lite" && p.slug !== "home") continue;
      if (s.kind === "gallery")
        slots.push(
          ...Array.from({ length: p.slug === "gallery" ? 6 : 3 }, (_, n) => ({
            slot: `${p.slug}.gallery.${n + 1}`,
            page: p.slug,
            role: "gallery" as const,
            subject: s.topicId ?? "general",
          })),
        );
      else if (s.kind === "story")
        slots.push({
          slot: `${p.slug}.story`,
          page: p.slug,
          role: "about",
          subject: "about",
        });
      else if (s.kind === "offer" || s.kind === "topic-intro")
        slots.push({
          slot: `${p.slug}.feature.${ix}`,
          page: p.slug,
          role: "feature",
          subject: s.topicId ?? "offer",
        });
    }
  slots.unshift({
    slot: "home.hero",
    page: "home",
    role: "hero",
    subject: "hero",
  });
  return slots;
}

export interface BlueprintOptions {
  /** How many usable pictures exist for this business right now (owner, catalogue or approved provider). */
  mediaAvailable?: number;
}

export function buildBlueprint(
  input: CreativeBrief,
  opts: BlueprintOptions = {},
): BusinessBlueprint {
  const truth = buildTruth(input);
  const b = truth.brief;
  const text = `${b.name} ${b.industry ?? ""} ${b.description}`;
  const cls = classifyVertical(text);
  const v = cls.vertical;
  const ambiguous = cls.generic || cls.confidence < 0.4;
  const profile = profileFor(v.id, v.offerNoun, v.usefulContent);
  const owner = ownerOfferings(truth);
  const ownerText = `${b.description} ${(b.services ?? []).join(" ")}`;
  const topicHits = ambiguous ? [] : matchTopic(profile, ownerText);

  const confirmed: OfferCategory[] = [];
  const seen = new Set<string>();
  const push = (c: OfferCategory) => {
    const k = c.label.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    confirmed.push(c);
  };
  // Owner-stated items first, tied to a topic when one fits, else kept as the owner wrote them.
  for (const o of owner) {
    const byLabel = ambiguous
      ? undefined
      : profile.topics.find((x) => new RegExp(x.match, "i").test(o.label));
    // A single stated offering ("I cut hair") is read in the owner's whole phrase, so it joins the topic it names instead of
    // appearing twice (once as "Hair", once as the topic). With several offerings each is judged by its own words only.
    const t =
      byLabel ??
      (!ambiguous && owner.length === 1
        ? profile.topics.find((x) => new RegExp(x.match, "i").test(o.evidence))
        : undefined);
    push({
      id: t && owner.length === 1 ? t.id : slugify(o.label),
      label:
        t &&
        (t.label.toLowerCase() === o.label.toLowerCase() || owner.length === 1)
          ? t.label
          : o.label,
      provenance: "OWNER_CONFIRMED",
      evidence: o.evidence,
      ...(t ? { topicId: t.id } : {}),
      ownPage: !!t?.ownPage,
    });
  }
  // Topics the owner's words clearly mention but that were not caught as list items.
  for (const t of topicHits)
    if (![...seen].some((k) => new RegExp(t.match, "i").test(k)))
      push({
        id: t.id,
        label: t.label,
        provenance: "OWNER_CONFIRMED",
        evidence: new RegExp(t.match, "i").exec(ownerText)?.[0] ?? t.label,
        topicId: t.id,
        ownPage: t.ownPage,
      });

  const suggested: OfferCategory[] = profile.topics
    .filter((t) => !confirmed.some((c) => c.topicId === t.id))
    .map((t) => ({
      id: t.id,
      label: t.label,
      provenance: "SUGGESTED_UNCONFIRMED" as const,
      topicId: t.id,
      ownPage: false,
    }));

  const richness: ImagePlan["visualRichness"] =
    RICH_CLUSTERS.has(v.cluster) || v.photoTrust
      ? "rich"
      : v.cluster === "tech"
        ? "light"
        : "moderate";
  const catalogued = Boolean(v.catalogRecipe);
  const pages = planPages({
    vertical: v,
    profile,
    truth,
    confirmed,
    ambiguous,
    visualCapacity: opts.mediaAvailable ?? (catalogued ? 4 : 0),
  });
  const slots =
    richness === "light" ? countSlots(pages).slice(0, 6) : countSlots(pages);
  const target =
    richness === "rich"
      ? Math.min(18, Math.max(10, slots.length))
      : richness === "moderate"
        ? Math.min(8, slots.length)
        : Math.min(5, slots.length);

  const unknownFacts: MissingBusinessFact[] = truth.missing.flatMap((m) => {
    const hit = MISSING_LABELS.find((x) => x.needle.test(m));
    return hit
      ? [
          {
            key: hit.key,
            label: hit.label,
            provenance: "UNKNOWN" as const,
            handling: hit.handling,
            ask: hit.key === "offerings" && confirmed.length ? null : hit.ask,
          },
        ]
      : [];
  });

  const channels: ConversionStrategy["channels"] = [];
  if (truth.can.whatsapp) channels.push("whatsapp");
  if (truth.can.phone) channels.push("phone");
  if (truth.can.email) channels.push("email");
  channels.push("form");

  const confirmedFacts: VerifiedBusinessFact[] = truth.facts.map((f) => ({
    key: f.key,
    value: f.value,
    provenance: "OWNER_CONFIRMED" as const,
  }));

  const sub = ambiguous
    ? undefined
    : classifySubcategory(profile, ownerText + " " + b.name);
  const followUp =
    ambiguous && !(b.services ?? []).length
      ? "What are the main things you offer? One line is enough, and you can skip this."
      : null;

  const provenance: ProvenanceRecord[] = [
    {
      field: "identity",
      provenance: "OWNER_CONFIRMED",
      source: "name and description",
    },
    {
      field: "classification",
      provenance: ambiguous ? "UNKNOWN" : "SUGGESTED_UNCONFIRMED",
      source: ambiguous
        ? "no trade identified"
        : `matched ${cls.evidence.join(", ")}`,
    },
    ...confirmed.map((c) => ({
      field: `offering:${c.id}`,
      provenance: c.provenance,
      source: c.evidence ?? "owner",
    })),
    ...suggested.map((c) => ({
      field: `suggestion:${c.id}`,
      provenance: c.provenance,
      source: `${profile.verticalId} profile ${profile.meta.profileVersion}`,
    })),
    ...unknownFacts.map((u) => ({
      field: `unknown:${u.key}`,
      provenance: "UNKNOWN" as const,
      source: "not supplied",
    })),
    {
      field: "page-copy",
      provenance: "INDUSTRY_GENERAL",
      source: `${profile.verticalId} profile ${profile.meta.profileVersion}`,
    },
  ];

  return {
    schemaVersion: 1,
    identity: {
      name: b.name,
      description: b.description,
      ...(b.location ? { location: b.location } : {}),
    },
    classification: {
      verticalId: v.id,
      label: ambiguous ? "General business" : v.label,
      cluster: v.cluster,
      ...(sub ? { subcategory: sub } : {}),
      confidence: cls.confidence,
      alternatives: cls.alternatives,
      evidence: cls.evidence,
      ambiguous,
    },
    confirmedFacts,
    inferredIndustryKnowledge: ambiguous
      ? []
      : profile.topics.map((t) => ({
          topicId: t.id,
          label: t.label,
          provenance: "INDUSTRY_GENERAL" as const,
          profileVersion: profile.meta.profileVersion,
        })),
    unknownFacts,
    audiences: [{ label: v.customer, provenance: "INDUSTRY_GENERAL" }],
    customerIntents: [
      { intent: v.primaryIntent, label: v.jobToBeDone },
      { intent: v.secondaryIntent, label: "Check the details before deciding" },
    ],
    confirmedOfferCategories: confirmed,
    suggestedOfferCategories: suggested,
    conversionStrategy: {
      primary: v.primaryIntent,
      secondary: v.secondaryIntent,
      channels,
      formOnly: channels.length === 1,
      enquiryPrompts: profile.enquiryPrompts,
    },
    pageArchitecture: pages,
    contentPlan: {
      voice: v.voiceRange.join(", "),
      pageCount: pages.length,
      mustNotClaim: [...profile.meta.restrictions, ...v.compliance],
      industryGeneralSections: pages.reduce(
        (n, p) =>
          n +
          p.sections.filter((s) =>
            [
              "topic-intro",
              "what-to-include",
              "approach",
              "faq",
              "process",
            ].includes(s.kind),
          ).length,
        0,
      ),
    },
    imagePlan: {
      searchIntents: (profile.searchIntents.length
        ? profile.searchIntents
        : v.imagery
      ).slice(0, 4),
      slots,
      targetPlacements: target,
      visualRichness: richness,
    },
    brandStrategy: {
      customer: v.customer,
      jobToBeDone: v.jobToBeDone,
      trustBarrier: v.trustBarrier,
      antiTraits: v.antiTraits,
    },
    followUp,
    profile: {
      verticalId: profile.verticalId,
      profileVersion: profile.meta.profileVersion,
      validation: profile.meta.validation,
    },
    provenance,
    confidence: [
      {
        field: "classification",
        confidence: cls.confidence,
        basis: cls.generic
          ? "no trade words found"
          : `matched: ${cls.evidence.join(", ")}`,
      },
      {
        field: "offerings",
        confidence: confirmed.length ? 0.9 : 0.2,
        basis: confirmed.length ? "stated by the owner" : "none stated",
      },
    ],
  };
}

/** Problems that make a blueprint unsafe to build from. Empty means fit to build. */
export function blueprintIssues(bp: BusinessBlueprint): string[] {
  const out: string[] = [];
  const n = bp.pageArchitecture.length;
  if (n < MIN_PAGES) out.push(`only ${n} pages planned (minimum ${MIN_PAGES})`);
  if (n > MAX_PAGES) out.push(`${n} pages planned (maximum ${MAX_PAGES})`);
  if (bp.pageArchitecture[0]?.slug !== "home") out.push("home is not first");
  if (!bp.pageArchitecture.some((p) => p.slug === "contact"))
    out.push("no contact page");
  const slugs = bp.pageArchitecture.map((p) => p.slug);
  if (new Set(slugs).size !== slugs.length) out.push("duplicate page slug");
  for (const c of bp.suggestedOfferCategories)
    if (c.provenance !== "SUGGESTED_UNCONFIRMED")
      out.push(`suggestion ${c.id} has wrong provenance`);
  for (const p of bp.pageArchitecture)
    if (p.sections.length < 2 && p.slug !== "home")
      out.push(`page ${p.slug} has fewer than two sections`);
  for (const f of bp.provenance)
    if (f.field.startsWith("offering:") && f.provenance !== "OWNER_CONFIRMED")
      out.push(`${f.field} is not owner confirmed`);
  for (const c of bp.confirmedFacts)
    if (claimIssues(c.key).length) out.push(`odd fact key ${c.key}`);
  return out;
}
