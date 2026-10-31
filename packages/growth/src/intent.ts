/**
 * Voice-first foundation: turns what an owner says or types into a structured intent. It is deterministic and only
 * *routes*: it never executes anything, never publishes, and always asks the owner to confirm. Text is always supported;
 * speech is just another way to produce the same string.
 */
export const INTENTS = [
  "customers_waiting",
  "write_post",
  "announce_offer",
  "closing_notice",
  "website_status",
  "show_calendar",
  "show_results",
  "show_reviews",
  "unknown",
] as const;
export type IntentName = (typeof INTENTS)[number];

export interface Intent {
  intent: IntentName;
  /** Where in Kora this leads. The UI navigates here after confirmation. */
  route:
    | "customers"
    | "create"
    | "calendar"
    | "presence"
    | "health"
    | "results"
    | "reviews"
    | "today";
  /** Plain-language restatement shown for confirmation. */
  summary: string;
  slots: {
    channel?: "instagram" | "facebook" | "whatsapp" | "google_business";
    goal?:
      | "announce_offer"
      | "hours_notice"
      | "welcome"
      | "reminder"
      | "promote_service";
  };
  /** Always true: nothing happens until the owner agrees. */
  requiresConfirmation: true;
  confidence: "high" | "medium" | "low";
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const has = (t: string, ...w: Array<string | RegExp>) =>
  w.some((x) => (typeof x === "string" ? t.includes(x) : x.test(t)));

const CHANNELS: Array<[RegExp, NonNullable<Intent["slots"]["channel"]>]> = [
  [/\b(instagram|insta|ig)\b/, "instagram"],
  [/\b(facebook|fb)\b/, "facebook"],
  [/\bwhats ?app\b/, "whatsapp"],
  [/\bgoogle\b/, "google_business"],
];

/** English and common Nigerian Pidgin phrasings. Unknown input is reported as unknown, never guessed. */
export function interpretIntent(raw: string): Intent {
  const t = norm(raw);
  const channel = CHANNELS.find(([re]) => re.test(t))?.[1];
  const base = { requiresConfirmation: true as const };
  const on = channel ? ` on ${channel.replace("_", " ")}` : "";
  const out = (
    intent: IntentName,
    route: Intent["route"],
    summary: string,
    slots: Intent["slots"],
    confidence: Intent["confidence"],
  ): Intent => ({ ...base, intent, route, summary, slots, confidence });
  if (!t)
    return out(
      "unknown",
      "today",
      "Kora did not catch that. You can type or say what you need.",
      {},
      "low",
    );

  // Most specific first: a sentence that says "tell customers we are closed" is a notice, not a customer list.
  if (
    has(t, /\b(closed|closing|close|shut|holiday|not open|travel|away)\b/) &&
    has(
      t,
      "tomorrow",
      "today",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "week",
      "holiday",
      "sallah",
      "christmas",
      "easter",
      "eid",
      "notice",
      "tell customers",
      "tell people",
    )
  )
    return out(
      "closing_notice",
      "create",
      `Write a notice for customers${on}. You will check it before anything is posted.`,
      { goal: "hours_notice", ...(channel ? { channel } : {}) },
      "medium",
    );
  if (
    has(t, "offer", "promo", "discount", "sale", "special", "deal") &&
    has(
      t,
      "post",
      "tell",
      "announce",
      "promote",
      "share",
      "write",
      "advert",
      "market",
    )
  )
    return out(
      "announce_offer",
      "create",
      `Write a post about one of your offers${on}. You choose the offer and approve it.`,
      { goal: "announce_offer", ...(channel ? { channel } : {}) },
      "medium",
    );
  if (
    has(t, "how many", "how did", "results", "visits", "performance", "clicks")
  )
    return out(
      "show_results",
      "results",
      "Show what your posts and links brought.",
      {},
      "medium",
    );
  if (has(t, /\b(post|write|caption|advert|market|promote)\b/))
    return out(
      "write_post",
      "create",
      `Write a post${on}. Nothing goes out until you approve it.`,
      { goal: "welcome", ...(channel ? { channel } : {}) },
      "medium",
    );
  if (
    has(
      t,
      /who (is|are|dey) waiting/,
      "waiting for a reply",
      "need a reply",
      "need reply",
      "any message",
      "new message",
      "who message",
      "who don message",
      "customers",
      "enquir",
      "reply",
    )
  )
    return out(
      "customers_waiting",
      "customers",
      "Show the customers who are waiting for a reply.",
      {},
      "high",
    );
  if (has(t, "review", "stars", "rating"))
    return out("show_reviews", "reviews", "Show your reviews.", {}, "medium");
  if (has(t, "calendar", "scheduled", "going out", "schedule"))
    return out(
      "show_calendar",
      "calendar",
      "Show what is scheduled to go out.",
      {},
      "medium",
    );
  if (
    has(t, "website", "site", "online", "down", "working", "dey work", "health")
  )
    return out(
      "website_status",
      "health",
      "Check whether your website is up and healthy.",
      {},
      "medium",
    );
  return out(
    "unknown",
    "today",
    "Kora is not sure what you mean. Try: “who is waiting for a reply?”, “write a post for Instagram”, or “is my website okay?”.",
    {},
    "low",
  );
}
