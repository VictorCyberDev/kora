/**
 * Creative Direction Engine. From Business Truth + Vertical Intelligence it proposes three directions that differ in
 * design language (not merely in colour), each with strategy, genome, palette, signature device and anti-patterns.
 * Selection is deterministic: the same brief always yields the same three directions.
 */
import { z } from "zod";
import { artDirect, type ImageBrief } from "./artdirection.js";
import { distinctColorway } from "./palette.js";
import {
  DesignGenomeSchema,
  genomeDistance,
  type DesignGenome,
} from "./genome.js";
import {
  GRAMMARS,
  grammarById,
  type Colorway,
  type Grammar,
} from "./grammars.js";
import {
  BrandStrategySchema,
  deriveBrandStrategy,
  offerPhrase,
} from "./strategy.js";
import { buildTruth, type BusinessTruth, type CreativeBrief } from "./truth.js";
import { resolveVertical, type VerticalIntel } from "./verticals.js";

export function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const CreativeDirectionSchema = z.object({
  id: z.string().max(60),
  index: z.number().int().min(0).max(2),
  grammarId: z.string().max(40),
  name: z.string().max(60),
  concept: z.string().max(240),
  businessRationale: z.string().max(400),
  visualRationale: z.string().max(400),
  strategy: BrandStrategySchema,
  genome: DesignGenomeSchema,
  colorwayId: z.string().max(40),
  paletteBehaviour: z.string().max(200),
  typographySummary: z.string().max(200),
  compositionSummary: z.string().max(200),
  motionSummary: z.string().max(200),
  ctaStrategy: z.string().max(200),
  signatureDevice: z.object({ name: z.string(), description: z.string() }),
  pagePhilosophy: z.string().max(240),
  campaignBehaviour: z.string().max(240),
  antiPatterns: z.array(z.string().max(80)).max(10),
  artDirection: z.array(z.custom<ImageBrief>()).max(4),
  /** Seed used for every controlled variation; stored so the direction is reproducible. */
  seed: z.number().int().min(0),
  fit: z.object({ score: z.number(), reasons: z.array(z.string()) }),
});
export type CreativeDirection = Omit<
  z.infer<typeof CreativeDirectionSchema>,
  "artDirection"
> & {
  artDirection: ImageBrief[];
};

const AVOID_MAP: Array<[RegExp, string]> = [
  [/playful|cute|cartoon/i, "playful"],
  [/luxury|showroom/i, "luxury"],
  [/dark|intimidat/i, "dark"],
  [/corporate/i, "corporate"],
  [/delicate/i, "delicate"],
  [/loud|flashy|neon/i, "bold"],
  [/clinical|sterile|cold/i, "technical"],
];
export function avoidTags(antiTraits: string[]): Set<string> {
  const out = new Set<string>();
  for (const a of antiTraits)
    for (const [re, tag] of AVOID_MAP) if (re.test(a)) out.add(tag);
  return out;
}

const idx = (n: number, seed: number, salt: number) =>
  Math.abs(Math.imul(seed ^ (salt * 0x9e3779b1), 2246822519)) % n;

export interface FitResult {
  grammar: Grammar;
  score: number;
  reasons: string[];
}

export function scoreGrammars(
  truth: BusinessTruth,
  v: VerticalIntel,
): FitResult[] {
  const feel =
    `${truth.brief.feel ?? ""} ${truth.brief.description}`.toLowerCase();
  const explicitFeel = (truth.brief.feel ?? "").toLowerCase();
  const avoid = avoidTags(v.antiTraits);
  const out: FitResult[] = [];
  for (const g of GRAMMARS) {
    const reasons: string[] = [];
    let score = 0;
    const rank = v.grammars.indexOf(g.id);
    if (rank >= 0) {
      score += 6 - rank * 1.5;
      reasons.push(`suits ${v.label.toLowerCase()}`);
    }
    const hit = new RegExp(g.feel, "i");
    if (explicitFeel && hit.test(explicitFeel)) {
      score += 8;
      reasons.push("matches the feel the owner asked for");
    } else if (hit.test(feel)) {
      score += 2;
      reasons.push("matches how the business describes itself");
    }
    const hits = g.tags.filter((t) => avoid.has(t));
    if (hits.length) {
      score -= (explicitFeel && hit.test(explicitFeel) ? 0 : 8) * hits.length;
      reasons.push(
        `conflicts with what this vertical must avoid (${hits.join(", ")})`,
      );
    }
    // Real photography is the trust signal for photo-led verticals: prefer photo-capable grammars when photos exist.
    if (
      v.photoTrust &&
      truth.can.photos &&
      g.genome.imageDominance === "dominant"
    )
      score += 1.5;
    if (
      v.photoTrust &&
      !truth.can.photos &&
      g.genome.imageDominance === "dominant" &&
      !v.catalogRecipe
    )
      score -= 1.5;
    // Density: dense verticals favour compact grammars.
    if (
      v.density === "compact" &&
      (g.genome.density === "compact" || g.genome.density === "dense")
    )
      score += 1;
    if (v.density === "airy" && g.genome.density === "airy") score += 1;
    // Mobile action priority: call/whatsapp-first verticals should not get art-gallery heroes.
    if (
      (v.primaryIntent === "call" || v.primaryIntent === "quote") &&
      g.genome.mobileStrategy === "action-dock"
    )
      score += 1.5;
    out.push({ grammar: g, score, reasons });
  }
  return out.sort(
    (a, b) => b.score - a.score || a.grammar.id.localeCompare(b.grammar.id),
  );
}

/** Choose three grammars: the best fit, then the best fit that is most different from it, then from both. */
export function chooseGrammars(
  truth: BusinessTruth,
  v: VerticalIntel,
): FitResult[] {
  const ranked = scoreGrammars(truth, v).filter((r) => r.score > -4);
  const pool = ranked.slice(0, 9);
  const first = pool[0]!;
  const rest = pool.slice(1);
  const dist = (a: Grammar, b: Grammar) => genomeDistance(a.genome, b.genome);
  const score2 = (c: FitResult) => c.score + 9 * dist(c.grammar, first.grammar);
  const second =
    [...rest].sort((a, b) => score2(b) - score2(a))[0] ?? ranked[1]!;
  const rem = rest.filter((r) => r !== second);
  const score3 = (c: FitResult) =>
    c.score +
    8 *
      Math.min(dist(c.grammar, first.grammar), dist(c.grammar, second.grammar));
  const third = [...rem].sort((a, b) => score3(b) - score3(a))[0] ?? ranked[2]!;
  return [first, second, third];
}

/**
 * Controlled variation: two businesses that share a grammar still differ in hero, services layout, motif,
 * headline behaviour, radius, header and colourway. Variation never touches identity-critical fields
 * (typeVoice, composition mode, palette behaviour) so the language stays coherent.
 */
export function varyGenome(
  g: Grammar,
  seed: number,
  slot: number,
  truth: BusinessTruth,
): DesignGenome {
  const a = g.alternates;
  const salt = fnv(g.id) + slot;
  const next: DesignGenome = {
    ...g.genome,
    heroPhilosophy: a.hero[idx(a.hero.length, seed, salt + 1)]!,
    servicePresentation: a.service[idx(a.service.length, seed, salt + 2)]!,
    signatureMotif: a.motif[idx(a.motif.length, seed, salt + 3)]!,
    headlineBehavior: a.headline[idx(a.headline.length, seed, salt + 4)]!,
    radiusStyle: a.radius[idx(a.radius.length, seed, salt + 5)]!,
    headerStyle: a.header[idx(a.header.length, seed, salt + 6)]!,
    ...(a.voice?.length
      ? { typeVoice: a.voice[idx(a.voice.length, seed, salt + 7)]! }
      : {}),
  };
  // Truth-driven constraints, never taste: without any photograph a photo-led hero is not allowed to pretend.
  if (
    !truth.can.photos &&
    (next.heroPhilosophy === "cinematic" ||
      next.heroPhilosophy === "arch-portrait" ||
      next.heroPhilosophy === "product-dominant") &&
    g.genome.imageDominance !== "dominant"
  )
    next.heroPhilosophy = "editorial-split";
  return DesignGenomeSchema.parse(next);
}

const typographySummary = (g: DesignGenome) =>
  `${g.typeVoice.replace(/-/g, " ")} type, ${g.typeContrast} contrast, ${g.headlineBehavior.replace(/-/g, " ")} headlines`;

export interface ComposeOptions {
  /** Which grammar to use for each slot, bypassing selection (used when the owner re-rolls one direction). */
  grammarIds?: [string, string, string];
  /** Rotates away from grammars shown recently (template-fatigue guard). */
  avoidGrammarIds?: string[];
}

export function composeDirections(
  input: CreativeBrief,
  opts: ComposeOptions = {},
): CreativeDirection[] {
  const truth = buildTruth(input);
  const b = truth.brief;
  const v = resolveVertical(`${b.name} ${b.industry ?? ""} ${b.description}`);
  const seed = fnv(`${b.name}|${b.description}|${b.industry ?? ""}`);
  let chosen: FitResult[];
  if (opts.grammarIds) {
    chosen = opts.grammarIds.map((id) => {
      const g = grammarById(id) ?? GRAMMARS[0]!;
      return { grammar: g, score: 0, reasons: ["chosen by the owner"] };
    });
  } else {
    const ranked = chooseGrammars(truth, v);
    chosen = ranked;
    const avoid = new Set(opts.avoidGrammarIds ?? []);
    if (avoid.size && ranked.some((r) => avoid.has(r.grammar.id))) {
      const replacements = scoreGrammars(truth, v).filter(
        (r) =>
          !avoid.has(r.grammar.id) &&
          r.score > -4 &&
          !ranked.some((x) => x.grammar.id === r.grammar.id),
      );
      chosen = ranked.map((r) =>
        avoid.has(r.grammar.id) && replacements.length
          ? replacements.shift()!
          : r,
      );
    }
  }
  const used: Colorway[] = [];
  return chosen.map((fit, index) => {
    const g = fit.grammar;
    const genome = varyGenome(g, seed, index, truth);
    const colorway = distinctColorway(
      g,
      seed,
      index,
      `${b.feel ?? ""} ${b.description}`,
      used,
    );
    used.push(colorway);
    const strategy = deriveBrandStrategy(truth, v, g);
    const thing = offerPhrase(truth, v);
    const ad = (["hero", "feature", "gallery"] as const).map((placement) =>
      artDirect({
        vertical: v,
        grammar: { ...g, genome },
        thing,
        palette: {
          bg: colorway.bg,
          primary: colorway.primary,
          accent: colorway.accent,
          mode: colorway.mode,
        },
        hasOwnerPhotos: truth.can.photos,
        placement,
      }),
    );
    return {
      id: `${g.id}-${seed.toString(36)}-${index}`,
      index,
      grammarId: g.id,
      name: g.name,
      concept: g.concept,
      businessRationale: `${v.label}: customers want to "${v.jobToBeDone.toLowerCase()}". ${fit.reasons.join("; ") || "Balanced fit"}.`,
      visualRationale: `${g.visualTension}. ${g.signature.name}: ${g.signature.description}`,
      strategy,
      genome,
      colorwayId: colorway.id,
      paletteBehaviour: `${genome.paletteBehavior.replace(/-/g, " ")} (${colorway.label}); accent ${genome.accentScarcity}`,
      typographySummary: typographySummary(genome),
      compositionSummary: `${genome.compositionMode.replace(/-/g, " ")}, ${genome.density} density, ${genome.heroPhilosophy.replace(/-/g, " ")} opening`,
      motionSummary: `${genome.motionIntensity}, ${genome.motionCharacter}. ${g.motionNote}`,
      ctaStrategy: `Primary action: ${v.primaryIntent}; secondary: ${v.secondaryIntent}. ${g.conversionMood}.`,
      signatureDevice: g.signature,
      pagePhilosophy: `${v.pages.join(" · ")}${v.singlePageSuffices ? " (one strong page can carry this business)" : ""}`,
      campaignBehaviour: g.campaignBehaviour,
      antiPatterns: g.antiPatterns,
      artDirection: ad,
      seed,
      fit: { score: Math.round(fit.score * 10) / 10, reasons: fit.reasons },
    };
  });
}

/**
 * "Choose for me": scores each direction against intent, trust, goal, photos, mobile need and conversion,
 * and returns the winner with a plain-language reason. Never simply the first one.
 */
export function chooseForMe(
  directions: CreativeDirection[],
  input: CreativeBrief,
): { index: number; reason: string; scores: number[] } {
  const truth = buildTruth(input);
  const b = truth.brief;
  const v = resolveVertical(`${b.name} ${b.industry ?? ""} ${b.description}`);
  const scores = directions.map((d) => {
    const g = d.genome;
    let s = d.fit.score;
    if (
      v.primaryIntent === "call" ||
      v.primaryIntent === "whatsapp" ||
      v.primaryIntent === "quote"
    )
      s += g.mobileStrategy === "action-dock" ? 2 : 0;
    if (b.goal === "show-work" && g.imageDominance === "dominant")
      s += truth.can.photos ? 2 : -1;
    if (
      b.goal === "bookings" &&
      (g.heroPhilosophy === "booking-focus" ||
        g.buttonCharacter !== "underline")
    )
      s += 1;
    if (!truth.can.photos && g.imageDominance === "dominant") s -= 1.5;
    if (truth.can.photos && g.imageDominance === "dominant") s += 1.5;
    if (v.density === "compact" && g.density === "airy") s -= 1;
    if (truth.can.whatsapp && g.mobileStrategy === "action-dock") s += 0.5;
    return Math.round(s * 10) / 10;
  });
  let best = 0;
  scores.forEach((s, i) => {
    if (s > scores[best]!) best = i;
  });
  const d = directions[best]!;
  const why: string[] = [];
  if (d.fit.reasons[0]) why.push(d.fit.reasons[0]);
  if (!truth.can.photos && d.genome.imageDominance !== "dominant")
    why.push("it does not depend on photos you have not supplied yet");
  if (
    (v.primaryIntent === "call" || v.primaryIntent === "whatsapp") &&
    d.genome.mobileStrategy === "action-dock"
  )
    why.push("it keeps calling and messaging one tap away on a phone");
  return {
    index: best,
    reason: `${d.name}: ${why.join("; ") || "the best overall fit for what you told us"}.`,
    scores,
  };
}
