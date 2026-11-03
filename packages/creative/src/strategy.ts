/**
 * Brand Strategy: decided before any visual design. The base (audience, trust, conversion) comes from the business
 * and its vertical; each direction then adds its own stance (essence, personality, visual tension).
 * Every field is labelled by origin so a design decision is never mistaken for a fact.
 */
import { z } from "zod";
import type { Grammar } from "./grammars.js";
import type { BusinessTruth } from "./truth.js";
import type { VerticalIntel } from "./verticals.js";

export const BrandStrategySchema = z.object({
  version: z.literal(1).default(1),
  brandEssence: z.string().max(200),
  audience: z.string().max(240),
  positioning: z.string().max(280),
  valuePromise: z.string().max(240),
  personality: z.array(z.string().max(40)).min(2).max(5),
  voice: z.string().max(120),
  tone: z.string().max(60),
  emotionalGoal: z.string().max(80),
  visualTension: z.string().max(120),
  differentiation: z.string().max(240),
  trustStrategy: z.string().max(280),
  conversionMood: z.string().max(160),
  contentCharacter: z.string().max(200),
  antiTraits: z.array(z.string().max(60)).max(10),
  rationale: z.string().max(600),
  /** Provenance of the load-bearing statements, so decisions stay distinguishable from facts. */
  basis: z.object({
    suppliedByOwner: z.array(z.string().max(80)).max(12),
    inferred: z.array(z.string().max(120)).max(8),
    designDecisions: z.array(z.string().max(120)).max(8),
    stillMissing: z.array(z.string().max(120)).max(10),
  }),
});
export type BrandStrategy = z.infer<typeof BrandStrategySchema>;

const verbsRe = (v: VerticalIntel) =>
  new RegExp(
    `\\b(?:focus(?:ed|es|ing)?\\s+(?:on|in)|specialis(?:e|es|ed|ing)\\s+in|specializ(?:e|es|ed|ing)\\s+in|(?:we|i)\\s+(?:${v.verbs.join("|")}|sell|make|offer|provide|do)|known for)\\s+([^.!?;\\n]{3,110})`,
    "i",
  );

/** What the business offers, in the owner's own words; falls back to the vertical's plain name. */
/**
 * Lower-cases a phrase for use inside a sentence while keeping what the owner wrote in capitals on purpose:
 * acronyms (AC, CCTV, HVAC, DJ), words with an internal capital (WhatsApp, iPhone) and words with digits (3D, 4x4).
 */
export function sentenceCase(s: string): string {
  return s
    .split(/(\s+)/)
    .map((w) =>
      /^[A-Z]{2,}[.,;:!?]?$/.test(w) ||
      /^\p{Ll}+\p{Lu}/u.test(w) ||
      /^\p{Lu}+\p{Ll}+\p{Lu}/u.test(w) ||
      /\d/.test(w)
        ? w
        : w.toLowerCase(),
    )
    .join("");
}

export function offerPhrase(truth: BusinessTruth, v: VerticalIntel): string {
  const services = truth.brief.services ?? [];
  if (services.length >= 2)
    return `${sentenceCase(services[0]!)} and ${sentenceCase(services[1]!)}`;
  const m = verbsRe(v).exec(truth.brief.description);
  if (m?.[1])
    return m[1]
      .replace(
        /\s+(?:and|but|so|because|in|at|from|for)\s+(?:i|we|our|my|the)\b.*$/i,
        "",
      )
      .replace(/[,\s]+$/, "")
      .trim()
      .replace(/^.*$/s, (x) => sentenceCase(x));
  return v.label.toLowerCase();
}

export function deriveBrandStrategy(
  truth: BusinessTruth,
  v: VerticalIntel,
  g: Grammar,
): BrandStrategy {
  const thing = offerPhrase(truth, v);
  const where = truth.brief.location ? ` in ${truth.brief.location}` : "";
  const essence = g.essence.replace("{thing}", thing);
  const supplied = truth.facts
    .map((f) => f.key)
    .filter((k, i, a) => a.indexOf(k) === i);
  return BrandStrategySchema.parse({
    version: 1,
    brandEssence: essence.charAt(0).toUpperCase() + essence.slice(1),
    audience: v.customer,
    positioning:
      `${truth.brief.name}${where}: ${thing}. Positioned as ${g.personality.join(", ")}.`.slice(
        0,
        280,
      ),
    valuePromise: `${v.jobToBeDone}.`,
    personality: g.personality,
    voice: g.voice,
    tone: g.tone,
    emotionalGoal: g.emotionalGoal,
    visualTension: g.visualTension,
    differentiation:
      "Only what the owner supplied is claimed; the difference is shown through craft, specificity and clarity rather than superlatives.",
    trustStrategy: v.photoTrust
      ? `Trust comes from real imagery and plain facts. Barrier to answer: ${v.trustBarrier}`
      : `Trust comes from clarity, restraint and verifiable facts the owner supplies. Barrier to answer: ${v.trustBarrier}`,
    conversionMood: g.conversionMood,
    contentCharacter: `${g.voice}; use ${v.voiceRange.join(", ")} language; no superlatives.`,
    antiTraits: [...new Set([...v.antiTraits, ...g.antiPatterns])].slice(0, 10),
    rationale:
      `${g.name} suits ${v.label.toLowerCase()} because the customer's main job is "${v.jobToBeDone.toLowerCase()}", which asks for ${g.emotionalGoal}. ${g.concept}`.slice(
        0,
        600,
      ),
    basis: {
      suppliedByOwner: supplied.slice(0, 12),
      inferred: truth.inferences.map((i) => i.statement).slice(0, 8),
      designDecisions: [
        `Direction: ${g.name}`,
        `Visual tension: ${g.visualTension}`,
        `Signature device: ${g.signature.name}`,
      ],
      stillMissing: truth.missing.slice(0, 10),
    },
  });
}
