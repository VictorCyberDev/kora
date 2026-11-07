/**
 * Business Truth: what the owner actually told us, what is missing, what is only inferred, and what must never be
 * invented. The creative system reads this before it designs; sections and claims need a supporting fact.
 * The five classes are never blurred: supplied / inferred / decided / missing / prohibited.
 */
import { z } from "zod";

export const FACT_CLASSES = [
  "owner-supplied",
  "verified",
  "inference",
  "design-decision",
  "missing",
  "prohibited-invention",
] as const;
export type FactClass = (typeof FACT_CLASSES)[number];

export const briefSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(3).max(2000),
  goal: z
    .enum(["calls", "bookings", "leads", "sales", "visits", "show-work"])
    .optional(),
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
  /** What the owner supplied beyond words. Counts only; Kora never inspects or invents them. */
  assets: z
    .object({
      logo: z.boolean().default(false),
      photos: z.number().int().min(0).max(100).default(0),
      testimonials: z.number().int().min(0).max(50).default(0),
      prices: z.boolean().default(false),
      team: z.boolean().default(false),
    })
    .default({
      logo: false,
      photos: 0,
      testimonials: 0,
      prices: false,
      team: false,
    }),
});
export type CreativeBrief = z.input<typeof briefSchema>;
export type ParsedBrief = z.output<typeof briefSchema>;

export interface TruthFact {
  key: string;
  value: string;
  class: FactClass;
}
export interface BusinessTruth {
  brief: ParsedBrief;
  facts: TruthFact[];
  missing: string[];
  inferences: Array<{ statement: string; basis: string }>;
  prohibited: string[];
  /** Owner-supplied facts that contradict each other. Neither side is published; the owner is asked which is right. */
  conflicts: string[];
  can: {
    phone: boolean;
    whatsapp: boolean;
    email: boolean;
    location: boolean;
    hours: boolean;
    services: boolean;
    photos: boolean;
    testimonials: boolean;
    prices: boolean;
    team: boolean;
    logo: boolean;
  };
  /** Digit sequences that appear in what the owner wrote; any other number in generated copy is an invention. */
  suppliedNumbers: string[];
}

/** Things Kora never makes up, whatever the vertical. Mirrors the Truth Engine's claim ledger vocabulary. */
export const NEVER_INVENT = [
  "testimonials or customer quotes",
  "ratings or review counts",
  "client logos",
  "awards or certifications",
  "years in operation",
  "founder or staff biographies",
  "prices",
  "product availability",
  "addresses, phone numbers, emails",
  "opening hours",
  "branch counts",
  "customer counts or monthly users",
  "completed projects",
  "guarantees or delivery times",
  "medical, legal or financial credentials or claims",
] as const;

const digitsOf = (s: string) => s.match(/\d[\d,.]*/g) ?? [];

/**
 * The same days given with different hours ("Mon-Fri 9-5" and "Mon-Fri 10-8") cannot both be published, and Kora must not
 * pick one. Every entry for such a day label is dropped, the conflict is recorded, and the site omits hours until the owner
 * resolves it. Identical duplicates are simply merged.
 */
export function reconcileHours(brief: ParsedBrief): {
  brief: ParsedBrief;
  conflicts: string[];
} {
  const hours = brief.hours ?? [];
  if (!hours.length) return { brief, conflicts: [] };
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  const byDays = new Map<string, Set<string>>();
  for (const h of hours) {
    const k = norm(h.days);
    byDays.set(k, (byDays.get(k) ?? new Set()).add(norm(h.hours)));
  }
  const conflictDays = new Set(
    [...byDays].filter(([, v]) => v.size > 1).map(([k]) => k),
  );
  const seen = new Set<string>();
  const kept = hours.filter((h) => {
    const k = norm(h.days);
    if (conflictDays.has(k)) return false;
    const id = `${k}|${norm(h.hours)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const conflicts = [...conflictDays].map(
    (d) => `Two different opening hours were given for ${d}`,
  );
  if (kept.length === hours.length && !conflicts.length)
    return { brief, conflicts };
  return { brief: { ...brief, hours: kept }, conflicts };
}

export function buildTruth(input: CreativeBrief): BusinessTruth {
  const parsed = briefSchema.parse(input);
  const { brief, conflicts } = reconcileHours(parsed);
  const facts: TruthFact[] = [
    { key: "name", value: brief.name, class: "owner-supplied" },
    { key: "description", value: brief.description, class: "owner-supplied" },
  ];
  const add = (key: string, value: string | undefined) => {
    if (value && value.trim())
      facts.push({ key, value: value.trim(), class: "owner-supplied" });
  };
  add("goal", brief.goal);
  add("feel", brief.feel);
  add("industry", brief.industry);
  add("location", brief.location);
  add("phone", brief.phone);
  add("whatsapp", brief.whatsapp);
  add("email", brief.email);
  for (const s of brief.services ?? []) add("service", s);
  for (const h of brief.hours ?? []) add("hours", `${h.days}: ${h.hours}`);

  const can = {
    phone: !!brief.phone?.trim(),
    whatsapp: !!brief.whatsapp?.trim(),
    email: !!brief.email?.trim(),
    location: !!brief.location?.trim(),
    hours: (brief.hours ?? []).length > 0,
    services: (brief.services ?? []).length > 0,
    photos: brief.assets.photos > 0,
    testimonials: brief.assets.testimonials > 0,
    prices: brief.assets.prices,
    team: brief.assets.team,
    logo: brief.assets.logo,
  };

  const missing: string[] = [];
  if (!can.phone && !can.whatsapp && !can.email)
    missing.push("a way for customers to reach you (phone, WhatsApp or email)");
  if (!can.location) missing.push("where you are or the area you serve");
  if (!can.hours) missing.push("opening hours");
  if (!can.services) missing.push("a list of what you offer");
  if (!can.prices) missing.push("a price list");
  if (!can.photos) missing.push("your own photos");
  if (!can.logo) missing.push("a logo");
  if (!can.testimonials)
    missing.push("real customer reviews you are happy to show");

  const inferences = [
    {
      statement: `Customers most likely want to ${brief.goal ?? "get in touch"}.`,
      basis: brief.goal ? "owner goal" : "vertical default",
    },
  ];

  const suppliedNumbers = digitsOf(
    [
      brief.name,
      brief.description,
      brief.location ?? "",
      brief.phone ?? "",
      brief.whatsapp ?? "",
      ...(brief.services ?? []),
      ...(brief.hours ?? []).flatMap((h) => [h.days, h.hours]),
    ].join(" "),
  ).map((d) => d.replace(/[^\d]/g, ""));

  return {
    brief,
    facts,
    missing,
    inferences,
    prohibited: [...NEVER_INVENT],
    conflicts,
    can,
    suppliedNumbers,
  };
}

/** True when `text` contains a number the owner never supplied (a likely invented statistic, year or price). */
export function inventedNumbers(text: string, truth: BusinessTruth): string[] {
  const own = new Set(truth.suppliedNumbers);
  const out: string[] = [];
  for (const raw of digitsOf(text)) {
    const d = raw.replace(/[^\d]/g, "");
    if (!d) continue;
    // Single digits are ordinary words ("3 ways"), page furniture ("01") is style: only flag multi-digit figures.
    if (d.length < 2 || /^0\d$/.test(d)) continue;
    if (![...own].some((n) => n.includes(d) || d.includes(n))) out.push(raw);
  }
  return out;
}
