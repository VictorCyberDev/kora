/** Friendly names for the design controls. The ids are the API contract; people never see them. */
export const PALETTE_LABEL: Record<string, string> = {
  "ink-paper": "Paper & ink",
  "terracotta-sand": "Terracotta & sand",
  botanical: "Botanical",
  "midnight-brass": "Midnight & brass",
  "clinic-teal": "Clean teal",
  "contrast-pop": "Cream & pop",
  "coastal-navy": "Coastal navy",
  "plum-blush": "Plum & blush",
  workshop: "Workshop",
  "indigo-tech": "Indigo",
  "tomato-cream": "Tomato & cream",
  "forest-night": "Forest at night",
  "graphite-lime": "Graphite & lime",
  "sage-linen": "Sage & linen",
  "royal-ivory": "Royal ivory",
  sunrise: "Sunrise",
};
export const FONT_LABEL: Record<string, string> = {
  "editorial-serif": "Editorial serif",
  "luxury-serif": "Refined serif",
  "modern-grotesk": "Modern sans",
  humanist: "Warm humanist",
  geometric: "Geometric",
  "soft-rounded": "Soft & rounded",
  technical: "Technical",
  "high-contrast-serif": "High-contrast serif",
  "warm-serif": "Warm serif",
  expressive: "Expressive",
  "creative-display": "Creative display",
};
export const SECTION_LABEL: Record<string, string> = {
  hero: "Opening",
  trust: "Key facts",
  services: "Services",
  features: "Features",
  about: "About",
  process: "How it works",
  portfolio: "Work",
  testimonials: "Reviews",
  team: "Team",
  pricing: "Pricing",
  stats: "Numbers",
  faq: "Questions",
  contact: "Contact",
  cta: "Call to action",
};
const title = (s: string) =>
  s.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase());
export const variantLabel = (v: string) => title(v);
export const SHAPES: Array<[string, string]> = [
  ["sharp", "Sharp"],
  ["soft", "Soft"],
  ["rounded", "Rounded"],
];
export const DENSITIES: Array<[string, string]> = [
  ["compact", "Tight"],
  ["balanced", "Balanced"],
  ["spacious", "Airy"],
  ["editorial", "Editorial"],
];
export const BUTTONS: Array<[string, string]> = [
  ["solid", "Solid"],
  ["outline", "Outline"],
  ["pill", "Pill"],
  ["underline", "Underlined"],
];
export const GOALS: Array<[string, string]> = [
  ["", "Let Kora decide"],
  ["calls", "Get phone calls"],
  ["bookings", "Get bookings"],
  ["leads", "Get enquiries"],
  ["sales", "Get orders"],
  ["visits", "Bring people in"],
  ["show-work", "Show our work"],
];
export const FEELS: Array<[string, string]> = [
  ["", "Let Kora decide"],
  ["calm and minimal", "Calm & minimal"],
  ["warm and friendly", "Warm & friendly"],
  ["bold and confident", "Bold & confident"],
  ["luxury and refined", "Refined"],
  ["playful and colourful", "Playful"],
  ["modern and technical", "Modern & technical"],
  ["dark and dramatic", "Dark & dramatic"],
];
