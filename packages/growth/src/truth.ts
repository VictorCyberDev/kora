/**
 * Truth Engine (ADR-027). Every fact carries provenance; every generated claim must be backed by a fact
 * that is trusted enough for that kind of claim and not expired. Unsupported claims are blocked, never softened,
 * and the gap is turned into a question for the owner. Pure and deterministic.
 */
import type { BusinessFacts } from "./facts.js";

export const TRUTH_SOURCES = [
  "INFERRED",
  "SCRAPED",
  "OWNER_UPLOADED",
  "OWNER_STATED",
  "VERIFIED",
] as const;
export type TruthSource = (typeof TRUTH_SOURCES)[number];
const RANK: Record<TruthSource, number> = {
  INFERRED: 1,
  SCRAPED: 2,
  OWNER_UPLOADED: 3,
  OWNER_STATED: 4,
  VERIFIED: 5,
};

export const CLAIM_KINDS = [
  "price",
  "hours",
  "offer",
  "product",
  "staff",
  "premises",
  "testimonial",
  "metric",
  "tone",
  "general",
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/** Minimum provenance a fact needs before a claim of this kind may rely on it. */
export const MIN_SOURCE: Record<ClaimKind, TruthSource> = {
  price: "OWNER_STATED",
  hours: "OWNER_STATED",
  offer: "OWNER_STATED",
  product: "OWNER_STATED",
  staff: "VERIFIED",
  premises: "VERIFIED",
  testimonial: "VERIFIED",
  metric: "VERIFIED",
  tone: "INFERRED",
  general: "SCRAPED",
};

export type TruthFact = {
  key: string;
  kind: ClaimKind;
  value: string;
  source: TruthSource;
  /** 0..1, how sure the source is. A VERIFIED fact below 0.5 still does not pass. */
  confidence: number;
  observedAt: string;
  expiresAt?: string;
};

export type Claim = { kind: ClaimKind; key: string; text?: string };

export type ClaimVerdict =
  | { ok: true; claim: Claim; factKey: string }
  | {
      ok: false;
      claim: Claim;
      reason: "MISSING" | "EXPIRED" | "LOW_TRUST";
      question: string;
    };

const MIN_CONFIDENCE = 0.5;

function question(c: Claim, why: string): string {
  const what = c.text ? `"${c.text}"` : c.key;
  switch (c.kind) {
    case "price":
      return `What is the price for ${what}? ${why}`;
    case "hours":
      return `What are your opening hours? ${why}`;
    case "offer":
      return `Is the offer ${what} still running, and until when? ${why}`;
    case "product":
      return `Do you sell ${what}? ${why}`;
    case "staff":
      return `Can you confirm this about your team: ${what}? ${why}`;
    case "premises":
      return `Can you confirm this about your premises: ${what}? ${why}`;
    case "testimonial":
      return `Do you have permission to quote ${what}? ${why}`;
    case "metric":
      return `Can you confirm this number: ${what}? ${why}`;
    default:
      return `Can you confirm: ${what}? ${why}`;
  }
}

export function evaluateClaim(
  claim: Claim,
  facts: readonly TruthFact[],
  now: Date = new Date(),
): ClaimVerdict {
  const matches = facts.filter(
    (f) => f.key === claim.key && f.kind === claim.kind,
  );
  if (matches.length === 0)
    return {
      ok: false,
      claim,
      reason: "MISSING",
      question: question(claim, "Kora has nothing on record."),
    };
  const live = matches.filter(
    (f) => !f.expiresAt || new Date(f.expiresAt).getTime() > now.getTime(),
  );
  if (live.length === 0)
    return {
      ok: false,
      claim,
      reason: "EXPIRED",
      question: question(claim, "What Kora has on record has expired."),
    };
  const need = RANK[MIN_SOURCE[claim.kind]];
  const best = live
    .filter((f) => RANK[f.source] >= need && f.confidence >= MIN_CONFIDENCE)
    .sort(
      (a, b) => RANK[b.source] - RANK[a.source] || b.confidence - a.confidence,
    )[0];
  if (!best)
    return {
      ok: false,
      claim,
      reason: "LOW_TRUST",
      question: question(claim, "Kora's record is not reliable enough yet."),
    };
  return { ok: true, claim, factKey: best.key };
}

export type ClaimLedger = {
  used: Array<{ claim: Claim; factKey: string }>;
  blocked: Array<Extract<ClaimVerdict, { ok: false }>>;
  /** Unique owner questions, in claim order. */
  questions: string[];
  /** True only when every claim is supported. */
  publishable: boolean;
};

/** Record which facts an artefact relied on and what it may not say. */
export function buildLedger(
  claims: readonly Claim[],
  facts: readonly TruthFact[],
  now: Date = new Date(),
): ClaimLedger {
  const used: ClaimLedger["used"] = [];
  const blocked: ClaimLedger["blocked"] = [];
  for (const c of claims) {
    const v = evaluateClaim(c, facts, now);
    if (v.ok) used.push({ claim: c, factKey: v.factKey });
    else blocked.push(v);
  }
  return {
    used,
    blocked,
    questions: [...new Set(blocked.map((b) => b.question))],
    publishable: blocked.length === 0,
  };
}

/** Owner-entered BusinessFacts become OWNER_STATED facts; an offer past its end date gets an expiry. */
export function factsFromBusiness(
  bf: BusinessFacts,
  observedAt: string,
): TruthFact[] {
  const out: TruthFact[] = [];
  const add = (
    kind: ClaimKind,
    key: string,
    value: string,
    expiresAt?: string,
  ) =>
    out.push({
      key,
      kind,
      value,
      source: "OWNER_STATED",
      confidence: 1,
      observedAt,
      ...(expiresAt ? { expiresAt } : {}),
    });
  if (bf.availability.hours.length)
    add(
      "hours",
      "hours",
      bf.availability.hours.map((h) => `${h.days} ${h.hours}`).join("; "),
    );
  for (const s of bf.offer.services)
    add("product", `product:${s.toLowerCase()}`, s);
  for (const o of bf.offer.offers) {
    add(
      "offer",
      `offer:${o.id}`,
      o.title,
      o.endsOn ? `${o.endsOn}T23:59:59Z` : undefined,
    );
    if (o.price)
      add(
        "price",
        `price:${o.id}`,
        o.price,
        o.endsOn ? `${o.endsOn}T23:59:59Z` : undefined,
      );
  }
  return out;
}
