/**
 * Copy discipline: banned generic phrases, CTA intelligence and fact-bound headline kits. Nothing here invents a fact;
 * every generated line is built from words the owner supplied or from the vertical's plain verbs.
 */
import type { Intent } from "./verticals.js";

/** Phrases that mark default AI copy. Detected case-insensitively as whole phrases. */
export const CLICHES: readonly string[] = [
  "unlock",
  "unleash",
  "elevate your",
  "elevate the",
  "embark on",
  "journey",
  "world-class",
  "world class",
  "cutting-edge",
  "cutting edge",
  "revolutionary",
  "revolutionise",
  "revolutionize",
  "game-changing",
  "game changing",
  "passionate about",
  "trusted partner",
  "tailored solutions",
  "exceptional service",
  "your one-stop",
  "one-stop shop",
  "reimagine",
  "empower your",
  "transform your",
  "seamless experience",
  "next level",
  "state-of-the-art",
  "second to none",
  "take your .{1,20} to the next level",
  "where .{2,24} meets .{2,24}",
  "dedicated to providing",
  "committed to excellence",
  "we pride ourselves",
  "look no further",
];
const clicheRes = CLICHES.map((c) => ({
  c,
  re: new RegExp(`(?:^|[^a-z])(?:${c})(?:[^a-z]|$)`, "i"),
}));

export function findCliches(text: string): string[] {
  return clicheRes.filter(({ re }) => re.test(text)).map(({ c }) => c);
}

/** Labels too vague to be a call to action when a specific one exists. */
export const GENERIC_CTAS = [
  "get started",
  "learn more",
  "click here",
  "contact us",
  "submit",
  "read more",
  "find out more",
  "discover more",
  "explore",
  "see more",
];
export const isGenericCta = (label: string) =>
  GENERIC_CTAS.includes(label.trim().toLowerCase().replace(/[.!→>]+$/, "").trim());

/** Specific action wording per vertical id, falling back to the intent. */
const BY_VERTICAL: Record<string, Partial<Record<Intent, string>>> = {
  bakery: { order: "Order on WhatsApp", whatsapp: "Order on WhatsApp", visit: "Find the bakery" },
  restaurant: { reserve: "Reserve a table", order: "See the menu", visit: "Plan your visit" },
  bukka: { order: "See today's food", visit: "Find us" },
  cafe: { visit: "Plan your visit", order: "See the menu" },
  catering: { quote: "Get a catering quote", whatsapp: "Ask about your event" },
  barber: { book: "Book a haircut", whatsapp: "Book on WhatsApp", visit: "Find the shop" },
  salon: { book: "Book an appointment", whatsapp: "Book on WhatsApp" },
  nails: { book: "Book your set" },
  makeup: { whatsapp: "Check availability", book: "Book your look" },
  spa: { book: "Book a treatment" },
  gym: { register: "Join the gym", visit: "Visit the gym" },
  clinic: { book: "Book an appointment", call: "Call the clinic" },
  dental: { book: "Book a check-up", call: "Call the practice" },
  law: { enquire: "Request a consultation", call: "Call the firm" },
  accounting: { enquire: "Talk to an accountant" },
  realestate: { enquire: "View available homes", whatsapp: "Ask about availability" },
  hotel: { reserve: "Reserve a room", whatsapp: "Ask about availability" },
  shortlet: { reserve: "Check availability", whatsapp: "Ask about availability" },
  photographer: { "view-work": "See the work", book: "Check my dates" },
  interior: { "view-work": "See the projects", enquire: "Start a project" },
  architecture: { "view-work": "See the projects", enquire: "Discuss a project" },
  plumbing: { call: "Call a plumber", quote: "Get a quote" },
  electrical: { call: "Call an electrician", quote: "Get a quote" },
  hvac: { call: "Call for service", quote: "Get a quote" },
  mechanic: { call: "Call the garage", whatsapp: "Send us the fault" },
  logistics: { quote: "Get a delivery quote" },
  school: { register: "Enrol your child", visit: "Book a visit" },
  daycare: { register: "Enrol your child", visit: "Book a visit" },
  church: { visit: "Plan your visit" },
  ngo: { donate: "Support the work", learn: "See our work" },
  saas: { subscribe: "Join the waitlist", enquire: "Talk to us" },
  fashion: { buy: "Message to order", whatsapp: "Message to order" },
  tailor: { whatsapp: "Start a fitting", book: "Book a fitting" },
};
const BY_INTENT: Record<Intent, string> = {
  call: "Call now",
  whatsapp: "Message on WhatsApp",
  book: "Book an appointment",
  reserve: "Reserve now",
  visit: "Plan your visit",
  order: "Order now",
  quote: "Get a quote",
  inspect: "Request an inspection",
  buy: "Ask to buy",
  "view-work": "See our work",
  trust: "Read how we work",
  compare: "Compare options",
  enquire: "Send an enquiry",
  register: "Register",
  donate: "Give",
  subscribe: "Join the list",
  learn: "Learn how it works",
};
export function ctaLabel(verticalId: string, intent: Intent): string {
  return BY_VERTICAL[verticalId]?.[intent] ?? BY_INTENT[intent];
}

/** Title-case-free sentence helper: first letter up, rest unchanged. */
export const sentence = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
