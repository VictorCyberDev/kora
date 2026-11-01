/**
 * Campaign as a first-class object (M12). A strategy, a big idea chosen from genuinely different directions,
 * a key visual brief and channel adaptations. Ads are hypotheses with a hard cap and always need approval;
 * Kora never spends on its own and does not try to be an ad-buying console.
 */
import { z } from "zod";
import type { Genome } from "./genome.js";
import { BUNDLE_CHANNELS, type BundleChannel } from "./bundle.js";

export const CAMPAIGN_OBJECTIVES = [
  "announce",
  "fill_slots",
  "clear_stock",
  "bring_back",
  "build_awareness",
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const ANGLES = ["product", "moment", "people", "place"] as const;
export type Angle = (typeof ANGLES)[number];

export const CampaignBriefSchema = z.object({
  name: z.string().trim().min(1).max(100),
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  audience: z.string().trim().min(3).max(200),
  /** Truth Engine key of the offer, price or product the campaign is about. */
  subjectKey: z.string().max(80),
  subject: z.string().trim().min(1).max(120),
  startOn: z.string().date(),
  endOn: z.string().date().optional(),
  channels: z.array(z.enum(BUNDLE_CHANNELS)).min(1).max(4),
});
export type CampaignBrief = z.infer<typeof CampaignBriefSchema>;

export interface CreativeDirection {
  angle: Angle;
  bigIdea: string;
  headline: string;
  visual: { treatment: string; subject: string; crop: string };
  tone: string;
  /** Facts this direction depends on; people/place need verified facts the owner may not have. */
  needs: Array<
    "verified-testimonial" | "verified-premises" | "product-photo" | "date"
  >;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Four different ways into the same offer. Deterministic; a model may rewrite wording, never the structure. */
export function creativeDirections(
  b: CampaignBrief,
  g: Pick<Genome, "verbal" | "commercial">,
): CreativeDirection[] {
  const subj = b.subject;
  const city = g.commercial.city;
  const tone = g.verbal.tone;
  return [
    {
      angle: "product",
      bigIdea: `${cap(subj)}, shown close and plain.`,
      headline: cap(subj),
      visual: {
        treatment: "single hero photo, tight crop, no overlay clutter",
        subject: subj,
        crop: "close",
      },
      tone,
      needs: ["product-photo"],
    },
    {
      angle: "moment",
      bigIdea: `The occasion ${subj} is for${b.endOn ? ", with a real end date" : ""}.`,
      headline: b.endOn
        ? `${cap(subj)}: until ${b.endOn}`
        : `${cap(subj)}, for the moment you need it`,
      visual: {
        treatment: "calendar-led type, date as the visual",
        subject: "the date",
        crop: "type-first",
      },
      tone: "direct",
      needs: b.endOn ? [] : ["date"],
    },
    {
      angle: "people",
      bigIdea: `What a real customer said about ${subj}.`,
      headline: `In a customer's words`,
      visual: {
        treatment: "quote set large over a plain field",
        subject: "a verified quote",
        crop: "type-first",
      },
      tone: "warm",
      needs: ["verified-testimonial"],
    },
    {
      angle: "place",
      bigIdea: `Where ${subj} is made${city ? `, in ${city}` : ""}.`,
      headline: city ? `Made in ${city}` : "Made here",
      visual: {
        treatment: "wide environmental photo of the real premises",
        subject: "the premises",
        crop: "wide",
      },
      tone: "warm",
      needs: ["verified-premises"],
    },
  ];
}

/** Directions that can honestly be produced now, given what is verified. */
export function feasibleDirections(
  dirs: readonly CreativeDirection[],
  have: {
    productPhoto: boolean;
    verifiedTestimonial: boolean;
    verifiedPremises: boolean;
  },
): {
  feasible: CreativeDirection[];
  blocked: Array<{ angle: Angle; missing: string[] }>;
} {
  const feasible: CreativeDirection[] = [];
  const blocked: Array<{ angle: Angle; missing: string[] }> = [];
  for (const d of dirs) {
    const missing = d.needs.filter(
      (n) =>
        (n === "product-photo" && !have.productPhoto) ||
        (n === "verified-testimonial" && !have.verifiedTestimonial) ||
        (n === "verified-premises" && !have.verifiedPremises) ||
        n === "date",
    );
    if (missing.length) blocked.push({ angle: d.angle, missing });
    else feasible.push(d);
  }
  return { feasible, blocked };
}

/** Are the directions genuinely different? Same angle or same treatment twice means no. */
export function directionsDiffer(dirs: readonly CreativeDirection[]): boolean {
  const a = new Set(dirs.map((d) => d.angle));
  const t = new Set(dirs.map((d) => d.visual.treatment));
  const h = new Set(dirs.map((d) => d.headline.toLowerCase()));
  return (
    a.size === dirs.length && t.size === dirs.length && h.size === dirs.length
  );
}

export const AdHypothesisSchema = z.object({
  hypothesis: z.string().trim().min(10).max(240),
  channel: z.enum(BUNDLE_CHANNELS),
  audience: z.string().trim().min(3).max(200),
  /** Whole currency units; 0 means organic-only. */
  budgetCap: z.number().int().min(0).max(1_000_000),
  currency: z.string().length(3),
  days: z.number().int().min(1).max(30),
  successMetric: z.enum(["enquiries", "clicks", "whatsapp_taps", "calls"]),
  successTarget: z.number().int().min(1).max(100_000),
});
export type AdHypothesis = z.infer<typeof AdHypothesisSchema>;

export type AdState = "DRAFT" | "NEEDS_APPROVAL" | "APPROVED" | "REJECTED";

/** A hypothesis with spend can never be anything but NEEDS_APPROVAL until a person approves that exact cap. */
export function adState(
  h: AdHypothesis,
  approval?: { approvedCap: number; by: string } | null,
): AdState {
  if (h.budgetCap === 0) return "DRAFT";
  if (!approval) return "NEEDS_APPROVAL";
  return approval.approvedCap >= h.budgetCap && approval.by
    ? "APPROVED"
    : "NEEDS_APPROVAL";
}

/** Attribution honesty: how Kora knows a result. */
export type EvidenceLevel = "OBSERVED" | "INFERRED" | "ESTIMATED";
export function evidenceLabel(e: EvidenceLevel): string {
  return e === "OBSERVED"
    ? "Counted by Kora (tracked link or form)"
    : e === "INFERRED"
      ? "Likely, from timing and pattern"
      : "Estimated; not counted";
}

export function channelAdaptation(
  c: BundleChannel,
  d: CreativeDirection,
): { format: string; copyRule: string; assetNote: string } {
  switch (c) {
    case "instagram":
      return {
        format: "square or portrait image",
        copyRule: "short caption, one question or action, tags at the end",
        assetNote: d.visual.treatment,
      };
    case "facebook":
      return {
        format: "landscape image",
        copyRule: "two or three plain sentences, one link",
        assetNote: d.visual.treatment,
      };
    case "whatsapp":
      return {
        format: "portrait status image",
        copyRule: "one line plus price or date if the owner stated it",
        assetNote: d.visual.treatment,
      };
    default:
      return {
        format: "landscape image",
        copyRule: "offer title, dates, one button",
        assetNote: d.visual.treatment,
      };
  }
}
