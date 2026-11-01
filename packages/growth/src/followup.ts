import type { LeadStatus } from "./leads.js";

/** M19: the customer loop. When a customer has gone quiet or a job is done, what should happen next and what needs approval. */
export interface FollowUpInput {
  status: LeadStatus;
  lastInboundHoursAgo: number | null;
  lastOutboundHoursAgo: number | null;
  hasConsentToMessage: boolean;
  completedDaysAgo: number | null;
}
export interface FollowUp {
  kind: "reply_now" | "nudge" | "ask_review" | "none";
  reason: string;
  /** Every outbound customer message needs the owner's approval. */
  requiresApproval: boolean;
  blockedBecause: string | null;
}

export function followUpFor(i: FollowUpInput): FollowUp {
  const none = (reason: string): FollowUp => ({
    kind: "none",
    reason,
    requiresApproval: false,
    blockedBecause: null,
  });
  if (i.status === "NEW" || i.status === "NEEDS_REPLY")
    return {
      kind: "reply_now",
      reason:
        i.lastInboundHoursAgo !== null
          ? `Waiting ${Math.round(i.lastInboundHoursAgo)} hours`
          : "Waiting for a reply",
      requiresApproval: true,
      blockedBecause: null,
    };
  if (
    i.status === "FOLLOW_UP" &&
    i.lastOutboundHoursAgo !== null &&
    i.lastOutboundHoursAgo >= 48
  ) {
    return i.hasConsentToMessage
      ? {
          kind: "nudge",
          reason: "No answer for two days after your reply",
          requiresApproval: true,
          blockedBecause: null,
        }
      : {
          kind: "nudge",
          reason: "No answer for two days",
          requiresApproval: true,
          blockedBecause: "This customer has not agreed to be messaged again.",
        };
  }
  if (
    i.status === "WON" &&
    i.completedDaysAgo !== null &&
    i.completedDaysAgo >= 2 &&
    i.completedDaysAgo <= 14
  )
    return i.hasConsentToMessage
      ? {
          kind: "ask_review",
          reason: "Job finished recently; a good moment to ask for a review",
          requiresApproval: true,
          blockedBecause: null,
        }
      : {
          kind: "ask_review",
          reason: "Job finished recently",
          requiresApproval: true,
          blockedBecause: "This customer has not agreed to be messaged again.",
        };
  return none("Nothing to do");
}
