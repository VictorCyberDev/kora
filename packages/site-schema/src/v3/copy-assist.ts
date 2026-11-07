import { findCliches } from "@kora/creative";
import type { SiteSpecV3 } from "./spec.js";

/**
 * Optional model-assisted copy for the opening of a site. The model never gets authority: its proposal is checked
 * against everything the owner actually said, and anything that cannot be traced to that is thrown away in favour of
 * the deterministic copy that was already there. A model being down, slow, wrong or clever changes nothing.
 */
export interface CopyProposal {
  heading: string;
  subheading: string;
}

/** Everything the owner told us, flattened: the only place numbers, names and promises may come from. */
export function factsOf(spec: SiteSpecV3): string {
  const b = spec.business;
  const parts: string[] = [
    b.name,
    b.description,
    b.industry ?? "",
    b.location ?? "",
    b.phone ?? "",
    b.whatsapp ?? "",
    b.email ?? "",
    ...(b.hours ?? []).flatMap((h) => [h.days, h.hours]),
  ];
  for (const p of spec.pages)
    for (const s of p.sections) parts.push(JSON.stringify(s));
  return parts.join(" \n ").toLowerCase();
}

const PROMISES =
  /\b(award[- ]winning|awarded|best|finest|greatest|premier|top[- ](rated|notch|tier)|#\s?1|number (one|1)|leading|world[- ]class|guarantee[ds]?|money[- ]back|certified|accredited|licen[sc]ed|insured|voted|rated|five[- ]star|5[- ]star|trusted by|loved by|as seen (on|in)|free\b|discount|\d+\s?%\s?off|cheapest|lowest price|years of experience|since (19|20)\d\d)\b/i;
const MONEY = /[₦$£€]|\b(naira|dollars?|usd|ngn)\b/i;
const MARKUP =
  /[<>]|&[a-z#0-9]+;|javascript:|data:|on[a-z]+\s*=|\bhttps?:|www\./i;
const TESTIMONIAL = /["“”].{8,}["“”]\s*[-–—]\s*\p{Lu}/u;

/**
 * Capitalised name-like runs ("Tunde Bakare") inside one sentence whose words are not all in the owner's own words.
 * Sentences are checked separately so a full stop followed by a capital is never mistaken for a name.
 */
function inventedNames(text: string, facts: string): string[] {
  const out: string[] = [];
  const re =
    /(?<=[a-z,;:]\s)([\p{Lu}][\p{Ll}'’-]{2,})(\s[\p{Lu}][\p{Ll}'’-]{2,})+/gu;
  for (const sentence of text.split(/[.!?]+\s+|\n/))
    for (const m of sentence.matchAll(re)) {
      const words = m[0].toLowerCase().split(/\s+/);
      if (!words.every((w) => facts.includes(w))) out.push(m[0]);
    }
  return out;
}

/** The checks every piece of model-written text must pass. Returns the reasons it was refused; empty means acceptable. */
export function validateText(text: string, facts: string): string[] {
  const reasons: string[] = [];
  if (MARKUP.test(text)) reasons.push("it contains markup or a link");
  // numbers: every digit run must already be in the owner's facts
  for (const n of text.match(/\d[\d,.]*/g) ?? [])
    if (!facts.includes(n.toLowerCase()))
      reasons.push(`the number "${n}" was never supplied`);
  if (MONEY.test(text) && !MONEY.test(facts))
    reasons.push("it states a price or currency the owner never gave");
  const promise = PROMISES.exec(text);
  if (promise && !facts.includes(promise[0].toLowerCase()))
    reasons.push(`"${promise[0]}" is a claim the owner never made`);
  if (TESTIMONIAL.test(text)) reasons.push("it reads like a testimonial");
  const names = inventedNames(text, facts);
  if (names.length) reasons.push(`"${names[0]}" looks like an invented name`);
  const cliche = findCliches(text);
  if (cliche.length) reasons.push(`"${cliche[0]}" is a generic phrase`);
  return reasons;
}

export function validateProposal(
  p: CopyProposal,
  facts: string,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = `${p.heading} ${p.subheading}`;
  if (!p.heading.trim() || p.heading.length > 90)
    reasons.push("the heading is empty or too long");
  if (p.subheading.length > 240) reasons.push("the subheading is too long");
  reasons.push(...validateText(text, facts));
  return { ok: reasons.length === 0, reasons };
}

export interface CopyAssistResult {
  spec: SiteSpecV3;
  used: boolean;
  /** Why a proposal was not used (shown in logs and tests, never to visitors). */
  rejected: string[];
  inputTokens: number | null;
  outputTokens: number | null;
}

export const COPY_SYSTEM = `You write the opening headline and one supporting sentence for a small business website.
Use ONLY the facts in the JSON you are given. Do not add numbers, prices, years, awards, guarantees, customer quotes,
people's names, claims of being the best or leading, or links. Plain words, specific to what the business actually does.
Answer with JSON only: {"heading": string (max 70 characters), "subheading": string (max 200 characters)}.`;

export type CopyModel = (
  system: string,
  user: string,
) => Promise<{
  text: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}>;

/** Asks the model for opening copy and applies it only if it passes every check. Never throws. */
export async function assistCopy(
  spec: SiteSpecV3,
  model: CopyModel,
): Promise<CopyAssistResult> {
  const keep = (
    rejected: string[],
    i: number | null = null,
    o: number | null = null,
  ) => ({
    spec,
    used: false,
    rejected,
    inputTokens: i,
    outputTokens: o,
  });
  const home = spec.pages.find((p) => p.slug === "home");
  const hero = home?.sections[0];
  if (!hero || hero.type !== "hero") return keep(["no hero to write"]);
  let res: Awaited<ReturnType<CopyModel>>;
  try {
    res = await model(
      COPY_SYSTEM,
      JSON.stringify({
        business: {
          name: spec.business.name,
          what: spec.business.description,
          where: spec.business.location ?? null,
        },
        current: { heading: hero.heading, subheading: hero.subheading ?? "" },
      }),
    );
  } catch {
    return keep(["the model was unavailable"]);
  }
  const i = res.inputTokens ?? null;
  const o = res.outputTokens ?? null;
  let raw: unknown;
  try {
    raw = JSON.parse(res.text.replace(/^```(?:json)?|```$/g, "").trim());
  } catch {
    return keep(["the answer was not valid JSON"], i, o);
  }
  const r = raw as Record<string, unknown>;
  if (!r || typeof r.heading !== "string" || typeof r.subheading !== "string")
    return keep(["the answer had the wrong shape"], i, o);
  const proposal = {
    heading: r.heading.trim(),
    subheading: r.subheading.trim(),
  };
  const v = validateProposal(proposal, factsOf(spec));
  if (!v.ok) return keep(v.reasons, i, o);
  const next = structuredClone(spec);
  const h = next.pages.find((p) => p.slug === "home")!.sections[0]!;
  if (h.type !== "hero") return keep(["no hero to write"], i, o);
  h.heading = proposal.heading;
  h.subheading = proposal.subheading;
  return {
    spec: next,
    used: true,
    rejected: [],
    inputTokens: i,
    outputTokens: o,
  };
}
