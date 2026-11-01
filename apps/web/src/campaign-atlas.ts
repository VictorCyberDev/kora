export const CAMPAIGN_GOALS = [
  ["launch", "Launch something"],
  ["offer", "Promote an offer"],
  ["awareness", "Build awareness"],
  ["booking", "Get bookings"],
  ["lead", "Get enquiries"],
  ["product", "Show a product"],
  ["event", "Promote an event"],
  ["testimonial", "Share proof"],
  ["education", "Teach something"],
  ["retention", "Bring customers back"],
] as const;

const COMPOSITIONS = [
  ["hero-offer", "Hero offer"],
  ["editorial-poster", "Editorial poster"],
  ["product-cutout", "Product spotlight"],
  ["photo-type-lockup", "Photo + type"],
  ["split-proof", "Split proof"],
  ["price-stack", "Price stack"],
  ["before-after", "Before / after"],
  ["quote-spotlight", "Quote spotlight"],
  ["service-menu", "Service menu"],
  ["event-card", "Event card"],
  ["countdown", "Countdown"],
  ["announcement", "Announcement"],
  ["carousel-cover", "Carousel cover"],
  ["carousel-list", "Carousel list"],
  ["story-vertical", "Story vertical"],
  ["status-square", "Status square"],
  ["whatsapp-flyer", "WhatsApp flyer"],
  ["minimal-type", "Minimal type"],
  ["collage", "Collage"],
  ["local-proof", "Local proof"],
] as const;

const VERTICALS = [
  ["barber", "Barbershop", ["barber", "barbershop", "barbing", "haircut", "fade"]],
  ["salon-beauty", "Beauty salon", ["salon", "beauty", "braid", "lashes", "makeup"]],
  ["nail-studio", "Nail studio", ["nail", "manicure", "pedicure"]],
  ["spa-wellness", "Spa & wellness", ["spa", "massage", "wellness", "skincare"]],
  ["fashion-boutique", "Fashion boutique", ["boutique", "fashion", "clothing", "shoes", "bags"]],
  ["tailor", "Tailoring & fashion design", ["tailor", "seamstress", "bespoke", "aso ebi"]],
  ["cake-business", "Cake & bakery", ["cake", "bakery", "baker", "cupcake", "pastry"]],
  ["restaurant", "Restaurant", ["restaurant", "dining", "grill", "eatery", "cuisine"]],
  ["bukka", "Bukka & local food", ["bukka", "local food", "jollof", "swallow", "food vendor"]],
  ["catering", "Catering", ["catering", "caterer", "small chops", "event food"]],
  ["hotel-shortlet", "Hotel & shortlet", ["hotel", "shortlet", "guesthouse", "lodge", "apartment"]],
  ["real-estate", "Real estate", ["real estate", "property", "realtor", "land", "rentals"]],
  ["law", "Law firm", ["law", "lawyer", "legal", "solicitor", "attorney"]],
  ["accounting", "Accounting & tax", ["accounting", "accountant", "tax", "audit", "bookkeeping"]],
  ["consulting", "Consultancy & coaching", ["consultant", "consulting", "coach", "advisory"]],
  ["clinic", "Medical clinic", ["clinic", "medical", "doctor", "health centre", "physio"]],
  ["dental", "Dental clinic", ["dental", "dentist", "teeth", "orthodont"]],
  ["pharmacy", "Pharmacy", ["pharmacy", "chemist", "medicine", "drug store"]],
  ["diagnostics", "Diagnostics & laboratory", ["laboratory", "diagnostic", "medical test"]],
  ["school", "School & academy", ["school", "academy", "nursery", "primary", "secondary"]],
  ["tutoring", "Tutoring & lessons", ["tutor", "tutoring", "lessons", "training centre"]],
  ["daycare", "Daycare & childcare", ["daycare", "childcare", "creche", "preschool"]],
  ["church", "Church & faith community", ["church", "ministry", "parish", "fellowship", "mosque"]],
  ["ngo", "NGO & foundation", ["ngo", "nonprofit", "foundation", "charity"]],
  ["events", "Events & weddings", ["event", "wedding", "planner", "decorator", "party"]],
  ["photography", "Photography & video", ["photography", "photographer", "videography", "photo studio"]],
  ["music-dj", "Music & DJ", ["dj", "music", "sound", "entertainment"]],
  ["interior-design", "Interior design", ["interior", "decor", "furnishing", "space planning"]],
  ["architecture", "Architecture practice", ["architect", "architecture", "building design"]],
  ["construction", "Construction & building", ["construction", "contractor", "builder", "renovation"]],
  ["electrical", "Electrical services", ["electrician", "electrical", "wiring", "inverter"]],
  ["plumbing", "Plumbing services", ["plumber", "plumbing", "pipe", "leak"]],
  ["ac-repair", "AC & refrigeration", ["air conditioning", "ac repair", "refrigeration", "hvac"]],
  ["generator-solar", "Generator & solar", ["generator", "solar", "inverter", "renewable"]],
  ["auto-repair", "Auto repair", ["mechanic", "garage", "car repair", "vehicle repair"]],
  ["car-wash", "Car wash & detailing", ["car wash", "detailing", "vehicle wash"]],
  ["logistics", "Logistics & dispatch", ["logistics", "dispatch", "delivery", "courier", "haulage"]],
  ["cleaning", "Cleaning & laundry", ["cleaning", "laundry", "dry cleaning", "janitorial"]],
  ["electronics-repair", "Phone & electronics repair", ["phone repair", "electronics", "laptop repair"]],
  ["phone-accessories", "Phone & gadget store", ["phone accessories", "gadgets", "phones"]],
  ["grocery", "Grocery & minimart", ["grocery", "minimart", "provisions", "food store"]],
  ["supermarket", "Supermarket", ["supermarket", "mart", "retail store"]],
  ["pos-agent", "POS & agency banking", ["pos agent", "pos shop", "agency banking", "cash withdrawal"]],
  ["ecommerce", "Online store", ["online store", "ecommerce", "e-commerce", "shop online"]],
  ["crafts", "Handmade & crafts", ["craft", "handmade", "artisan", "beads", "leather"]],
  ["florist", "Florist", ["florist", "flowers", "bouquet", "floral"]],
  ["gym", "Gym & fitness", ["gym", "fitness", "trainer", "workout", "boxing"]],
  ["football-academy", "Sports academy", ["football academy", "sports academy", "soccer"]],
  ["travel", "Travel & tours", ["travel", "tour", "tourism", "visa", "holiday"]],
  ["import-export", "Import & export", ["import", "export", "procurement"]],
  ["printing", "Printing & signage", ["printing", "signage", "banner", "large format"]],
  ["branding-agency", "Branding & design agency", ["branding", "design agency", "graphic design"]],
  ["saas", "Software & SaaS", ["saas", "software", "platform", "app", "api", "startup"]],
  ["cybersecurity", "Cybersecurity & IT", ["cybersecurity", "it services", "network", "security technology"]],
  ["security-services", "Security services", ["security company", "guards", "surveillance"]],
  ["agriculture", "Agriculture & farm", ["farm", "agriculture", "farming", "produce", "agribusiness"]],
  ["poultry", "Poultry & livestock", ["poultry", "chicken", "livestock", "eggs"]],
  ["food-processing", "Food processing", ["food processing", "packaged food", "snacks", "beverage"]],
  ["furniture", "Furniture & carpentry", ["furniture", "carpentry", "woodwork", "cabinet"]],
  ["home-decor", "Home decor store", ["home decor", "decor store", "household decor"]],
  ["party-rentals", "Party rentals", ["party rental", "chairs", "canopy", "event rental"]],
  ["makeup-artist", "Makeup artist", ["makeup artist", "mua", "bridal makeup"]],
  ["creator", "Creator & portfolio", ["creator", "influencer", "portfolio", "personal brand"]],
  ["general-service", "Local business", []],
] as const;

export const CAMPAIGN_ATLAS_STATS = {
  verticals: VERTICALS.length,
  compositions: VERTICALS.length * CAMPAIGN_GOALS.length * COMPOSITIONS.length,
} as const;

const clean = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function campaignVerticalFor(query: string) {
  const q = ` ${clean(query)} `;
  let best = VERTICALS[VERTICALS.length - 1]!;
  let bestScore = 0;
  for (const vertical of VERTICALS) {
    let score = 0;
    for (const alias of vertical[2]) {
      const a = clean(alias);
      if (q.includes(` ${a} `)) score += 8 + a.length / 10;
      else if (q.includes(a)) score += 3 + a.length / 20;
    }
    if (score > bestScore) {
      best = vertical;
      bestScore = score;
    }
  }
  return { id: best[0], label: best[1] };
}

const hash = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export interface CampaignDirection {
  id: string;
  title: string;
  composition: string;
  layout: string;
  colorway: string;
  format: string;
}

export function campaignDirections(
  query: string,
  goal: string,
  layouts: string[],
  colorways: string[],
  formats: string[],
  limit = 8,
): CampaignDirection[] {
  const vertical = campaignVerticalFor(query);
  if (!layouts.length || !colorways.length || !formats.length) return [];
  const seed = hash(`${vertical.id}|${goal}`);
  const directions: CampaignDirection[] = [];

  for (let index = 0; index < Math.min(limit, COMPOSITIONS.length); index += 1) {
    const composition = COMPOSITIONS[(seed + index * 7) % COMPOSITIONS.length]!;
    const layout = layouts[(seed + index * 5) % layouts.length]!;
    const colorway = colorways[(seed + index * 3) % colorways.length]!;
    const preferredStory = composition[0].includes("story");
    const preferredSquare =
      composition[0].includes("square") ||
      composition[0].includes("whatsapp") ||
      composition[0].includes("carousel");
    const format =
      formats.find((f) => preferredStory && /story|portrait|vertical/i.test(f)) ??
      formats.find((f) => preferredSquare && /square/i.test(f)) ??
      formats[(seed + index) % formats.length]!;
    directions.push({
      id: `campaign-${vertical.id}-${goal}-${composition[0]}`,
      title: composition[1],
      composition: composition[0],
      layout,
      colorway,
      format,
    });
  }

  return directions;
}
