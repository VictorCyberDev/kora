import {
  decide,
  type MarketingAction,
  type PolicyDecision,
} from "./calendar.js";
import type { PresenceGraph } from "./graph.js";

export const OBJECTIVES = [
  "protect_sales",
  "increase_visibility",
  "keep_information_accurate",
  "build_foundation",
  "protect_reputation",
] as const;
export type Objective = (typeof OBJECTIVES)[number];
export type Confidence = "high" | "medium" | "low";

export interface Evidence {
  label: string;
  value: string;
  /** Where Kora read this, so the owner can check it. */
  source: string;
}

export type AgentAction =
  | {
      type: "create_draft";
      goal: "announce_offer" | "hours_notice" | "reminder" | "welcome";
      channel: "instagram" | "facebook" | "whatsapp" | "google_business";
      offerId?: string;
    }
  | { type: "create_brand_kit" }
  | {
      type: "open";
      to: "customers" | "channels" | "presence" | "health" | "calendar";
    };

export interface Recommendation {
  /** Stable per rule + subject: the same situation never produces two recommendations. */
  key: string;
  rule: string;
  observation: string;
  evidence: Evidence[];
  /** Why Kora thinks acting would help. Always phrased as a hypothesis, never a promise. */
  hypothesis: string;
  action: AgentAction;
  objective: Objective;
  confidence: Confidence;
  /** Whether Kora can carry out the action itself, or only point the owner at it. */
  koraCanExecute: boolean;
  approvalNeeded: boolean;
  policy: PolicyDecision;
  priority: number;
}

export interface AgentInputs {
  now: Date;
  graph: PresenceGraph;
  customers: {
    waiting: number;
    waitingOverDay: number;
    oldestWaitingAt: string | null;
  };
  calendar: {
    publishedLast14d: number;
    lastPublishedAt: string | null;
    scheduledNext7d: number;
    pending: number;
  };
  /** For every current offer: when a post mentioning it was last scheduled or published (null if never). */
  offerCoverage: Array<{
    id: string;
    title: string;
    lastPostAt: string | null;
    endsOn: string | null;
  }>;
  /** A channel Kora can post to or hand off for, with its connection state. */
  connectedPostingChannels: Array<"instagram" | "facebook" | "google_business">;
  openIncidents: number;
  hasBrandKit: boolean;
}

const DAY = 86_400_000;
const days = (a: string | null, now: Date) =>
  a ? Math.floor((now.getTime() - Date.parse(a)) / DAY) : null;

const rec = (
  r: Omit<Recommendation, "policy" | "koraCanExecute" | "approvalNeeded"> & {
    policyFor: MarketingAction;
    koraCanExecute: boolean;
  },
): Recommendation => {
  const { policyFor, koraCanExecute, ...rest } = r;
  const policy = decide(policyFor);
  return {
    ...rest,
    koraCanExecute,
    policy,
    approvalNeeded: policy.authority === "APPROVAL_REQUIRED",
  };
};

/**
 * Evidence-based recommendations. Every one cites facts Kora read, states a hypothesis (not a promise), names what
 * Kora can do itself, and carries the policy decision that governs it. No rule uses revenue, reach or any number
 * Kora has not measured. Confidence is high only when the evidence is direct and recent.
 */
export function recommend(i: AgentInputs): Recommendation[] {
  const out: Recommendation[] = [];
  const g = i.graph;
  const channel = i.connectedPostingChannels[0] ?? null;

  if (i.customers.waiting > 0)
    out.push(
      rec({
        key: "reply:waiting",
        rule: "customers_waiting",
        observation: `${i.customers.waiting} customer${i.customers.waiting === 1 ? " is" : "s are"} waiting for a reply${i.customers.waitingOverDay ? `, ${i.customers.waitingOverDay} for more than a day` : ""}.`,
        evidence: [
          {
            label: "Waiting for a reply",
            value: String(i.customers.waiting),
            source: "Customers",
          },
          ...(i.customers.oldestWaitingAt
            ? [
                {
                  label: "Oldest message",
                  value: new Date(i.customers.oldestWaitingAt).toDateString(),
                  source: "Customers",
                },
              ]
            : []),
        ],
        hypothesis:
          "Customers who do not hear back quickly are likely to buy elsewhere, so replying is probably worth more than posting.",
        action: { type: "open", to: "customers" },
        objective: "protect_sales",
        confidence: "high",
        koraCanExecute: false,
        policyFor: "reply_to_customer",
        priority: i.customers.waitingOverDay ? 100 : 90,
      }),
    );

  if (i.openIncidents > 0)
    out.push(
      rec({
        key: "hold:incident",
        rule: "site_incident_hold",
        observation: "Your website has an open incident.",
        evidence: [
          {
            label: "Open incidents",
            value: String(i.openIncidents),
            source: "Health",
          },
        ],
        hypothesis:
          "Sending customers to a site that is down wastes the post and the goodwill, so promotion is better held until Kora confirms recovery.",
        action: { type: "open", to: "health" },
        objective: "protect_sales",
        confidence: "high",
        koraCanExecute: false,
        policyFor: "refresh_report",
        priority: 95,
      }),
    );

  if (!i.hasBrandKit)
    out.push(
      rec({
        key: "foundation:brand_kit",
        rule: "no_brand_kit",
        observation: "You have no Brand Kit yet.",
        evidence: [
          { label: "Brand Kit", value: "none saved", source: "Presence" },
        ],
        hypothesis:
          "Posts and flyers will look inconsistent with your website until colors, fonts and tone are fixed.",
        action: { type: "create_brand_kit" },
        objective: "build_foundation",
        confidence: "high",
        koraCanExecute: true,
        policyFor: "create_brand_kit",
        priority: 80,
      }),
    );

  if (
    i.connectedPostingChannels.length === 0 &&
    g.distribution.website.published
  )
    out.push(
      rec({
        key: "foundation:channels",
        rule: "no_channel",
        observation: "No social or Google channel is connected.",
        evidence: [
          { label: "Connected channels", value: "0", source: "Channels" },
        ],
        hypothesis:
          "Kora can only schedule, post and measure on channels you connect; until then posts have to be published by hand.",
        action: { type: "open", to: "channels" },
        objective: "build_foundation",
        confidence: "medium",
        koraCanExecute: false,
        policyFor: "refresh_report",
        priority: 40,
      }),
    );

  for (const o of g.offer.expiredOffers)
    out.push(
      rec({
        key: `accuracy:expired:${o.id}`,
        rule: "expired_offer",
        observation: `"${o.title}" ended${o.endsOn ? ` on ${o.endsOn}` : ""} but is still in your profile.`,
        evidence: [
          {
            label: "Offer end date",
            value: o.endsOn ?? "unknown",
            source: "Presence",
          },
        ],
        hypothesis:
          "An ended offer still shown to customers causes disputes, so updating it avoids misleading anyone.",
        action: { type: "open", to: "presence" },
        objective: "keep_information_accurate",
        confidence: "high",
        koraCanExecute: false,
        policyFor: "update_site_facts",
        priority: 85,
      }),
    );

  if (channel)
    for (const o of i.offerCoverage) {
      const since = days(o.lastPostAt, i.now);
      if (since !== null && since < 7) continue;
      const left = o.endsOn
        ? Math.floor((Date.parse(o.endsOn) - i.now.getTime()) / DAY)
        : null;
      if (left !== null && left < 0) continue;
      out.push(
        rec({
          key: `visibility:offer:${o.id}`,
          rule: "offer_not_promoted",
          observation: `"${o.title}" is running but ${since === null ? "has not been posted about" : `was last posted about ${since} days ago`}.`,
          evidence: [
            {
              label: "Last post about this offer",
              value: o.lastPostAt
                ? new Date(o.lastPostAt).toDateString()
                : "never",
              source: "Calendar",
            },
            ...(left !== null
              ? [
                  {
                    label: "Days left",
                    value: String(left),
                    source: "Presence",
                  },
                ]
              : []),
          ],
          hypothesis:
            "Customers can only respond to an offer they have seen, so a post is likely to help more the sooner it goes out.",
          action: {
            type: "create_draft",
            goal: "announce_offer",
            channel,
            offerId: o.id,
          },
          objective: "increase_visibility",
          confidence: since === null ? "medium" : "low",
          koraCanExecute: true,
          policyFor: "create_draft",
          priority: left !== null && left <= 3 ? 75 : 60,
        }),
      );
    }

  if (g.availability.notice && i.calendar.publishedLast14d === 0 && channel)
    out.push(
      rec({
        key: "accuracy:notice",
        rule: "notice_not_announced",
        observation: "You set a notice for customers but have not posted it.",
        evidence: [
          { label: "Notice", value: g.availability.notice, source: "Presence" },
        ],
        hypothesis:
          "Customers who follow you on social will not see a closure or change that only exists on your website.",
        action: { type: "create_draft", goal: "hours_notice", channel },
        objective: "keep_information_accurate",
        confidence: "medium",
        koraCanExecute: true,
        policyFor: "create_draft",
        priority: 70,
      }),
    );

  const idle = days(i.calendar.lastPublishedAt, i.now);
  if (
    channel &&
    i.calendar.scheduledNext7d === 0 &&
    (idle === null || idle >= 14) &&
    !out.some((r) => r.rule === "offer_not_promoted")
  )
    out.push(
      rec({
        key: "visibility:quiet",
        rule: "channel_quiet",
        observation:
          idle === null
            ? "Nothing has been posted from Kora yet and nothing is scheduled."
            : `Nothing has gone out for ${idle} days and nothing is scheduled.`,
        evidence: [
          {
            label: "Posts in the last 14 days",
            value: String(i.calendar.publishedLast14d),
            source: "Calendar",
          },
          {
            label: "Scheduled for the next 7 days",
            value: "0",
            source: "Calendar",
          },
        ],
        hypothesis:
          "A steady presence keeps you in mind for customers who are not ready to buy yet; a short reminder post is a low-effort way to stay visible.",
        action: { type: "create_draft", goal: "reminder", channel },
        objective: "increase_visibility",
        confidence: "low",
        koraCanExecute: true,
        policyFor: "create_draft",
        priority: 30,
      }),
    );

  return out.sort((a, b) => b.priority - a.priority);
}
