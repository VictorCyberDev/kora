export interface BriefNumbers {
  period: { start: string; end: string };
  enquiries: { current: number; previous: number };
  waiting: number;
  followUpsDue: number;
  posts: {
    published: number;
    failed: number;
    byChannel: Record<string, number>;
  };
  website: {
    uptimePercent: number | null;
    checks: number;
    incidents: number;
    recovered: number;
    openIncidents: number;
  };
  presence: { open: number; failing: number } | null;
  /** Results of links Kora created. Null when no tracked link exists yet. */
  tracked?: {
    links: number;
    visits: number;
    whatsapp: number;
    calls: number;
    enquiries: number;
  } | null;
}

export interface BriefItem {
  text: string;
  /** Present only for numbers Kora measured. */
  value?: string;
  source: string;
}
export interface BriefSection {
  id: "customers" | "posting" | "website" | "presence" | "tracked";
  title: string;
  items: BriefItem[];
}
export interface GrowthBrief {
  period: BriefNumbers["period"];
  headline: string;
  sections: BriefSection[];
  /** What Kora cannot tell the owner, and exactly why. */
  unavailable: Array<{ topic: string; reason: string }>;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Only evidenced numbers. Comparisons are made only when the previous period has data; nothing is extrapolated;
 * reach, engagement, visits and revenue are listed as unavailable until a real source exists.
 */
export function buildGrowthBrief(
  n: BriefNumbers,
  opts: { analyticsConnected: boolean } = { analyticsConnected: false },
): GrowthBrief {
  const sections: BriefSection[] = [];
  const e = n.enquiries;
  const trend =
    e.previous === 0 && e.current === 0
      ? "No enquiries in the last two weeks."
      : e.previous === 0
        ? `${plural(e.current, "enquiry", "enquiries")} this week; there were none the week before.`
        : e.current === e.previous
          ? `${plural(e.current, "enquiry", "enquiries")}, the same as the week before.`
          : `${plural(e.current, "enquiry", "enquiries")}, ${e.current > e.previous ? "up" : "down"} from ${e.previous} the week before.`;
  sections.push({
    id: "customers",
    title: "Customers",
    items: [
      { text: trend, value: String(e.current), source: "Customers" },
      {
        text:
          n.waiting === 0
            ? "Nobody is waiting for a reply."
            : `${plural(n.waiting, "customer")} still waiting for a reply.`,
        value: String(n.waiting),
        source: "Customers",
      },
      ...(n.followUpsDue
        ? [
            {
              text: `${plural(n.followUpsDue, "follow-up")} due.`,
              value: String(n.followUpsDue),
              source: "Customers",
            },
          ]
        : []),
    ],
  });
  const channels = Object.entries(n.posts.byChannel)
    .map(([c, k]) => `${k} on ${c}`)
    .join(", ");
  sections.push({
    id: "posting",
    title: "Posting",
    items: [
      {
        text:
          n.posts.published === 0
            ? "Nothing was posted from Kora this week."
            : `${plural(n.posts.published, "post")} went out${channels ? ` (${channels})` : ""}.`,
        value: String(n.posts.published),
        source: "Calendar",
      },
      ...(n.posts.failed
        ? [
            {
              text: `${plural(n.posts.failed, "post")} did not go out and need attention.`,
              value: String(n.posts.failed),
              source: "Calendar",
            },
          ]
        : []),
    ],
  });
  const w = n.website;
  sections.push({
    id: "website",
    title: "Website",
    items: [
      w.uptimePercent === null
        ? {
            text: "Kora has not checked your website often enough this week to report availability.",
            source: "Health",
          }
        : {
            text: `Your website was reachable ${w.uptimePercent}% of ${plural(w.checks, "check")}.`,
            value: `${w.uptimePercent}%`,
            source: "Health",
          },
      {
        text:
          w.incidents === 0
            ? "No incidents."
            : `${plural(w.incidents, "incident")}, ${w.recovered} recovered and verified${w.openIncidents ? `, ${w.openIncidents} still open` : ""}.`,
        value: String(w.incidents),
        source: "Health",
      },
    ],
  });
  if (n.presence)
    sections.push({
      id: "presence",
      title: "Presence",
      items: [
        {
          text:
            n.presence.open === 0
              ? "Everything Kora checks looks fine."
              : `${plural(n.presence.open, "thing")} could be better${n.presence.failing ? `, ${n.presence.failing} needing attention now` : ""}.`,
          value: String(n.presence.open),
          source: "Presence",
        },
      ],
    });
  if (n.tracked)
    sections.push({
      id: "tracked",
      title: "From your posts' links",
      items: [
        {
          text: `${plural(n.tracked.visits, "visit")} from links Kora created, ${plural(n.tracked.whatsapp, "WhatsApp tap")}, ${plural(n.tracked.calls, "call tap")} and ${plural(n.tracked.enquiries, "enquiry", "enquiries")}.`,
          value: String(n.tracked.visits),
          source: "Tracked links",
        },
      ],
    });
  const unavailable = [
    {
      topic: "Reach and engagement on social",
      reason: opts.analyticsConnected
        ? "No data came back for this period."
        : "Connect Instagram or Facebook; Kora reports results only from what the platforms return.",
    },
    {
      topic: "All website visitors",
      reason:
        "Kora only counts visits that arrive through links it created; it does not track visitors in general.",
    },
    {
      topic: "Sales and revenue",
      reason:
        "Kora does not see your sales, so it makes no claim that any post led to a sale.",
    },
  ];
  const headline =
    n.website.openIncidents > 0
      ? "Your website needs attention before anything else."
      : n.waiting > 0
        ? `${plural(n.waiting, "customer")} ${n.waiting === 1 ? "is" : "are"} waiting for you.`
        : e.current > 0
          ? `A steady week: ${plural(e.current, "enquiry", "enquiries")}, website healthy.`
          : "A quiet week. Nothing needs you right now.";
  return { period: n.period, headline, sections, unavailable };
}
