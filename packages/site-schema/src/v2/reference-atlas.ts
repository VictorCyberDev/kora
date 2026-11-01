import type { PaletteStrategy } from "./palette.js";

export type AtlasCluster =
  | "beauty"
  | "food"
  | "hospitality"
  | "professional"
  | "health"
  | "community"
  | "creative"
  | "trade"
  | "retail"
  | "digital";

export interface AtlasVertical {
  id: string;
  label: string;
  cluster: AtlasCluster;
  aliases: readonly string[];
  imageQuery: string;
}

const VERTICAL_SEEDS: ReadonlyArray<
  readonly [string, string, AtlasCluster, readonly string[]]
> = [
  [
    "barber",
    "Barbershop",
    "beauty",
    ["barber", "barbershop", "haircut", "fade", "shave", "grooming"],
  ],
  [
    "salon-beauty",
    "Beauty salon",
    "beauty",
    ["salon", "beauty", "hair", "braid", "makeup", "lashes"],
  ],
  [
    "nail-studio",
    "Nail studio",
    "beauty",
    ["nails", "manicure", "pedicure", "nail studio"],
  ],
  [
    "spa-wellness",
    "Spa & wellness",
    "beauty",
    ["spa", "massage", "wellness", "skincare"],
  ],
  [
    "fashion-boutique",
    "Fashion boutique",
    "retail",
    ["boutique", "fashion", "clothing", "apparel", "shoes", "bags"],
  ],
  [
    "tailor",
    "Tailoring & fashion design",
    "creative",
    ["tailor", "seamstress", "bespoke", "aso ebi", "fashion design"],
  ],
  [
    "cake-business",
    "Cake & celebration bakery",
    "food",
    ["cake", "cakes", "baker", "bakery", "cupcake", "pastry"],
  ],
  [
    "restaurant",
    "Restaurant",
    "food",
    ["restaurant", "dining", "grill", "bistro", "eatery", "cuisine"],
  ],
  [
    "bukka",
    "Bukka & local food",
    "food",
    ["bukka", "local food", "swallow", "jollof", "food vendor"],
  ],
  [
    "catering",
    "Catering",
    "food",
    ["caterer", "catering", "small chops", "event food"],
  ],
  [
    "hotel-shortlet",
    "Hotel & shortlet",
    "hospitality",
    ["hotel", "shortlet", "guesthouse", "lodge", "resort", "apartment"],
  ],
  [
    "real-estate",
    "Real estate",
    "professional",
    ["real estate", "property", "realtor", "estate agent", "land", "rentals"],
  ],
  [
    "law",
    "Law firm",
    "professional",
    ["law", "lawyer", "legal", "solicitor", "attorney", "litigation"],
  ],
  [
    "accounting",
    "Accounting & tax",
    "professional",
    ["accounting", "accountant", "tax", "audit", "bookkeeping", "payroll"],
  ],
  [
    "consulting",
    "Consultancy & coaching",
    "professional",
    ["consultant", "consulting", "coach", "advisory", "strategy"],
  ],
  [
    "clinic",
    "Medical clinic",
    "health",
    ["clinic", "medical", "doctor", "health centre", "physiotherapy"],
  ],
  [
    "dental",
    "Dental clinic",
    "health",
    ["dental", "dentist", "teeth", "orthodont"],
  ],
  [
    "pharmacy",
    "Pharmacy",
    "health",
    ["pharmacy", "chemist", "medicine", "drug store"],
  ],
  [
    "diagnostics",
    "Diagnostics & laboratory",
    "health",
    ["laboratory", "lab", "diagnostic", "medical test"],
  ],
  [
    "school",
    "School & academy",
    "community",
    ["school", "academy", "nursery", "primary school", "secondary school"],
  ],
  [
    "tutoring",
    "Tutoring & lessons",
    "community",
    ["tutor", "tutoring", "lessons", "course", "training centre"],
  ],
  [
    "daycare",
    "Daycare & childcare",
    "community",
    ["daycare", "childcare", "creche", "crèche", "preschool"],
  ],
  [
    "church",
    "Church & faith community",
    "community",
    ["church", "ministry", "parish", "fellowship", "mosque", "faith"],
  ],
  [
    "ngo",
    "NGO & foundation",
    "community",
    ["ngo", "nonprofit", "foundation", "charity", "community organization"],
  ],
  [
    "events",
    "Events & weddings",
    "creative",
    ["event", "wedding", "planner", "decorator", "party"],
  ],
  [
    "photography",
    "Photography & video",
    "creative",
    ["photography", "photographer", "videography", "studio", "photo"],
  ],
  [
    "music-dj",
    "Music & DJ",
    "creative",
    ["dj", "music", "sound", "audio", "entertainment"],
  ],
  [
    "interior-design",
    "Interior design",
    "creative",
    ["interior", "decor", "furnishing", "space planning"],
  ],
  [
    "architecture",
    "Architecture practice",
    "professional",
    ["architect", "architecture", "building design"],
  ],
  [
    "construction",
    "Construction & building",
    "trade",
    ["construction", "contractor", "builder", "renovation", "roofing"],
  ],
  [
    "electrical",
    "Electrical services",
    "trade",
    ["electrician", "electrical", "wiring", "inverter"],
  ],
  [
    "plumbing",
    "Plumbing services",
    "trade",
    ["plumber", "plumbing", "pipe", "leak"],
  ],
  [
    "ac-repair",
    "AC & refrigeration",
    "trade",
    ["air conditioning", "ac repair", "refrigeration", "hvac"],
  ],
  [
    "generator-solar",
    "Generator & solar",
    "trade",
    ["generator", "solar", "inverter", "renewable energy"],
  ],
  [
    "auto-repair",
    "Auto repair",
    "trade",
    ["mechanic", "garage", "car repair", "vehicle repair"],
  ],
  [
    "car-wash",
    "Car wash & detailing",
    "trade",
    ["car wash", "detailing", "vehicle wash"],
  ],
  [
    "logistics",
    "Logistics & dispatch",
    "trade",
    ["logistics", "dispatch", "delivery", "courier", "haulage"],
  ],
  [
    "cleaning",
    "Cleaning & laundry",
    "trade",
    ["cleaning", "laundry", "dry cleaning", "janitorial"],
  ],
  [
    "electronics-repair",
    "Phone & electronics repair",
    "trade",
    ["phone repair", "electronics", "laptop repair", "screen repair"],
  ],
  [
    "phone-accessories",
    "Phone & gadget store",
    "retail",
    ["phone accessories", "gadgets", "phones", "accessories"],
  ],
  [
    "grocery",
    "Grocery & minimart",
    "retail",
    ["grocery", "minimart", "provisions", "food store"],
  ],
  [
    "supermarket",
    "Supermarket",
    "retail",
    ["supermarket", "mart", "retail store"],
  ],
  [
    "pos-agent",
    "POS & agency banking",
    "professional",
    ["pos", "agency banking", "cash withdrawal", "agent banking"],
  ],
  [
    "ecommerce",
    "Online store",
    "retail",
    ["online store", "ecommerce", "e-commerce", "shop online"],
  ],
  [
    "crafts",
    "Handmade & crafts",
    "creative",
    ["craft", "handmade", "artisan", "beads", "leather"],
  ],
  [
    "florist",
    "Florist",
    "creative",
    ["florist", "flowers", "bouquet", "floral"],
  ],
  [
    "gym",
    "Gym & fitness",
    "beauty",
    ["gym", "fitness", "trainer", "workout", "boxing"],
  ],
  [
    "football-academy",
    "Sports academy",
    "community",
    ["football academy", "sports academy", "soccer", "sports training"],
  ],
  [
    "travel",
    "Travel & tours",
    "hospitality",
    ["travel", "tour", "tourism", "visa", "holiday"],
  ],
  [
    "import-export",
    "Import & export",
    "professional",
    ["import", "export", "trade", "procurement"],
  ],
  [
    "printing",
    "Printing & signage",
    "creative",
    ["printing", "signage", "banner", "large format"],
  ],
  [
    "branding-agency",
    "Branding & design agency",
    "creative",
    ["branding", "design agency", "graphic design", "creative agency"],
  ],
  [
    "saas",
    "Software & SaaS",
    "digital",
    ["saas", "software", "platform", "app", "api", "startup"],
  ],
  [
    "cybersecurity",
    "Cybersecurity & IT",
    "digital",
    ["cybersecurity", "it services", "network", "security technology"],
  ],
  [
    "security-services",
    "Security services",
    "professional",
    ["security company", "guards", "security services", "surveillance"],
  ],
  [
    "agriculture",
    "Agriculture & farm",
    "trade",
    ["farm", "agriculture", "farming", "produce", "agribusiness"],
  ],
  [
    "poultry",
    "Poultry & livestock",
    "trade",
    ["poultry", "chicken", "livestock", "eggs"],
  ],
  [
    "food-processing",
    "Food processing",
    "food",
    ["food processing", "packaged food", "snacks", "beverage"],
  ],
  [
    "furniture",
    "Furniture & carpentry",
    "creative",
    ["furniture", "carpentry", "woodwork", "cabinet"],
  ],
  [
    "home-decor",
    "Home decor store",
    "retail",
    ["home decor", "decor store", "household decor"],
  ],
  [
    "party-rentals",
    "Party rentals",
    "hospitality",
    ["party rental", "chairs", "canopy", "event rental"],
  ],
  [
    "makeup-artist",
    "Makeup artist",
    "beauty",
    ["makeup artist", "mua", "bridal makeup"],
  ],
  [
    "creator",
    "Creator & portfolio",
    "creative",
    ["creator", "influencer", "portfolio", "personal brand"],
  ],
  ["general-service", "Local business", "professional", []],
];

export const ATLAS_VERTICALS: readonly AtlasVertical[] = VERTICAL_SEEDS.map(
  ([id, label, cluster, aliases]) => ({
    id,
    label,
    cluster,
    aliases,
    imageQuery: `${label} Nigeria African business authentic photography`,
  }),
);

const ALL_LOOKS = [
  "gallery-editorial",
  "luxe-centered",
  "bold-grotesk",
  "soft-friendly",
  "local-trust",
  "tech-product",
  "dark-premium",
  "creative-collage",
  "portfolio-reel",
  "clinic-clean",
  "warm-craft",
  "bento-modern",
  "trade-solid",
  "corporate-calm",
  "dark-tech",
  "pop-local",
] as const;

const CLUSTERS: Record<
  AtlasCluster,
  { looks: readonly string[]; palettes: readonly PaletteStrategy[] }
> = {
  beauty: {
    looks: [
      "soft-friendly",
      "luxe-centered",
      "dark-premium",
      "creative-collage",
      "pop-local",
    ],
    palettes: [
      "plum-blush",
      "royal-ivory",
      "midnight-brass",
      "sunrise",
      "contrast-pop",
    ],
  },
  food: {
    looks: [
      "warm-craft",
      "soft-friendly",
      "creative-collage",
      "dark-premium",
      "pop-local",
    ],
    palettes: [
      "tomato-cream",
      "terracotta-sand",
      "sunrise",
      "midnight-brass",
      "contrast-pop",
    ],
  },
  hospitality: {
    looks: [
      "luxe-centered",
      "warm-craft",
      "dark-premium",
      "gallery-editorial",
      "soft-friendly",
    ],
    palettes: [
      "midnight-brass",
      "botanical",
      "terracotta-sand",
      "royal-ivory",
      "sage-linen",
    ],
  },
  professional: {
    looks: [
      "corporate-calm",
      "gallery-editorial",
      "luxe-centered",
      "bento-modern",
      "dark-premium",
    ],
    palettes: [
      "coastal-navy",
      "ink-paper",
      "royal-ivory",
      "indigo-tech",
      "midnight-brass",
    ],
  },
  health: {
    looks: [
      "clinic-clean",
      "corporate-calm",
      "soft-friendly",
      "local-trust",
      "gallery-editorial",
    ],
    palettes: [
      "clinic-teal",
      "coastal-navy",
      "sage-linen",
      "botanical",
      "royal-ivory",
    ],
  },
  community: {
    looks: [
      "soft-friendly",
      "corporate-calm",
      "local-trust",
      "bento-modern",
      "pop-local",
    ],
    palettes: [
      "sunrise",
      "botanical",
      "coastal-navy",
      "indigo-tech",
      "contrast-pop",
    ],
  },
  creative: {
    looks: [
      "gallery-editorial",
      "portfolio-reel",
      "creative-collage",
      "luxe-centered",
      "warm-craft",
    ],
    palettes: [
      "ink-paper",
      "terracotta-sand",
      "plum-blush",
      "royal-ivory",
      "contrast-pop",
    ],
  },
  trade: {
    looks: [
      "trade-solid",
      "local-trust",
      "bold-grotesk",
      "pop-local",
      "bento-modern",
    ],
    palettes: [
      "workshop",
      "coastal-navy",
      "sunrise",
      "graphite-lime",
      "contrast-pop",
    ],
  },
  retail: {
    looks: [
      "bento-modern",
      "creative-collage",
      "luxe-centered",
      "pop-local",
      "soft-friendly",
    ],
    palettes: [
      "contrast-pop",
      "plum-blush",
      "midnight-brass",
      "sunrise",
      "indigo-tech",
    ],
  },
  digital: {
    looks: [
      "tech-product",
      "dark-tech",
      "bento-modern",
      "corporate-calm",
      "bold-grotesk",
    ],
    palettes: [
      "indigo-tech",
      "graphite-lime",
      "coastal-navy",
      "ink-paper",
      "contrast-pop",
    ],
  },
};

export const WEBSITE_EMPHASES = ["story", "proof", "conversion"] as const;
export const CAMPAIGN_GOALS = [
  "launch",
  "offer",
  "awareness",
  "booking",
  "lead",
  "product",
  "event",
  "testimonial",
  "education",
  "retention",
] as const;
export const CAMPAIGN_LAYOUTS = [
  "hero-offer",
  "editorial-poster",
  "product-cutout",
  "photo-type-lockup",
  "split-proof",
  "price-stack",
  "before-after",
  "quote-spotlight",
  "service-menu",
  "event-card",
  "countdown",
  "announcement",
  "carousel-cover",
  "carousel-list",
  "story-vertical",
  "status-square",
  "whatsapp-flyer",
  "minimal-type",
  "collage",
  "local-proof",
] as const;

export const ATLAS_STATS = {
  verticals: ATLAS_VERTICALS.length,
  websiteBlueprints:
    ATLAS_VERTICALS.length * ALL_LOOKS.length * WEBSITE_EMPHASES.length,
  campaignBlueprints:
    ATLAS_VERTICALS.length * CAMPAIGN_GOALS.length * CAMPAIGN_LAYOUTS.length,
} as const;

const clean = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function resolveAtlasVertical(query: string): AtlasVertical {
  const q = ` ${clean(query)} `;
  let best = ATLAS_VERTICALS[ATLAS_VERTICALS.length - 1]!;
  let bestScore = 0;
  for (const vertical of ATLAS_VERTICALS) {
    let score = 0;
    for (const alias of vertical.aliases) {
      const a = clean(alias);
      if (!a) continue;
      if (q.includes(` ${a} `)) score += 8 + a.length / 10;
      else if (q.includes(a)) score += 3 + a.length / 20;
    }
    if (score > bestScore) {
      bestScore = score;
      best = vertical;
    }
  }
  return best;
}

export interface ReferenceProfile {
  vertical: AtlasVertical;
  lookId: string;
  paletteStrategy: PaletteStrategy;
  blueprintId: string;
  emphasis: (typeof WEBSITE_EMPHASES)[number];
  imageQuery: string;
}

export function referenceProfileFor(
  query: string,
  direction: 0 | 1 | 2 = 0,
  seed = 0,
): ReferenceProfile {
  const vertical = resolveAtlasVertical(query);
  const cluster = CLUSTERS[vertical.cluster];
  const index = Math.abs(seed + direction * 7) % cluster.looks.length;
  const emphasis = WEBSITE_EMPHASES[direction];
  const lookId = cluster.looks[index]!;
  const paletteStrategy = cluster.palettes[index % cluster.palettes.length]!;
  return {
    vertical,
    lookId,
    paletteStrategy,
    emphasis,
    blueprintId: `web-${vertical.id}-${lookId}-${emphasis}`,
    imageQuery: vertical.imageQuery,
  };
}

export interface WebsiteBlueprint {
  id: string;
  verticalId: string;
  verticalLabel: string;
  lookId: string;
  emphasis: (typeof WEBSITE_EMPHASES)[number];
  paletteStrategy: PaletteStrategy;
  imageQuery: string;
}

export function websiteBlueprintsFor(
  query: string,
  limit = 18,
): WebsiteBlueprint[] {
  const vertical = resolveAtlasVertical(query);
  const cluster = CLUSTERS[vertical.cluster];
  const lookOrder = [
    ...cluster.looks,
    ...ALL_LOOKS.filter((look) => !cluster.looks.includes(look)),
  ];
  const out: WebsiteBlueprint[] = [];
  for (const lookId of lookOrder) {
    const lookIndex = Math.max(0, cluster.looks.indexOf(lookId));
    for (const emphasis of WEBSITE_EMPHASES) {
      out.push({
        id: `web-${vertical.id}-${lookId}-${emphasis}`,
        verticalId: vertical.id,
        verticalLabel: vertical.label,
        lookId,
        emphasis,
        paletteStrategy:
          cluster.palettes[lookIndex % cluster.palettes.length] ??
          cluster.palettes[0]!,
        imageQuery: vertical.imageQuery,
      });
    }
  }
  return out.slice(0, Math.max(1, Math.min(limit, 48)));
}

export interface CampaignBlueprint {
  id: string;
  verticalId: string;
  goal: (typeof CAMPAIGN_GOALS)[number];
  layout: (typeof CAMPAIGN_LAYOUTS)[number];
}

export function campaignBlueprintsFor(
  query: string,
  limit = 24,
): CampaignBlueprint[] {
  const vertical = resolveAtlasVertical(query);
  const out: CampaignBlueprint[] = [];
  for (const goal of CAMPAIGN_GOALS)
    for (const layout of CAMPAIGN_LAYOUTS)
      out.push({
        id: `campaign-${vertical.id}-${goal}-${layout}`,
        verticalId: vertical.id,
        goal,
        layout,
      });
  return out.slice(0, Math.max(1, Math.min(limit, 200)));
}

/**
 * Reference Atlas is design memory, not a resale library of third-party templates.
 * Paid marketplace designs can be studied as references but their files are never
 * copied into Kora. Runtime assets must be owner-owned, generated and reviewed, or
 * come from a source whose licence permits the intended commercial use.
 */
export const ASSET_SOURCE_POLICY = [
  "owner-upload",
  "generated-reviewed",
  "pexels-commercial",
  "compatible-open-source",
  "cc0-public-domain",
] as const;
