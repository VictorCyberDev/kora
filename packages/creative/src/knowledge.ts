/**
 * Industry knowledge profiles. General, versioned knowledge about how a kind of business works, used to write useful
 * pages from a one-line description. Everything here is INDUSTRY_GENERAL: it explains the trade and advises the
 * customer, and it never asserts anything about the owner's business (no prices, hours, years, awards, delivery
 * promises, stock, places, people or results). `assertKnowledgeSafe` enforces that for every string in this file.
 */
import type { PageKind } from "./verticals.js";

export const PROVENANCE = [
  "OWNER_CONFIRMED",
  "VERIFIED_EXTERNAL",
  "INDUSTRY_GENERAL",
  "SUGGESTED_UNCONFIRMED",
  "UNKNOWN",
] as const;
export type Provenance = (typeof PROVENANCE)[number];

export interface KnowledgeMeta {
  /** Semantic version of this profile's content. Bump when the text changes. */
  profileVersion: string;
  /** Where the general knowledge comes from. Never a claim about the owner. */
  sources: string[];
  /** ISO date of the last editorial review. */
  reviewedAt: string;
  /** Regions the guidance was written for. */
  regions: string[];
  /** Industry-specific limits on what may be said. */
  restrictions: string[];
  validation: "editorial-reviewed" | "cluster-default";
}

export interface OfferTopic {
  id: string;
  label: string;
  /** Regex source matched against the owner's own words to confirm the topic. */
  match: string;
  /** What this kind of offering is, in general terms. */
  intro: string;
  /** What a customer usually needs to think about; used for guides and enquiry prompts. */
  considerations: string[];
  /** Photographic subjects for the media engine. */
  imageSubjects: string[];
  /** True when the topic deserves a page of its own once the owner has confirmed it. */
  ownPage: boolean;
}

export interface Subcategory {
  id: string;
  label: string;
  match: string;
}

export interface IndustryProfile {
  verticalId: string;
  subcategories: Subcategory[];
  topics: OfferTopic[];
  /** Questions customers really ask, answered as advice. Never as a claim about the business. */
  faq: Array<{ question: string; answer: string }>;
  /** What a good enquiry contains. */
  enquiryPrompts: string[];
  /** Grouped media search intents, most important first. */
  searchIntents: string[];
  /** What the About page may say when the owner has said little. */
  aboutAngle: string;
  /** Short approach statements about how to work well in this trade (general, not claims). */
  approachNotes: Array<{ title: string; text: string }>;
  meta: KnowledgeMeta;
}

const META_BASE = {
  sources: [
    "Kora editorial knowledge of the trade",
    "Kora reference atlas (docs/design)",
  ],
  reviewedAt: "2026-11-07",
  regions: ["global", "west-africa"],
  validation: "editorial-reviewed" as const,
};
const meta = (
  restrictions: string[] = [],
  version = "1.0.0",
): KnowledgeMeta => ({
  ...META_BASE,
  profileVersion: version,
  restrictions: [
    "no prices, hours, years, awards, ratings or customer counts",
    "no delivery, stock or availability promises",
    ...restrictions,
  ],
});

const topic = (
  id: string,
  label: string,
  match: string,
  intro: string,
  considerations: string[],
  imageSubjects: string[],
  ownPage = false,
): OfferTopic => ({
  id,
  label,
  match,
  intro,
  considerations,
  imageSubjects,
  ownPage,
});

export const PROFILES: readonly IndustryProfile[] = [
  {
    verticalId: "bakery",
    subcategories: [
      {
        id: "celebration-cakes",
        label: "Celebration cakes",
        match: "celebration|birthday|wedding|custom cake",
      },
      {
        id: "small-chops",
        label: "Cakes and small chops",
        match: "small chops",
      },
      {
        id: "everyday-bread",
        label: "Everyday bread",
        match: "bread|loaf|loaves",
      },
      {
        id: "wholesale-bakery",
        label: "Wholesale bakery",
        match: "wholesale|supply (cafes|shops)",
      },
      {
        id: "patisserie",
        label: "Patisserie",
        match: "patisserie|pastry|pastries|croissant",
      },
    ],
    topics: [
      topic(
        "cakes",
        "Cakes",
        "cakes?|cupcakes?|sponge|frosting|icing|birthday|wedding cake",
        "A good celebration cake starts with the occasion. The size, the flavours, the decoration and the date all shape what can be made, so the more you share up front, the closer the result will be to what you picture.",
        [
          "The occasion and the date",
          "How many people it needs to serve",
          "Flavours and any allergies or dietary needs",
          "A photo or colour idea for the decoration",
        ],
        [
          "celebration cake",
          "cake decoration",
          "cake frosting",
          "birthday cake",
        ],
        true,
      ),
      topic(
        "small-chops",
        "Small chops",
        "small chops?|puff.?puff|samosa|spring rolls?|finger food|party snacks?",
        "Small chops are bite-sized party snacks, often served as a mixed platter at weddings, birthdays, naming ceremonies and office events. Common favourites include puff-puff, samosas, spring rolls and skewers.",
        [
          "How many guests you expect",
          "The date and time of the event",
          "Which snacks you would like on the platter",
          "Collection or delivery arrangements to ask about",
        ],
        ["small chops platter", "nigerian party snacks", "finger food"],
        true,
      ),
      topic(
        "pastries",
        "Pastries",
        "pastr(?:y|ies)|croissants?|doughnuts?|donuts?|pies?|buns?",
        "Pastries and baked treats suit gatherings of every size, from a tea break to a celebration table.",
        ["Quantity and date", "Mixed selection or a single favourite"],
        ["fresh pastries", "baked goods"],
      ),
      topic(
        "bread",
        "Bread",
        "bread|loaf|loaves|rolls",
        "Bread is baked for everyday eating and for sharing, from soft sandwich loaves to crusty rolls.",
        ["Type of loaf", "How often you would like it"],
        ["fresh bread", "bakery counter"],
      ),
    ],
    faq: [
      {
        question: "What should I include when I ask about a cake?",
        answer:
          "Share the occasion, the date, roughly how many people it should serve, the flavours you like, any allergies, and a photo or colour idea for the decoration. The more detail you give, the easier it is to come back with the right options.",
      },
      {
        question: "Can I ask about small chops for an event?",
        answer:
          "Yes. Send the date, the number of guests and the snacks you have in mind through the enquiry form, and ask about collection or delivery arrangements at the same time.",
      },
      {
        question: "How early should I enquire about a celebration?",
        answer:
          "As early as you can. Dates fill up around weddings, holidays and the weekends, so an early message gives everyone room to plan.",
      },
      {
        question: "Where can I see examples of the work?",
        answer:
          "The gallery shows illustrative baking and party-food photography to give you a feel for the style. Ask in your enquiry for examples that match your occasion.",
      },
    ],
    enquiryPrompts: [
      "The occasion and date",
      "Number of guests",
      "Flavours or snacks you like",
      "Allergies or dietary needs",
      "Collection or delivery preference",
    ],
    searchIntents: [
      "celebration cakes",
      "nigerian small chops",
      "bakery preparation",
      "artisan pastry",
    ],
    aboutAngle:
      "A bakery earns trust through taste and care, so the story is told through the bakes themselves and the people who ask for them.",
    approachNotes: [
      {
        title: "Start with the occasion",
        text: "Every order begins with what you are celebrating and who is coming.",
      },
      {
        title: "Plan the details together",
        text: "Flavours, size, decoration and timing are agreed before baking starts.",
      },
      {
        title: "Ask early",
        text: "Busy weekends and holidays call for an early conversation.",
      },
    ],
    meta: meta([
      "no claims of freshness schedules, ingredients sourcing or delivery coverage",
    ]),
  },
  {
    verticalId: "catering",
    subcategories: [
      {
        id: "small-chops-caterer",
        label: "Small-chops catering",
        match: "small chops",
      },
      {
        id: "event-catering",
        label: "Event catering",
        match: "wedding|corporate|banquet|party",
      },
      {
        id: "meal-prep",
        label: "Meal delivery",
        match: "meal prep|meal plan|lunch box",
      },
    ],
    topics: [
      topic(
        "small-chops",
        "Small chops",
        "small chops?|puff.?puff|samosa|spring rolls?|finger food",
        "Small chops are bite-sized party snacks, usually served as a mixed platter. They suit weddings, birthdays and office events because guests can eat them with their hands and mingle.",
        [
          "Guest numbers",
          "Date, time and venue",
          "Snack choices",
          "Serving style and quantity to ask about",
        ],
        ["small chops platter", "party snacks", "catering buffet"],
        true,
      ),
      topic(
        "event-food",
        "Event catering",
        "event|wedding|party|corporate|banquet|buffet|cater",
        "Event catering works best when the menu is matched to the guest list, the venue and the time of day. Planning starts with who is coming and how the food will be served.",
        [
          "Type of event and date",
          "Number of guests",
          "Serving style",
          "Dietary needs",
        ],
        ["catering buffet", "event food"],
        true,
      ),
      topic(
        "jollof-rice",
        "Rice and mains",
        "jollof|rice|stew|grill|suya|soup",
        "Rice dishes, stews and grilled mains are staples at Nigerian gatherings and are usually planned by the tray or portion.",
        ["Choice of dishes", "Portions needed"],
        ["jollof rice", "grilled food"],
      ),
    ],
    faq: [
      {
        question: "What should I include in a catering enquiry?",
        answer:
          "Give the date, the venue, the number of guests, the kind of event and the food you have in mind. Mention any dietary needs too.",
      },
      {
        question: "Can I ask about a mix of dishes?",
        answer:
          "Yes. Describe what you would like and ask what combinations are possible for your event.",
      },
      {
        question: "How early should I ask?",
        answer: "As soon as the date is fixed. Busy seasons book up quickly.",
      },
    ],
    enquiryPrompts: [
      "Date and venue",
      "Number of guests",
      "Kind of event",
      "Dishes you have in mind",
      "Dietary needs",
    ],
    searchIntents: [
      "catering buffet",
      "nigerian small chops",
      "event food",
      "party platter",
    ],
    aboutAngle:
      "Catering is trusted through clear planning and good food, so the story is about how events are handled.",
    approachNotes: [
      {
        title: "Plan around the guest list",
        text: "The menu and the quantities start from who is coming.",
      },
      {
        title: "Agree the details early",
        text: "Date, venue and serving style are settled before the day.",
      },
    ],
    meta: meta([
      "no hygiene ratings, certificates or delivery coverage unless supplied",
    ]),
  },
  {
    verticalId: "restaurant",
    subcategories: [
      {
        id: "casual-dining",
        label: "Casual dining",
        match: "casual|family|neighbourhood",
      },
      {
        id: "fine-dining",
        label: "Fine dining",
        match: "fine dining|tasting menu",
      },
      { id: "grill", label: "Grill house", match: "grill|bbq|suya" },
    ],
    topics: [
      topic(
        "menu",
        "The menu",
        "menu|dishes?|serving|grill|rice|fish|chicken|lunch|dinner",
        "A menu is easier to enjoy when you know what kind of food to expect. Dishes, sides and drinks are best confirmed with the restaurant directly.",
        ["Dishes you are curious about", "Dietary needs", "Group size"],
        ["restaurant food", "plated dish"],
        true,
      ),
      topic(
        "reservations",
        "Reservations",
        "reserv|book|table",
        "Booking a table is simplest when you share the date, the time and the number of people.",
        ["Date and time", "Number of people", "Special occasions"],
        ["restaurant interior"],
      ),
    ],
    faq: [
      {
        question: "How do I reserve a table?",
        answer:
          "Use the enquiry form to share the date, time and number of people, and ask for confirmation.",
      },
      {
        question: "Can I ask about dietary needs?",
        answer:
          "Yes. Mention any allergies or preferences in your message so they can be considered.",
      },
    ],
    enquiryPrompts: [
      "Date and time",
      "Number of people",
      "Occasion",
      "Dietary needs",
    ],
    searchIntents: [
      "restaurant dining",
      "plated dishes",
      "restaurant interior",
    ],
    aboutAngle:
      "A restaurant is trusted through food and atmosphere, so the story is about the table and the experience.",
    approachNotes: [
      {
        title: "Good food, simply presented",
        text: "The menu leads and the details follow.",
      },
    ],
    meta: meta(["no menu items, prices or opening hours unless supplied"]),
  },
  {
    verticalId: "fashion",
    subcategories: [
      {
        id: "ready-to-wear",
        label: "Ready-to-wear",
        match: "ready.?to.?wear|boutique",
      },
      {
        id: "bespoke",
        label: "Bespoke and tailoring",
        match: "bespoke|tailor|custom",
      },
      {
        id: "accessories",
        label: "Accessories",
        match: "accessor|bags?|shoes?",
      },
    ],
    topics: [
      topic(
        "womenswear",
        "Womenswear",
        "dress|women|ladies|tops?|skirts?|ankara|adire",
        "Women's fashion ranges from everyday pieces to occasion wear. Fit, fabric and styling are the main things to think about.",
        ["Occasion", "Size and fit", "Fabric preferences"],
        ["fashion boutique", "ankara fashion"],
        true,
      ),
      topic(
        "accessories",
        "Accessories",
        "accessor|bags?|jewel|shoes?|scarf",
        "Accessories finish an outfit: bags, jewellery and small pieces that change the look.",
        ["Outfit to match", "Colour preferences"],
        ["fashion accessories"],
      ),
    ],
    faq: [
      {
        question: "How do I ask about a piece?",
        answer:
          "Send a message with the item you saw or the look you want, and ask about sizes and availability.",
      },
      {
        question: "Can I ask about custom orders?",
        answer:
          "You can ask. Describe what you have in mind and request what is possible.",
      },
    ],
    enquiryPrompts: [
      "The item or look",
      "Size",
      "Occasion",
      "Colour preferences",
    ],
    searchIntents: ["fashion boutique", "clothing rail", "fashion styling"],
    aboutAngle:
      "A boutique is chosen for its eye, so the story is about style and how pieces are picked.",
    approachNotes: [
      {
        title: "Style first",
        text: "Pieces are chosen to be worn, not just displayed.",
      },
    ],
    meta: meta(["no stock, sizes, prices or collections unless supplied"]),
  },
  {
    verticalId: "salon",
    subcategories: [
      {
        id: "braids",
        label: "Braids and natural hair",
        match: "braid|natural|locs",
      },
      { id: "wigs", label: "Wigs and weaves", match: "wig|weave|install" },
      {
        id: "treatments",
        label: "Hair treatments",
        match: "treatment|relaxer|colour|color",
      },
    ],
    topics: [
      topic(
        "braids",
        "Braids and styling",
        "braid|style|styling|twist|locs",
        "Protective and decorative styles take time, so it helps to know the look, the length and how long you want it to last before you book.",
        ["Style and length", "Hair condition", "Time you have available"],
        ["hair braiding", "hair styling"],
        true,
      ),
      topic(
        "wigs",
        "Wigs and weaves",
        "wig|weave|install|extension",
        "Wigs and weaves are chosen for look, texture and wearability. A consultation helps match them to you.",
        ["Texture and length", "Installation or purchase"],
        ["wig installation"],
      ),
      topic(
        "treatments",
        "Treatments",
        "treatment|care|wash|relaxer|colour|color|trim",
        "Treatments keep hair healthy between styles, from deep conditioning to trims.",
        ["Hair goals", "Current condition"],
        ["hair treatment"],
      ),
    ],
    faq: [
      {
        question: "How do I book an appointment?",
        answer:
          "Send your preferred day, the style you want and any hair concerns, and ask for a time that fits.",
      },
      {
        question: "Should I bring a photo?",
        answer:
          "A reference photo is the quickest way to explain the style you want.",
      },
    ],
    enquiryPrompts: [
      "Preferred day",
      "Style wanted",
      "Reference photo",
      "Hair concerns",
    ],
    searchIntents: ["hair salon", "braiding", "hair styling"],
    aboutAngle:
      "A salon is chosen on trust and results, so the story centres on care and the styles people ask for.",
    approachNotes: [
      {
        title: "Consult first",
        text: "The look and the hair are discussed before work begins.",
      },
    ],
    meta: meta([
      "no styling outcome promises, product claims or appointment availability",
    ]),
  },
  {
    verticalId: "barber",
    subcategories: [
      { id: "classic-cuts", label: "Classic cuts", match: "fade|cut|haircut" },
      { id: "beard", label: "Beard care", match: "beard|shave" },
    ],
    topics: [
      topic(
        "cuts",
        "Haircuts and fades",
        "cut|fade|haircut|taper|lineup",
        "A clean cut starts with a clear idea of the shape you want. Photos help.",
        ["Style and length", "Beard or lineup"],
        ["barber haircut", "fade haircut"],
        true,
      ),
      topic(
        "beard",
        "Beard grooming",
        "beard|shave|trim|groom",
        "Beard grooming keeps the shape tidy and the skin comfortable.",
        ["Shape", "Length"],
        ["beard trim"],
      ),
    ],
    faq: [
      {
        question: "Can I book or walk in?",
        answer:
          "Ask directly through the contact options so you know how to be seen.",
      },
      {
        question: "Should I bring a reference photo?",
        answer: "Yes. It is the quickest way to describe the cut.",
      },
    ],
    enquiryPrompts: [
      "Cut or beard service",
      "Preferred day",
      "Reference photo",
    ],
    searchIntents: ["barber shop", "beard trim", "haircut"],
    aboutAngle:
      "A barbershop is judged by the chair, so the story is about craft and regulars.",
    approachNotes: [
      {
        title: "Detail matters",
        text: "Clean lines come from patience and a steady hand.",
      },
    ],
    meta: meta(["no wait times or booking availability"]),
  },
  {
    verticalId: "makeup",
    subcategories: [
      { id: "bridal", label: "Bridal makeup", match: "bride|bridal|wedding" },
      {
        id: "editorial",
        label: "Photoshoot makeup",
        match: "photoshoot|editorial|shoot",
      },
    ],
    topics: [
      topic(
        "bridal",
        "Bridal makeup",
        "bride|bridal|wedding",
        "Bridal makeup is planned around the dress, the venue and how long the day lasts. A conversation beforehand sets the look.",
        ["Date and venue", "Look you want", "Skin sensitivities"],
        ["bridal makeup"],
        true,
      ),
      topic(
        "shoots",
        "Photoshoot makeup",
        "photoshoot|editorial|shoot|camera",
        "Makeup for photography is built to look right under lights and on camera.",
        ["Shoot type", "Look reference"],
        ["makeup artist"],
      ),
      topic(
        "occasions",
        "Special occasions",
        "occasion|party|event|glam",
        "Event makeup is matched to the outfit and the setting.",
        ["Event and time", "Outfit"],
        ["glam makeup"],
      ),
    ],
    faq: [
      {
        question: "What should I share in an enquiry?",
        answer:
          "The date, the kind of occasion, the look you like and any skin sensitivities.",
      },
      {
        question: "Can I send inspiration?",
        answer: "Yes. Reference photos make the look easier to agree.",
      },
    ],
    enquiryPrompts: [
      "Date and place",
      "Occasion",
      "Look reference",
      "Skin sensitivities",
    ],
    searchIntents: ["makeup artist", "bridal makeup", "beauty portrait"],
    aboutAngle:
      "Makeup is personal, so the story is about listening and the looks created.",
    approachNotes: [
      {
        title: "Listen first",
        text: "The look starts with how you want to feel.",
      },
    ],
    meta: meta(["no product-safety or allergy claims; no availability"]),
  },
  {
    verticalId: "photographer",
    subcategories: [
      { id: "weddings", label: "Weddings", match: "wedding" },
      { id: "portraits", label: "Portraits", match: "portrait" },
      { id: "events", label: "Events", match: "event" },
    ],
    topics: [
      topic(
        "weddings",
        "Weddings",
        "wedding|bride",
        "Wedding photography is planned around the schedule of the day, the venues and the moments that matter to the couple.",
        ["Date and venues", "Moments to capture"],
        ["wedding photography"],
        true,
      ),
      topic(
        "portraits",
        "Portraits",
        "portrait|headshot|family",
        "A portrait session is shaped by where it happens, what you wear and how relaxed you feel.",
        ["Purpose", "Location"],
        ["portrait photography"],
      ),
      topic(
        "events",
        "Events",
        "event|party|corporate",
        "Event photography documents the day as it happens.",
        ["Event type", "Duration"],
        ["event photography"],
      ),
    ],
    faq: [
      {
        question: "What should I include when I enquire?",
        answer:
          "The date, the place, the kind of session and how you plan to use the photos.",
      },
      {
        question: "Can I see more work?",
        answer:
          "Ask for examples that match your session; the gallery here is illustrative.",
      },
    ],
    enquiryPrompts: ["Date and place", "Kind of session", "Use of the photos"],
    searchIntents: ["photographer", "wedding photography", "portrait"],
    aboutAngle:
      "A photographer is chosen by eye, so the story is about how they see and work.",
    approachNotes: [
      {
        title: "Plan the shots",
        text: "A short conversation beforehand shapes the day.",
      },
    ],
    meta: meta(["no portfolio, clients or publications unless supplied"]),
  },
  {
    verticalId: "agency",
    subcategories: [
      { id: "branding", label: "Branding agency", match: "brand" },
      { id: "design", label: "Design studio", match: "design" },
    ],
    topics: [
      topic(
        "brand",
        "Brand identity",
        "brand|logo|identity",
        "A brand identity is more than a logo: it is the name, voice, colours and type that make a business recognisable.",
        ["What the business stands for", "Who it speaks to"],
        ["design studio"],
        true,
      ),
      topic(
        "campaign",
        "Campaign visuals",
        "campaign|poster|social|visuals",
        "Campaign visuals carry one idea clearly across the places people meet the brand.",
        ["Goal", "Channels"],
        ["creative workspace"],
      ),
    ],
    faq: [
      {
        question: "How does a project start?",
        answer:
          "With a conversation about the business, the audience and what you need the work to do.",
      },
      {
        question: "What should I share?",
        answer:
          "Your goals, any existing brand material and the timing you have in mind.",
      },
    ],
    enquiryPrompts: ["Project goal", "Existing brand material", "Timing"],
    searchIntents: ["design studio", "brand identity", "creative workspace"],
    aboutAngle:
      "A design studio is judged by its thinking, so the story is about how it approaches a brief.",
    approachNotes: [
      {
        title: "Understand first",
        text: "Good design begins with the business, not the logo.",
      },
    ],
    meta: meta(["no clients, awards or case studies unless supplied"]),
  },
  {
    verticalId: "digital-studio",
    subcategories: [
      {
        id: "creative-technology",
        label: "Creative technology studio",
        match: "creative technolog",
      },
      {
        id: "web-agency",
        label: "Web design and development",
        match: "website|web design|web development",
      },
      {
        id: "software-agency",
        label: "Software development agency",
        match: "software|app",
      },
    ],
    topics: [
      topic(
        "websites",
        "Websites and digital experiences",
        "website|web ?site|web design|web development|digital experience|landing",
        "A website is often the first place a customer meets a business. It needs to be clear, quick on a phone, and built so a visitor can take the next step.",
        [
          "Who the site is for",
          "What a visitor should do next",
          "Content you already have",
        ],
        ["laptop website design", "designer workspace"],
        true,
      ),
      topic(
        "branding",
        "Brand identity",
        "brand|logo|identity|visual identity",
        "A brand gives a business a consistent face: name, voice, colour and type that people recognise across every touchpoint.",
        ["What the business stands for", "Who it speaks to"],
        ["brand design workspace"],
        true,
      ),
      topic(
        "software",
        "Software development",
        "software|app|application|platform|develop|engineering|code",
        "Software projects work best when the problem is defined first. Scope, users and the first release are agreed before building starts.",
        [
          "The problem to solve",
          "Who will use it",
          "How it connects to existing tools",
        ],
        ["developer coding"],
        true,
      ),
      topic(
        "motion",
        "Motion graphics",
        "motion|animation|video|animated",
        "Motion graphics explain an idea quickly and make a brand feel alive on screens and social feeds.",
        ["Where it will be shown", "Length and style"],
        ["motion design"],
        true,
      ),
      topic(
        "automation",
        "Marketing automation",
        "automation|marketing|campaign|email|funnel",
        "Marketing automation takes repeated tasks, such as follow-ups and enquiry routing, and runs them consistently so no lead is forgotten.",
        ["Where enquiries come from", "What happens after they arrive"],
        ["marketing dashboard"],
        true,
      ),
      topic(
        "design",
        "Design",
        "design|ui|ux|interface|product design",
        "Interface and product design turn ideas into screens people can use without instructions.",
        ["Users and tasks", "Platforms"],
        ["ui design"],
      ),
    ],
    faq: [
      {
        question: "How does a project begin?",
        answer:
          "With a short conversation about your business, your customers and what you want the work to do. After that, scope and next steps are agreed together.",
      },
      {
        question: "What should I send in my first message?",
        answer:
          "Describe your business, what you need built and any deadlines, and add links to anything you already have.",
      },
      {
        question: "Can one team handle design and development?",
        answer:
          "That is the idea behind a creative technology studio: design, software, motion and marketing automation planned together rather than handed between suppliers.",
      },
    ],
    enquiryPrompts: [
      "What you need built",
      "Your business and customers",
      "Existing brand or site",
      "Timing",
    ],
    searchIntents: [
      "creative technology studio",
      "web design workspace",
      "designer laptop",
    ],
    aboutAngle:
      "A studio is chosen for how it thinks, so the story is about combining design, software, motion and marketing automation around a business goal.",
    approachNotes: [
      {
        title: "Understand the business",
        text: "Every project starts with who the customers are and what they need to do.",
      },
      {
        title: "Design and build together",
        text: "Design, development and motion are planned as one piece of work.",
      },
      {
        title: "Launch, then improve",
        text: "A first release goes out, then real use guides what comes next.",
      },
    ],
    meta: meta([
      "no clients, case studies, metrics or technology expertise claims unless supplied",
    ]),
  },
  {
    verticalId: "saas",
    subcategories: [
      { id: "saas-product", label: "SaaS product", match: "saas|subscription" },
      { id: "dev-tool", label: "Developer tool", match: "api|sdk|developer" },
    ],
    topics: [
      topic(
        "product",
        "The product",
        "platform|app|software|tool|dashboard",
        "A software product is understood fastest when it shows the problem it solves and the first thing a user can do.",
        ["The problem", "Who uses it"],
        ["software product"],
        true,
      ),
    ],
    faq: [
      {
        question: "How do I learn more?",
        answer:
          "Use the contact form to ask for a walkthrough or to raise questions about fit.",
      },
      {
        question: "Can I ask about pricing?",
        answer: "Ask about pricing through the contact form.",
      },
    ],
    enquiryPrompts: ["Your use case", "Team size", "Questions"],
    searchIntents: ["software dashboard", "team working laptop"],
    aboutAngle:
      "A product is trusted for clarity, so the story is about the problem it exists to solve.",
    approachNotes: [
      {
        title: "Start with the problem",
        text: "Features follow the job the user needs done.",
      },
    ],
    meta: meta([
      "no user counts, integrations, uptime or security claims unless supplied",
    ]),
  },
  {
    verticalId: "cyber",
    subcategories: [
      {
        id: "pentest",
        label: "Penetration testing",
        match: "pentest|penetration",
      },
      { id: "audit", label: "Security audits", match: "audit|compliance" },
    ],
    topics: [
      topic(
        "testing",
        "Security testing",
        "pentest|penetration|vulnerab|testing",
        "Security testing looks for weaknesses before someone else finds them. Scope and rules are agreed in writing first.",
        ["Systems in scope", "Timing"],
        ["security analyst"],
        true,
      ),
      topic(
        "audits",
        "Security audits",
        "audit|assess|review|compliance",
        "An audit reviews how systems and habits protect a business and recommends sensible next steps.",
        ["What to review", "Existing policies"],
        ["security review"],
        true,
      ),
    ],
    faq: [
      {
        question: "What do you need to scope a project?",
        answer:
          "A description of the systems involved, the goal and any deadlines.",
      },
      {
        question: "Is information kept confidential?",
        answer:
          "Ask about confidentiality arrangements as part of your first conversation.",
      },
    ],
    enquiryPrompts: ["Systems involved", "Goal", "Timing"],
    searchIntents: ["cybersecurity", "security operations"],
    aboutAngle:
      "Security is trusted through care and clarity, so the story is about process, not fear.",
    approachNotes: [
      {
        title: "Agree scope first",
        text: "Nothing is tested without a written agreement.",
      },
    ],
    meta: meta([
      "no certifications, breach statistics or guarantees of protection",
    ]),
  },
  {
    verticalId: "gadgets",
    subcategories: [
      {
        id: "phone-repair",
        label: "Phone repair",
        match: "phone|screen|battery",
      },
      {
        id: "accessories",
        label: "Phone accessories",
        match: "accessor|case|charger",
      },
    ],
    topics: [
      topic(
        "screens",
        "Screens and batteries",
        "screen|battery|display|charging port|charger",
        "Cracked screens, tired batteries and faulty charging ports are among the most common phone faults, and most can be assessed from a description of what is happening.",
        ["Phone make and model", "What the fault is", "When it started"],
        ["phone repair"],
        true,
      ),
    ],
    faq: [
      {
        question: "What should I tell you about my phone?",
        answer: "The make and model, what is wrong and when it started.",
      },
      {
        question: "Can I describe the problem first?",
        answer:
          "Yes. Send a message and ask what is possible before bringing the phone in.",
      },
    ],
    enquiryPrompts: ["Phone model", "The fault", "When it started"],
    searchIntents: ["phone repair", "electronics bench"],
    aboutAngle:
      "A repair business is trusted for honesty, so the story is about clear diagnosis.",
    approachNotes: [
      {
        title: "Diagnose first",
        text: "The fault is identified before any work begins.",
      },
    ],
    meta: meta([
      "no turnaround times, warranties or part-quality claims unless supplied",
    ]),
  },
  {
    verticalId: "plumbing",
    subcategories: [
      { id: "repairs", label: "Repairs and leaks", match: "repair|leak" },
      { id: "installation", label: "Installation", match: "install|pipe" },
    ],
    topics: [
      topic(
        "leaks",
        "Leaks and repairs",
        "leak|repair|burst|drain|blocked",
        "Leaks and blockages are easiest to deal with early. A clear description helps decide what is needed.",
        ["Where the problem is", "How long it has been happening"],
        ["plumber at work"],
        true,
      ),
      topic(
        "installs",
        "Installation",
        "install|pipe|tap|toilet|water heater|shower",
        "New fittings and pipework are planned around the layout of the building.",
        ["What is being installed", "Access to the area"],
        ["plumbing pipes"],
        true,
      ),
    ],
    faq: [
      {
        question: "What should I describe?",
        answer:
          "Where the problem is, what you can see and how long it has been going on.",
      },
      {
        question: "Can I send photos?",
        answer:
          "Photos of the problem make it easier to understand what is needed.",
      },
    ],
    enquiryPrompts: ["What is wrong", "Where", "Photos if possible"],
    searchIntents: ["plumber", "pipes"],
    aboutAngle:
      "A plumber is trusted for reliability, so the story is about careful work and clear communication.",
    approachNotes: [
      {
        title: "Explain the fix",
        text: "What needs doing is explained before work begins.",
      },
    ],
    meta: meta([
      "no emergency, licence, insurance or response-time claims unless supplied",
    ]),
  },
  {
    verticalId: "cleaning",
    subcategories: [
      { id: "home", label: "Home cleaning", match: "home|house" },
      { id: "office", label: "Office cleaning", match: "office|commercial" },
      { id: "post-event", label: "Post-event cleanup", match: "event" },
    ],
    topics: [
      topic(
        "homes",
        "Home cleaning",
        "home|house|apartment|residential",
        "Home cleaning is planned around the size of the home and the jobs that matter most to you.",
        ["Size of the home", "Rooms or jobs"],
        ["home cleaning"],
        true,
      ),
      topic(
        "offices",
        "Office cleaning",
        "office|commercial|workplace",
        "Offices are cleaned around the working day so people can get on with their work.",
        ["Size of the space", "Preferred times"],
        ["office cleaning"],
        true,
      ),
      topic(
        "events",
        "Post-event cleanup",
        "event|party|after",
        "After a gathering, a cleanup brings a venue back to order.",
        ["Venue", "Event date"],
        ["cleaning supplies"],
      ),
    ],
    faq: [
      {
        question: "What should I include in a request?",
        answer:
          "The type and size of the space, what needs doing and the day you have in mind.",
      },
      {
        question: "Can I ask about special jobs?",
        answer: "Yes. Describe them in your message.",
      },
    ],
    enquiryPrompts: ["Type of space", "Size", "Jobs needed", "Preferred day"],
    searchIntents: ["cleaning service", "clean home"],
    aboutAngle:
      "Cleaning is trusted through consistency, so the story is about care for the space.",
    approachNotes: [
      {
        title: "Agree the jobs",
        text: "What will be cleaned is settled in advance.",
      },
    ],
    meta: meta([
      "no insurance, vetting, product-safety or satisfaction claims unless supplied",
    ]),
  },
  {
    verticalId: "realestate",
    subcategories: [
      { id: "sales", label: "Sales", match: "buy|sell|sale" },
      { id: "rentals", label: "Rentals", match: "rent|lease" },
    ],
    topics: [
      topic(
        "buying",
        "Buying",
        "buy|purchase|sale",
        "Buying a property starts with what you need: location, size, budget and timing.",
        ["Area", "Type of property", "Timing"],
        ["house exterior"],
        true,
      ),
      topic(
        "renting",
        "Renting",
        "rent|lease|tenant",
        "Renting works best when you know the area, the type of home and when you need to move.",
        ["Area", "Type of home"],
        ["apartment interior"],
      ),
      topic(
        "selling",
        "Selling",
        "sell|seller|list",
        "Selling a property begins with preparing it and agreeing how it will be presented.",
        ["Property details", "Timing"],
        ["house for sale"],
      ),
    ],
    faq: [
      {
        question: "How do I begin?",
        answer:
          "Tell us whether you want to buy, sell or rent, the area and your timing.",
      },
      {
        question: "Are listings shown here?",
        answer: "Specific listings are shared on request.",
      },
    ],
    enquiryPrompts: ["Buy, sell or rent", "Area", "Property type", "Timing"],
    searchIntents: ["house exterior", "apartment interior"],
    aboutAngle:
      "Property is a big decision, so the story is about guidance and clarity.",
    approachNotes: [
      {
        title: "Start with your needs",
        text: "Search begins with what you actually need.",
      },
    ],
    meta: meta([
      "no listings, prices, commissions or sales records unless supplied",
    ]),
  },
  {
    verticalId: "events",
    subcategories: [
      { id: "weddings", label: "Weddings", match: "wedding" },
      { id: "corporate", label: "Corporate events", match: "corporate" },
      {
        id: "birthdays",
        label: "Birthdays and parties",
        match: "birthday|party",
      },
    ],
    topics: [
      topic(
        "weddings",
        "Weddings",
        "wedding",
        "A wedding is planned backward from the date: venue, schedule, vendors and the details that make it personal.",
        ["Date", "Guest numbers", "Style"],
        ["wedding decor"],
        true,
      ),
      topic(
        "corporate",
        "Corporate events",
        "corporate|conference|launch|company",
        "Corporate events run on a clear schedule and a clear purpose.",
        ["Purpose", "Guest numbers"],
        ["conference event"],
        true,
      ),
      topic(
        "birthdays",
        "Birthdays and parties",
        "birthday|party|celebration",
        "Parties are planned around the guest of honour and the mood you want.",
        ["Theme", "Guest numbers"],
        ["party decor"],
      ),
    ],
    faq: [
      {
        question: "How do I start planning?",
        answer:
          "Share the date, the kind of event, the guest numbers and the feeling you want.",
      },
      {
        question: "Can I ask for help with part of an event?",
        answer: "Yes. Say which parts you need support with.",
      },
    ],
    enquiryPrompts: ["Date", "Event type", "Guest numbers", "Style or theme"],
    searchIntents: ["event planning", "wedding decor"],
    aboutAngle:
      "Events are trusted through organisation, so the story is about calm planning.",
    approachNotes: [
      {
        title: "Plan backward",
        text: "Everything is scheduled from the date.",
      },
    ],
    meta: meta(["no event counts, vendors or venues unless supplied"]),
  },
  {
    verticalId: "tutoring",
    subcategories: [
      { id: "exam-prep", label: "Exam preparation", match: "exam" },
      {
        id: "after-school",
        label: "After-school tutoring",
        match: "after.?school|tutor",
      },
    ],
    topics: [
      topic(
        "tutoring",
        "Tutoring",
        "tutor|lesson|coach|after.?school",
        "Tutoring works best when it targets what a learner finds hard and builds confidence step by step.",
        ["Subject and level", "Goals"],
        ["tutoring lesson"],
        true,
      ),
      topic(
        "exams",
        "Exam preparation",
        "exam|test|waec|jamb|prep",
        "Exam preparation combines knowing the syllabus with practising under exam conditions.",
        ["Exam and date", "Subjects"],
        ["student studying"],
        true,
      ),
    ],
    faq: [
      {
        question: "What should I share about the learner?",
        answer:
          "Their age or level, the subjects and what you hope to achieve.",
      },
      {
        question: "Can I ask about schedules?",
        answer: "Yes. Mention the days that suit you.",
      },
    ],
    enquiryPrompts: [
      "Learner age or level",
      "Subjects",
      "Goals",
      "Preferred days",
    ],
    searchIntents: ["tutoring", "student studying"],
    aboutAngle:
      "Education is trusted through care for the learner, so the story is about how learning is supported.",
    approachNotes: [
      {
        title: "Start where the learner is",
        text: "Lessons begin from what the learner already knows.",
      },
    ],
    meta: meta([
      "no results, pass rates, accreditation or qualifications unless supplied",
    ]),
  },
  {
    verticalId: "clinic",
    subcategories: [
      { id: "general", label: "General practice", match: "general|family" },
      { id: "specialist", label: "Specialist care", match: "specialist" },
    ],
    topics: [
      topic(
        "consultations",
        "Consultations",
        "consult|general|family|check",
        "A consultation is a conversation about your health. Bringing a short list of symptoms and questions helps make the most of it.",
        ["Symptoms and questions", "Existing medication"],
        ["medical consultation"],
        true,
      ),
    ],
    faq: [
      {
        question: "How do I request an appointment?",
        answer:
          "Use the contact form or the phone details to ask about an appointment. Urgent problems should go to emergency services.",
      },
      {
        question: "Can this site give medical advice?",
        answer:
          "No. Information here is general and does not replace seeing a clinician.",
      },
    ],
    enquiryPrompts: ["Preferred day", "Reason for visit"],
    searchIntents: ["medical consultation", "clinic reception"],
    aboutAngle:
      "Healthcare is trusted through care and clarity, so the story stays plain and respectful.",
    approachNotes: [
      {
        title: "Care, clearly explained",
        text: "Explanations are kept in plain language.",
      },
    ],
    meta: meta([
      "no credentials, outcomes, specialisms or emergency claims; no medical advice",
    ]),
  },
  {
    verticalId: "consulting",
    subcategories: [
      { id: "strategy", label: "Strategy", match: "strategy" },
      { id: "operations", label: "Operations", match: "operations|process" },
    ],
    topics: [
      topic(
        "advisory",
        "Advisory",
        "advis|consult|strategy|plan|operations",
        "Advisory work helps a business decide where to focus and how to get there, starting with a clear view of where it is now.",
        ["Goal", "Current situation"],
        ["business meeting"],
        true,
      ),
    ],
    faq: [
      {
        question: "How does an engagement start?",
        answer: "With a conversation about your goals and situation.",
      },
      {
        question: "What should I prepare?",
        answer:
          "A short description of your business and the decision you are facing.",
      },
    ],
    enquiryPrompts: ["Your business", "The decision or goal", "Timing"],
    searchIntents: ["business meeting", "strategy"],
    aboutAngle:
      "Advice is trusted through clear thinking, so the story is about how problems are approached.",
    approachNotes: [
      {
        title: "Listen, then advise",
        text: "Recommendations follow a clear understanding of the situation.",
      },
    ],
    meta: meta(["no clients, results or credentials unless supplied"]),
  },
];

/** Generic guidance for any trade without its own profile. Built from the vertical's own fields, never from invention. */
export function genericProfile(
  verticalId: string,
  offerNoun: string,
  usefulContent: string[],
): IndustryProfile {
  return {
    verticalId,
    subcategories: [],
    topics: [],
    faq: [
      {
        question: "What should I include in my message?",
        answer: `Say what you need, when you need it and how to reach you. A few details about the ${offerNoun} you have in mind makes it easier to give a useful reply.`,
      },
      {
        question: "Can I ask a question before deciding?",
        answer:
          "Yes. Send a message with your question and you can decide after you hear back.",
      },
    ],
    enquiryPrompts: [
      "What you need",
      "When you need it",
      "Anything that matters to you",
    ],
    searchIntents: [],
    aboutAngle: `People choose a ${offerNoun} provider on clarity and trust, so this page keeps to what the owner has said and what is useful to know (${usefulContent.slice(0, 3).join(", ")}).`,
    approachNotes: [
      {
        title: "Start with what you need",
        text: "A short message about your needs is a good first step.",
      },
      {
        title: "Agree the details",
        text: "The details are settled together before work starts.",
      },
    ],
    meta: {
      ...META_BASE,
      profileVersion: "1.0.0",
      validation: "cluster-default",
      restrictions: [
        "no prices, hours, years, awards, ratings or customer counts",
      ],
    },
  };
}

export function profileFor(
  verticalId: string,
  offerNoun = "service",
  usefulContent: string[] = [],
): IndustryProfile {
  return (
    PROFILES.find((p) => p.verticalId === verticalId) ??
    genericProfile(verticalId, offerNoun, usefulContent)
  );
}

/**
 * Words and shapes that turn general knowledge into a claim about the owner's business. Used by tests over every
 * knowledge string and by the content validator over generated copy.
 */
export const CLAIM_PATTERNS: Array<[RegExp, string]> = [
  [/\d/, "a number"],
  [
    /\b(award|awarded|winning|certified|accredited|licen[cs]ed|insured|guarantee[ds]?)\b/i,
    "an award, certificate or guarantee",
  ],
  [
    /\b(the best|best (?:in|of|quality|value|price|service|bakery|agency|studio|around)|leading|top[- ]rated|number one|#1|trusted by|loved by|famous)\b/i,
    "a superlative or social proof",
  ],
  [/\b(years?|decades?|since)\b/i, "a time-in-business claim"],
  [/\b(free|cheap|cheapest|affordable|discount|lowest)\b/i, "a price claim"],
  [
    /\b(same[- ]day|next[- ]day|24\/7|24 hours|instant|within the hour)\b/i,
    "a speed or availability promise",
  ],
  [
    /\b(fresh(ly)? (baked|made|daily)|made daily|baked daily)\b/i,
    "a freshness schedule",
  ],
  [/\bwe deliver\b|\bnationwide\b|\bworldwide\b/i, "a delivery promise"],
  [/\b(customers|clients) (love|trust|choose)\b/i, "a customer claim"],
];

export function claimIssues(text: string): string[] {
  return CLAIM_PATTERNS.filter(([re]) => re.test(text)).map(([, why]) => why);
}

export function knowledgeStrings(p: IndustryProfile): string[] {
  return [
    ...p.topics.flatMap((t) => [t.label, t.intro, ...t.considerations]),
    ...p.faq.flatMap((f) => [f.question, f.answer]),
    ...p.enquiryPrompts,
    p.aboutAngle,
    ...p.approachNotes.flatMap((n) => [n.title, n.text]),
  ];
}

/** Throws when any knowledge string reads as a claim about the owner's business. Run in tests and at build time. */
export function assertKnowledgeSafe(
  profiles: readonly IndustryProfile[] = PROFILES,
): void {
  const bad: string[] = [];
  for (const p of profiles)
    for (const s of knowledgeStrings(p)) {
      const issues = claimIssues(s);
      if (issues.length)
        bad.push(`${p.verticalId}: "${s}" -> ${issues.join(", ")}`);
    }
  if (bad.length)
    throw new Error(`Knowledge reads as business claims:\n${bad.join("\n")}`);
}

export type { PageKind };
