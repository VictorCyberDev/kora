/**
 * Brand Genome (M7). One versioned object that every engine reads: strategic, verbal, visual, motion,
 * commercial and performance DNA, plus distinctive brand codes. Derived from the Brand Kit and Truth facts,
 * never invented: a field the owner has not given stays empty and becomes a question.
 */
import { z } from "zod";
import type { BrandKit } from "./brand.js";
import type { ArtDirection } from "./artdirection.js";
import type { BusinessFacts } from "./facts.js";

export const GenomeSchema = z.object({
  version: z.number().int().min(1),
  strategic: z.object({
    positioning: z.string().max(240).default(""),
    audience: z.string().max(240).default(""),
    promise: z.string().max(200).default(""),
    differentiators: z.array(z.string().max(120)).max(5).default([]),
  }),
  verbal: z.object({
    tone: z.string().max(40),
    use: z.array(z.string().max(40)).max(12),
    avoid: z.array(z.string().max(40)).max(12),
    language: z.string().max(20),
    sentenceRules: z.array(z.string().max(120)).max(6).default([]),
  }),
  visual: z.object({
    ink: z.string(),
    canvas: z.string(),
    primary: z.string(),
    accent: z.string(),
    displayFamily: z.string(),
    bodyFamily: z.string(),
    shape: z.string(),
    imageryStyle: z.string(),
  }),
  motion: z.object({
    behaviour: z.string().max(40).default("none"),
    reducedMotion: z.string().max(120).default(""),
  }),
  commercial: z.object({
    services: z.array(z.string().max(100)).max(30),
    activeOffers: z.array(z.string().max(100)).max(20),
    city: z.string().max(80).default(""),
  }),
  performance: z.object({
    /** Filled only from observed outcomes (memory); empty until there is evidence. */
    whatWorked: z.array(z.string().max(160)).max(10).default([]),
    whatDidnt: z.array(z.string().max(160)).max(10).default([]),
  }),
  codes: z.array(z.string().max(60)).max(5).default([]),
});
export type Genome = z.infer<typeof GenomeSchema>;

export function deriveGenome(
  kit: BrandKit,
  facts: BusinessFacts,
  opts: {
    art?: ArtDirection;
    previous?: Genome;
    wins?: string[];
    losses?: string[];
  } = {},
): Genome {
  return GenomeSchema.parse({
    version: (opts.previous?.version ?? 0) + 1,
    strategic: {
      positioning: opts.previous?.strategic.positioning ?? "",
      audience: opts.previous?.strategic.audience ?? "",
      promise: facts.identity.tagline ?? opts.previous?.strategic.promise ?? "",
      differentiators: opts.previous?.strategic.differentiators ?? [],
    },
    verbal: {
      tone: kit.voice.tone,
      use: kit.voice.use,
      avoid: kit.voice.avoid,
      language: kit.voice.language,
      sentenceRules: opts.previous?.verbal.sentenceRules ?? [],
    },
    visual: {
      ink: kit.colors.ink,
      canvas: kit.colors.canvas,
      primary: kit.colors.primary,
      accent: kit.colors.accent,
      displayFamily: kit.typography.displayFamily,
      bodyFamily: kit.typography.bodyFamily,
      shape: kit.shape,
      imageryStyle: kit.imagery.style,
    },
    motion: {
      behaviour:
        opts.art?.motion.behaviour ?? opts.previous?.motion.behaviour ?? "none",
      reducedMotion:
        opts.art?.motion.reducedMotion ??
        opts.previous?.motion.reducedMotion ??
        "",
    },
    commercial: {
      services: facts.offer.services,
      activeOffers: facts.offer.offers.map((o) => o.title),
      city: facts.contact.city ?? "",
    },
    performance: {
      whatWorked: opts.wins ?? opts.previous?.performance.whatWorked ?? [],
      whatDidnt: opts.losses ?? opts.previous?.performance.whatDidnt ?? [],
    },
    codes: opts.art?.brandCodes ?? opts.previous?.codes ?? [],
  });
}

/** What the genome still lacks, phrased as questions to the owner. */
export function genomeGaps(g: Genome): string[] {
  const q: string[] = [];
  if (!g.strategic.positioning)
    q.push(
      "In one sentence, why should someone choose you over the business down the road?",
    );
  if (!g.strategic.audience) q.push("Who is your best customer?");
  if (!g.strategic.promise)
    q.push("What can customers always count on from you?");
  if (g.strategic.differentiators.length === 0)
    q.push("What do you do that others nearby do not?");
  if (g.commercial.services.length === 0) q.push("What do you sell or offer?");
  if (g.codes.length === 0)
    q.push("Is there one detail people remember about your look or your work?");
  return q;
}

/** Does generated copy respect the genome? Returns problems; empty means on-brand. */
export function genomeDrift(g: Genome, copy: string): string[] {
  const out: string[] = [];
  const lower = copy.toLowerCase();
  for (const w of g.verbal.avoid)
    if (
      w &&
      new RegExp(
        `\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ).test(lower)
    )
      out.push(`uses a word the owner asked to avoid: "${w}"`);
  if (
    g.verbal.use.length >= 3 &&
    !g.verbal.use.some((w) => lower.includes(w.toLowerCase()))
  )
    out.push("uses none of the owner's preferred words");
  return out;
}

/** Fields that changed between two genome versions, for the "what changed and why" view. */
export function genomeDiff(a: Genome, b: Genome): string[] {
  const out: string[] = [];
  const walk = (x: unknown, y: unknown, path: string) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (
      x &&
      y &&
      typeof x === "object" &&
      typeof y === "object" &&
      !Array.isArray(x)
    ) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)]))
        walk(
          (x as Record<string, unknown>)[k],
          (y as Record<string, unknown>)[k],
          path ? `${path}.${k}` : k,
        );
    } else out.push(path);
  };
  walk({ ...a, version: 0 }, { ...b, version: 0 }, "");
  return out;
}
