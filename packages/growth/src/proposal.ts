/**
 * "I need more birthday cake orders next week" -> a coordinated, reviewable campaign PROPOSAL.
 *
 * Deterministic and conservative: it understands a goal, a thing to promote, and a time window; it matches the thing
 * against what the owner has actually told Kora they offer; it lays out a small set of coordinated pieces. It never
 * posts, schedules, spends or creates anything. Every piece is a draft the owner must approve one by one, and the
 * wording only ever contains the owner's own words (the subject, the business name, a contact route that exists).
 */
export const PROPOSAL_OBJECTIVES = [
  "order",
  "booking",
  "visit",
  "offer",
  "retention",
  "launch",
  "awareness",
] as const;
export type ProposalObjective = (typeof PROPOSAL_OBJECTIVES)[number];

export interface ProposalContext {
  businessName: string;
  /** Things the owner has said they offer (services, products, active offers), in their words. */
  offerings: string[];
  whatsapp: boolean;
  phone: boolean;
  /** Local "today". Window words are resolved against it. */
  today: Date;
}

export interface ProposedPiece {
  /** An artifact format id accepted by the artifacts API. */
  format: "story" | "whatsapp-status" | "social-square" | "flyer-a5";
  objective: ProposalObjective;
  /** ISO date the owner could use it; a suggestion only, nothing is scheduled. */
  suggestedOn: string;
  purpose: string;
  /** Body for POST /api/sites/:id/artifacts once the owner agrees. Wording is the owner's own words. */
  draft: {
    format: string;
    objective: ProposalObjective;
    headline: string;
    eyebrow: string;
    subline: string;
    cta: string;
    ownerWritten: false;
  };
}

export interface CampaignProposal {
  status: "PROPOSED";
  /** Always false; there is no code path in Kora that turns a proposal into a post. */
  autoPublish: false;
  spends: false;
  understood: {
    goal: ProposalObjective;
    subject: string;
    subjectInProfile: boolean;
    window: { from: string; to: string; label: string };
  };
  pieces: ProposedPiece[];
  /** What Kora needs from the owner before it can do this properly. */
  needsFromOwner: string[];
  /** One honest sentence describing what happens next. */
  next: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const DOW = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** Crude singular so "cakes" matches "cake"; good enough for matching, never used in wording. */
const stem = (w: string) =>
  w.endsWith("ies") && w.length > 4
    ? `${w.slice(0, -3)}y`
    : w.endsWith("s") && !w.endsWith("ss") && w.length > 3
      ? w.slice(0, -1)
      : w;
const words = (s: string) => norm(s).split(" ").filter(Boolean).map(stem);

export function parseWindow(
  text: string,
  today: Date,
): { from: string; to: string; label: string } {
  const t = norm(text);
  const dow = today.getUTCDay();
  const daysToMonday = (8 - dow) % 7 || 7;
  if (/\bnext week\b/.test(t)) {
    const mon = addDays(today, daysToMonday);
    return { from: iso(mon), to: iso(addDays(mon, 6)), label: "next week" };
  }
  if (/\bthis week\b/.test(t))
    return {
      from: iso(today),
      to: iso(addDays(today, (7 - dow) % 7)),
      label: "this week",
    };
  if (/\b(this )?weekend\b/.test(t)) {
    const sat = addDays(today, (6 - dow + 7) % 7);
    return { from: iso(sat), to: iso(addDays(sat, 1)), label: "this weekend" };
  }
  if (/\btomorrow\b/.test(t))
    return {
      from: iso(addDays(today, 1)),
      to: iso(addDays(today, 1)),
      label: "tomorrow",
    };
  if (/\btoday\b/.test(t))
    return { from: iso(today), to: iso(today), label: "today" };
  const inN = /\bin (\d{1,2}) days?\b/.exec(t);
  if (inN) {
    const d = addDays(today, Number(inN[1]));
    return { from: iso(today), to: iso(d), label: `in ${inN[1]} days` };
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b(by|on|for|before) ${DOW[i]}\\b`).test(t)) {
      const ahead = (i - dow + 7) % 7 || 7;
      return {
        from: iso(addDays(today, 1)),
        to: iso(addDays(today, ahead)),
        label: `by ${DOW[i]}`,
      };
    }
  }
  return {
    from: iso(addDays(today, 1)),
    to: iso(addDays(today, 7)),
    label: "the next 7 days",
  };
}

function goalOf(t: string): ProposalObjective {
  if (/\b(orders?|ordering|pre ?orders?)\b/.test(t)) return "order";
  if (/\b(bookings?|appointments?|slots?|reservations?|fill)\b/.test(t))
    return "booking";
  if (/\b(visits?|walk ?ins?|foot ?traffic|come in|come by)\b/.test(t))
    return "visit";
  if (/\b(sell|clear|stock|discount|sale|offer)\b/.test(t)) return "offer";
  if (/\b(come back|returning|regulars?|repeat|bring back)\b/.test(t))
    return "retention";
  if (/\b(launch|new|introduc|announce)\w*\b/.test(t)) return "launch";
  return "awareness";
}

/** The phrase the owner wants more of: "more X orders/bookings/customers/sales", or "promote/sell X". */
function subjectPhrase(raw: string): string | null {
  const t = norm(raw);
  const m =
    /\bmore (.{2,50}?) (orders?|bookings?|customers?|clients?|sales|enquiries|visits?)\b/.exec(
      t,
    ) ??
    /\b(?:promote|sell|push|advertise|showcase|market) (?:my |our |some |the )?(.{2,50}?)(?: (?:next|this|on|by|for|in|today|tomorrow)\b|$)/.exec(
      t,
    );
  const p = m?.[1]?.replace(/\b(my|our|the|some)\b/g, "").trim();
  return p && p.length >= 2 ? p : null;
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function proposeCampaign(
  request: string,
  ctx: ProposalContext,
): CampaignProposal | { error: "not_understood"; message: string } {
  const text = request.trim().slice(0, 400);
  const t = norm(text);
  const phrase = subjectPhrase(text);
  const asked = phrase ? words(phrase) : [];
  // match the phrase against what the owner actually offers
  let subject = "";
  let inProfile = false;
  if (asked.length) {
    let best = { score: 0, name: "" };
    for (const o of ctx.offerings) {
      const ow = words(o);
      const score = asked.filter((w) => ow.includes(w)).length;
      if (score > best.score) best = { score, name: o };
    }
    if (best.score > 0 && best.score === asked.length) {
      subject = best.name;
      inProfile = true;
    } else subject = phrase!;
  }
  if (!subject)
    return {
      error: "not_understood",
      message:
        'Tell Kora what you want more of, for example "I need more birthday cake orders next week".',
    };
  const goal = goalOf(t);
  const window = parseWindow(text, ctx.today);
  const contact = ctx.whatsapp
    ? "Message us on WhatsApp to order."
    : ctx.phone
      ? "Call us to order."
      : "";
  const cta = ctx.whatsapp
    ? goal === "booking"
      ? "Book on WhatsApp"
      : "Order on WhatsApp"
    : ctx.phone
      ? "Call us"
      : "";
  const subj = title(subject);
  const mid = iso(
    addDays(
      new Date(`${window.from}T00:00:00Z`),
      Math.floor(
        (new Date(`${window.to}T00:00:00Z`).getTime() -
          new Date(`${window.from}T00:00:00Z`).getTime()) /
          86_400_000 /
          2,
      ),
    ),
  );
  const draft = (format: ProposedPiece["format"]) => ({
    format,
    objective: goal,
    headline: subj.slice(0, 80),
    eyebrow: ctx.businessName.slice(0, 40),
    subline: contact.slice(0, 160),
    cta: cta.slice(0, 30),
    ownerWritten: false as const,
  });
  const pieces: ProposedPiece[] = [
    {
      format: "story",
      objective: goal,
      suggestedOn: window.from,
      purpose: `Opens ${window.label}: tells people what you want to sell and how to reach you.`,
      draft: draft("story"),
    },
    {
      format: "whatsapp-status",
      objective: goal,
      suggestedOn: window.from,
      purpose: "Reaches the people who already have your number.",
      draft: draft("whatsapp-status"),
    },
    {
      format: "social-square",
      objective: goal,
      suggestedOn: mid,
      purpose:
        "A feed post in the middle of the window for people who missed the first one.",
      draft: draft("social-square"),
    },
    {
      format: "flyer-a5",
      objective: goal,
      suggestedOn: window.from,
      purpose: "Something you can print or send as a picture to customers.",
      draft: draft("flyer-a5"),
    },
  ];
  const needs: string[] = [];
  if (!inProfile)
    needs.push(
      `"${subject}" is not in the list of things you offer yet. Confirm you offer it, or add it to your business details.`,
    );
  if (!ctx.whatsapp && !ctx.phone)
    needs.push(
      "Add a WhatsApp number or phone so the pieces can say how to order.",
    );
  needs.push(
    "A photo of your own work. Without one the pieces are typographic, which is honest but plainer.",
  );
  needs.push(
    "Any price, deadline or limit you want mentioned. Kora does not make these up.",
  );
  return {
    status: "PROPOSED",
    autoPublish: false,
    spends: false,
    understood: {
      goal,
      subject,
      subjectInProfile: inProfile,
      window,
    },
    pieces,
    needsFromOwner: needs,
    next: "Nothing has been made, posted or spent. Review the pieces and choose which drafts Kora should create; each one still needs your approval before it goes anywhere.",
  };
}
