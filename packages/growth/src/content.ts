import { z } from "zod";
import type { BrandKit } from "./brand.js";
import type { PresenceGraph } from "./graph.js";

export const CONTENT_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp",
  "tiktok",
  "google_business",
] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];
export const CONTENT_GOALS = [
  "promote_service",
  "announce_offer",
  "hours_notice",
  "welcome",
  "reminder",
] as const;
export type ContentGoal = (typeof CONTENT_GOALS)[number];

export const CHANNEL_LIMITS: Record<
  ContentChannel,
  { chars: number; hashtags: number }
> = {
  instagram: { chars: 2200, hashtags: 30 },
  facebook: { chars: 5000, hashtags: 5 },
  whatsapp: { chars: 1024, hashtags: 0 },
  tiktok: { chars: 2200, hashtags: 8 },
  google_business: { chars: 1500, hashtags: 0 },
};

export const ContentDraftSchema = z.object({
  headline: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2200),
  cta: z.string().trim().max(40).default(""),
  hashtags: z
    .array(z.string().regex(/^#[\p{L}\p{N}_]{2,30}$/u))
    .max(30)
    .default([]),
});
export type ContentDraft = z.infer<typeof ContentDraftSchema>;
export const ContentDraftsSchema = z.object({
  drafts: z.array(ContentDraftSchema).min(1).max(5),
});

export const ContentRequestSchema = z.object({
  goal: z.enum(CONTENT_GOALS),
  channel: z.enum(CONTENT_CHANNELS),
  /** For announce_offer: the offer id from the business profile. */
  offerId: z.string().max(41).optional(),
  /** For promote_service: one of the listed services. */
  service: z.string().max(100).optional(),
});
export type ContentRequest = z.infer<typeof ContentRequestSchema>;

/** Everything a writer (human or model) is allowed to know. Built from facts only. */
export interface ContentContext {
  business: string;
  industry: string;
  city: string | null;
  description: string;
  services: string[];
  offers: Array<{
    id: string;
    title: string;
    detail: string;
    price: string | null;
    endsOn: string | null;
  }>;
  expiredOfferIds: string[];
  expiredOfferTitles: string[];
  hours: string[];
  notice: string | null;
  contact: {
    whatsapp: string | null;
    phone: string | null;
    email: string | null;
  };
  voice: BrandKit["voice"];
}

export function buildContentContext(
  g: PresenceGraph,
  kit: BrandKit,
): ContentContext {
  return {
    business: g.identity.name,
    industry: g.identity.industry,
    city: g.contact.city ?? null,
    description: g.identity.description,
    services: g.offer.services,
    offers: g.offer.activeOffers.map((o) => ({
      id: o.id,
      title: o.title,
      detail: o.detail,
      price: o.price ?? null,
      endsOn: o.endsOn ?? null,
    })),
    expiredOfferIds: g.offer.expiredOffers.map((o) => o.id),
    expiredOfferTitles: g.offer.expiredOffers.map((o) => o.title),
    hours: g.availability.hours.map((h) => `${h.days}: ${h.hours}`),
    notice: g.availability.notice ?? null,
    contact: {
      whatsapp: g.contact.whatsapp ?? null,
      phone: g.contact.phone ?? null,
      email: g.contact.email ?? null,
    },
    voice: kit.voice,
  };
}

export class NotEnoughFacts extends Error {}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const reach = (c: ContentContext) =>
  c.contact.whatsapp
    ? `Message us on WhatsApp: ${c.contact.whatsapp}`
    : c.contact.phone
      ? `Call ${c.contact.phone}`
      : c.contact.email
        ? `Email ${c.contact.email}`
        : "";
const tag = (s: string) => `#${s.replace(/[^\p{L}\p{N}]/gu, "")}`.slice(0, 31);

const OPENERS: Record<string, string[]> = {
  warm: ["Hello from {b}!", "We're glad you're here.", "{b} is open for you."],
  professional: [
    "{b} — now serving customers.",
    "From {b}:",
    "An update from {b}.",
  ],
  playful: ["Guess what? {b} has news!", "Hey you! 👋", "Big day at {b}!"],
  premium: [
    "{b}.",
    "Introducing a refined choice from {b}.",
    "Crafted with care at {b}.",
  ],
  direct: [
    "{b}:",
    "Quick update from {b}.",
    "{b} — here is what you need to know.",
  ],
};

/**
 * Deterministic writer. Uses only the context: no price, time, number or claim that is not already a fact.
 * It is both the no-AI path and the fallback when a model's output fails validation.
 */
export function draftContent(
  ctx: ContentContext,
  req: ContentRequest,
): ContentDraft[] {
  const openers = OPENERS[ctx.voice.tone] ?? OPENERS.warm!;
  const place = ctx.city ? ` in ${ctx.city}` : "";
  const cta = reach(ctx);
  const baseTags = [ctx.business, ctx.industry, ctx.city ?? ""]
    .filter(Boolean)
    .map(tag)
    .filter((t) => t.length > 2);
  const limit = CHANNEL_LIMITS[req.channel].hashtags;
  const hashtags = limit ? baseTags.slice(0, Math.min(limit, 3)) : [];
  const mk = (i: number, headline: string, lines: string[]): ContentDraft => {
    const open = openers[i % openers.length]!.replaceAll("{b}", ctx.business);
    return ContentDraftSchema.parse({
      headline: headline.slice(0, 80),
      body: [open, ...lines.filter(Boolean).map(sentence), cta ? `${cta}` : ""]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 2200),
      cta: ctx.contact.whatsapp
        ? "Message us on WhatsApp"
        : ctx.contact.phone
          ? "Call us"
          : "",
      hashtags,
    });
  };
  switch (req.goal) {
    case "announce_offer": {
      const o = ctx.offers.find((x) => x.id === req.offerId);
      if (!o) {
        if (ctx.expiredOfferIds.includes(req.offerId ?? ""))
          throw new NotEnoughFacts(
            "That offer has ended. Choose a current offer or update its dates.",
          );
        throw new NotEnoughFacts("Choose one of your current offers first.");
      }
      const price = o.price ? ` ${o.price}` : "";
      const until = o.endsOn ? `Available until ${o.endsOn}` : "";
      return [
        mk(0, o.title, [
          o.title + (price ? ` —${price}` : ""),
          o.detail,
          until,
        ]),
        mk(1, `${o.title} at ${ctx.business}`, [
          `${o.detail || o.title}${place}`,
          until,
        ]),
        mk(2, o.title, [o.detail, price ? `Price:${price}` : "", until]),
      ];
    }
    case "promote_service": {
      const svc =
        req.service && ctx.services.includes(req.service) ? req.service : null;
      if (!svc)
        throw new NotEnoughFacts(
          "Choose one of the services on your profile first.",
        );
      return [
        mk(0, svc, [`${svc}${place}`, ctx.description]),
        mk(1, `${svc} with ${ctx.business}`, [
          `Looking for ${svc.toLowerCase()}? We can help${place}`,
        ]),
        mk(2, svc, [
          ctx.services.length > 1
            ? `Also available: ${ctx.services
                .filter((s) => s !== svc)
                .slice(0, 3)
                .join(", ")}`
            : "",
          `Ask us about ${svc.toLowerCase()}`,
        ]),
      ];
    }
    case "hours_notice": {
      if (!ctx.notice && !ctx.hours.length)
        throw new NotEnoughFacts(
          "Add your opening hours or a notice to your profile first.",
        );
      const lines = ctx.notice ? [ctx.notice] : ctx.hours;
      return [
        mk(0, ctx.notice ? "A notice from us" : "Our opening hours", [
          ...lines,
        ]),
        mk(1, ctx.notice ? "Please note" : "When to find us", [
          ctx.notice ?? `We are open ${ctx.hours.join("; ")}`,
        ]),
      ];
    }
    case "welcome":
      if (!ctx.description)
        throw new NotEnoughFacts(
          "Add a short description of your business first.",
        );
      return [
        mk(0, `Welcome to ${ctx.business}`, [
          ctx.description,
          ctx.services.length
            ? `What we do: ${ctx.services.slice(0, 4).join(", ")}`
            : "",
        ]),
        mk(1, ctx.business, [ctx.description]),
      ];
    case "reminder":
      if (!ctx.services.length && !ctx.description)
        throw new NotEnoughFacts("Add your services first.");
      return [
        mk(0, `${ctx.business} is here for you`, [
          ctx.services.length
            ? `${ctx.services.slice(0, 3).join(", ")}${place}`
            : ctx.description,
          ctx.hours.length ? `Open ${ctx.hours.join("; ")}` : "",
        ]),
        mk(1, "Need us?", [
          `We're ${ctx.city ? `in ${ctx.city} and ` : ""}ready to help`,
          ctx.hours[0] ? `Open ${ctx.hours[0]}` : "",
        ]),
      ];
  }
}

export interface DraftIssue {
  code:
    | "too_long"
    | "too_many_hashtags"
    | "unsupported_claim"
    | "banned_word"
    | "unsubstantiated_superlative"
    | "expired_offer"
    | "wrong_contact";
  severity: "block" | "warn";
  message: string;
}

const SUPERLATIVES =
  /\b(best|#1|number one|cheapest|guaranteed?|100%|world[- ]class|no\.?\s?1|unbeatable|miracle|cure[sd]?)\b/i;
const MONEY =
  /(?:₦|\bNGN\b|\bN(?=\d)|\$|£|€|\bGH₵|\bKES\b|\bKsh\b)\s?[\d][\d,]*(?:\.\d+)?/gi;
const TIME = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi;
const PHONE = /\+?\d[\d\s()-]{6,}\d/g;
const digits = (s: string) => s.replace(/\D/g, "");
const compact = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Business-rule validation. A model draft that fails a `block` rule is rejected; it never reaches the database. */
export function validateDraft(
  d: ContentDraft,
  ctx: ContentContext,
  channel: ContentChannel,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const text = `${d.headline}\n${d.body}\n${d.cta}`;
  // Links (including tracking codes) are not claims about prices, times or phone numbers.
  const claimText = text.replace(/https?:\/\/\S+/gi, " ");
  const lim = CHANNEL_LIMITS[channel];
  if (text.length > lim.chars)
    issues.push({
      code: "too_long",
      severity: "block",
      message: `Too long for ${channel} (${text.length}/${lim.chars}).`,
    });
  if (d.hashtags.length > lim.hashtags)
    issues.push({
      code: "too_many_hashtags",
      severity: "block",
      message: `${channel} allows at most ${lim.hashtags} hashtags here.`,
    });
  const corpus = compact(
    [
      ctx.business,
      ctx.description,
      ...ctx.services,
      ...ctx.hours,
      ctx.notice ?? "",
      ...ctx.offers.flatMap((o) => [
        o.title,
        o.detail,
        o.price ?? "",
        o.endsOn ?? "",
      ]),
      ...Object.values(ctx.contact).map((v) => v ?? ""),
    ].join(" "),
  );
  const corpusDigits = digits(corpus);
  const corpusNumbers = new Set(
    (
      [
        ctx.description,
        ...ctx.offers.flatMap((o) => [o.title, o.detail, o.price ?? ""]),
      ]
        .join(" ")
        .match(/\d[\d,]*(?:\.\d+)?/g) ?? []
    ).map((n) => n.replace(/,/g, "")),
  );
  for (const m of claimText.match(MONEY) ?? []) {
    const n = (m.match(/\d[\d,]*(?:\.\d+)?/)?.[0] ?? "").replace(/,/g, "");
    if (!corpusNumbers.has(n))
      issues.push({
        code: "unsupported_claim",
        severity: "block",
        message: `The price "${m}" is not in your profile.`,
      });
  }
  for (const m of claimText.match(TIME) ?? [])
    if (!corpus.includes(compact(m)))
      issues.push({
        code: "unsupported_claim",
        severity: "block",
        message: `The time "${m}" is not in your opening hours.`,
      });
  for (const m of claimText.match(PHONE) ?? []) {
    const dg = digits(m);
    if (
      dg.length >= 7 &&
      !corpusDigits.includes(dg.replace(/^0+/, "")) &&
      !corpusDigits.includes(dg)
    )
      issues.push({
        code: "wrong_contact",
        severity: "block",
        message: `The number "${m.trim()}" is not one of your contact numbers.`,
      });
  }
  const sup = SUPERLATIVES.exec(text);
  if (sup)
    issues.push({
      code: "unsubstantiated_superlative",
      severity: "warn",
      message: `"${sup[0]}" is a claim you may not be able to prove.`,
    });
  for (const w of ctx.voice.avoid)
    if (
      w &&
      new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
        text,
      )
    )
      issues.push({
        code: "banned_word",
        severity: "block",
        message: `Uses "${w}", which your Brand Kit says to avoid.`,
      });
  const lower = text.toLowerCase();
  for (const t of ctx.expiredOfferTitles)
    if (t && lower.includes(t.toLowerCase()))
      issues.push({
        code: "expired_offer",
        severity: "block",
        message: `"${t}" has ended and should not be advertised.`,
      });
  return issues;
}

export type ContentSource = "model" | "deterministic";
export interface ContentModel {
  (input: {
    system: string;
    context: ContentContext;
    request: ContentRequest;
  }): Promise<unknown>;
}
export interface GeneratedContent {
  source: ContentSource;
  drafts: Array<{ draft: ContentDraft; issues: DraftIssue[] }>;
  /** Model drafts that failed schema or business rules, kept for the audit trail. */
  rejected: Array<{ reason: string }>;
  modelError: string | null;
}

export const CONTENT_SYSTEM_PROMPT =
  'You write short social posts for a small business. Use ONLY facts in the provided context. Never invent prices, times, phone numbers, offers, awards or claims. Respect the voice (tone, words to use, words to avoid). Reply with JSON: {"drafts":[{"headline","body","cta","hashtags"}]}.';

/**
 * business facts → context → (model) → schema → business rules → proposal.
 * Raw model output is data until both validations pass; a failure falls back to the deterministic writer.
 */
export async function generateContent(
  ctx: ContentContext,
  req: ContentRequest,
  model: ContentModel | null,
): Promise<GeneratedContent> {
  const fallback = (
    rejected: GeneratedContent["rejected"],
    modelError: string | null,
  ): GeneratedContent => ({
    source: "deterministic",
    drafts: draftContent(ctx, req).map((draft) => ({
      draft,
      issues: validateDraft(draft, ctx, req.channel),
    })),
    rejected,
    modelError,
  });
  // Facts must exist before anything is written, even by a model.
  draftContent(ctx, req);
  if (!model) return fallback([], null);
  let raw: unknown;
  try {
    raw = await model({
      system: CONTENT_SYSTEM_PROMPT,
      context: ctx,
      request: req,
    });
  } catch (e) {
    return fallback(
      [],
      e instanceof Error ? e.message.slice(0, 200) : "model failed",
    );
  }
  const parsed = ContentDraftsSchema.safeParse(raw);
  if (!parsed.success)
    return fallback(
      [{ reason: "Model output did not match the draft schema." }],
      null,
    );
  const rejected: GeneratedContent["rejected"] = [];
  const ok: GeneratedContent["drafts"] = [];
  for (const draft of parsed.data.drafts) {
    const issues = validateDraft(draft, ctx, req.channel);
    const block = issues.find((i) => i.severity === "block");
    if (block) rejected.push({ reason: block.message });
    else ok.push({ draft, issues });
  }
  return ok.length
    ? { source: "model", drafts: ok, rejected, modelError: null }
    : fallback(rejected, null);
}
