import { createHash } from "node:crypto";
import { z } from "zod";
import { CHANNEL_MATRIX, supports } from "./channels.js";
import type { ConnectionState, ChannelProvider } from "./graph.js";
import {
  ContentDraftSchema,
  validateDraft,
  type ContentContext,
} from "./content.js";

export const ITEM_STATES = [
  "IDEA",
  "DRAFT",
  "APPROVAL_NEEDED",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "PARTIALLY_PUBLISHED",
  "CANCELLED",
] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export const JOB_STATES = [
  "QUEUED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const PUBLISH_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp",
  "google_business",
  "tiktok",
] as const;

export const CaptionSchema = ContentDraftSchema.extend({
  headline: z.string().trim().max(80).default(""),
  body: z.string().trim().max(2200).default(""),
});
export type Caption = z.infer<typeof CaptionSchema>;

/**
 * What exactly the owner approved: the words, the image and the channels. The time is chosen when scheduling, which is
 * itself an approval-gated action, so it is not part of the hash.
 */
export interface ApprovableContent {
  caption: Caption;
  assetId: string | null;
  channels: string[];
  scheduledFor: string | null;
}
export function contentHash(c: ApprovableContent): string {
  const canon = JSON.stringify({
    c: [
      c.caption.headline,
      c.caption.body,
      c.caption.cta,
      [...c.caption.hashtags],
    ],
    a: c.assetId,
    ch: [...c.channels].sort(),
  });
  return createHash("sha256").update(canon).digest("hex");
}

export type ItemEvent =
  | { type: "write_content" }
  | { type: "submit" }
  | { type: "approve"; hashMatches: boolean }
  | { type: "schedule"; hashMatches: boolean }
  | { type: "edit" }
  | { type: "start_publish" }
  | { type: "jobs_settled"; published: number; failed: number }
  | { type: "cancel" }
  | { type: "retry" };

export class IllegalTransition extends Error {
  constructor(
    readonly from: ItemState,
    readonly event: string,
  ) {
    super(
      `Cannot ${event} while the post is ${from.toLowerCase().replace(/_/g, " ")}.`,
    );
  }
}

/** The only place a calendar item changes state. */
export function nextItemState(cur: ItemState, ev: ItemEvent): ItemState {
  const bad = () => {
    throw new IllegalTransition(cur, ev.type);
  };
  switch (ev.type) {
    case "write_content":
      return cur === "IDEA" ? "DRAFT" : cur === "DRAFT" ? "DRAFT" : bad();
    case "submit":
      return cur === "DRAFT" || cur === "IDEA" ? "APPROVAL_NEEDED" : bad();
    case "approve":
      if (cur !== "APPROVAL_NEEDED") return bad();
      return ev.hashMatches ? "APPROVED" : "APPROVAL_NEEDED";
    case "schedule":
      if (cur !== "APPROVED") return bad();
      return ev.hashMatches ? "SCHEDULED" : "APPROVAL_NEEDED";
    case "edit":
      // Changing approved content voids the approval; published history is never rewritten.
      if (
        cur === "PUBLISHING" ||
        cur === "PUBLISHED" ||
        cur === "PARTIALLY_PUBLISHED" ||
        cur === "CANCELLED"
      )
        return bad();
      return cur === "APPROVED" ||
        cur === "SCHEDULED" ||
        cur === "APPROVAL_NEEDED" ||
        cur === "FAILED"
        ? "APPROVAL_NEEDED"
        : "DRAFT";
    case "start_publish":
      return cur === "SCHEDULED" ? "PUBLISHING" : bad();
    case "jobs_settled":
      if (cur !== "PUBLISHING") return bad();
      return ev.failed === 0
        ? "PUBLISHED"
        : ev.published === 0
          ? "FAILED"
          : "PARTIALLY_PUBLISHED";
    case "cancel":
      return cur === "PUBLISHING" ||
        cur === "PUBLISHED" ||
        cur === "PARTIALLY_PUBLISHED" ||
        cur === "CANCELLED"
        ? bad()
        : "CANCELLED";
    case "retry":
      return cur === "FAILED" || cur === "PARTIALLY_PUBLISHED"
        ? "SCHEDULED"
        : bad();
  }
}

// ---- authority ------------------------------------------------------------
export type Authority = "AUTO_SAFE" | "APPROVAL_REQUIRED" | "DENY";
export const ACTIONS = [
  "create_draft",
  "refresh_report",
  "create_brand_kit",
  "schedule_post",
  "publish_post",
  "update_site_facts",
  "reply_to_customer",
  "reply_to_review",
  "spend_ad_budget",
  "send_bulk_message",
  "delete_content",
] as const;
export type MarketingAction = (typeof ACTIONS)[number];
export interface PolicyDecision {
  action: MarketingAction;
  authority: Authority;
  reason: string;
}

const POLICY: Record<
  MarketingAction,
  { authority: Authority; reason: string }
> = {
  create_draft: {
    authority: "AUTO_SAFE",
    reason: "A draft changes nothing public.",
  },
  refresh_report: {
    authority: "AUTO_SAFE",
    reason: "Reading and summarising only.",
  },
  create_brand_kit: {
    authority: "AUTO_SAFE",
    reason: "Derived from your website; versioned and reversible.",
  },
  schedule_post: {
    authority: "APPROVAL_REQUIRED",
    reason: "Scheduling puts words in your name on a public channel.",
  },
  publish_post: {
    authority: "APPROVAL_REQUIRED",
    reason: "Publishing is public and cannot be fully undone.",
  },
  update_site_facts: {
    authority: "APPROVAL_REQUIRED",
    reason: "Changes what customers see on your website.",
  },
  reply_to_customer: {
    authority: "DENY",
    reason: "Kora does not message customers on your behalf.",
  },
  reply_to_review: {
    authority: "DENY",
    reason: "Review replies are sensitive and are not automated.",
  },
  spend_ad_budget: {
    authority: "DENY",
    reason: "Kora never spends money automatically.",
  },
  send_bulk_message: {
    authority: "DENY",
    reason: "Bulk or unsolicited messaging is not offered.",
  },
  delete_content: {
    authority: "APPROVAL_REQUIRED",
    reason: "Deleting published content is permanent.",
  },
};
export const decide = (action: MarketingAction): PolicyDecision => ({
  action,
  ...POLICY[action],
});

// ---- publish validation -----------------------------------------------------
export interface PublishCheckInput {
  now: Date;
  channel: ChannelProvider;
  connection: { state: ConnectionState; mode: "LIVE" | "SANDBOX" } | null;
  /** True when this deployment can actually publish to the provider (an adapter with a publish method). */
  adapterCanPublish: boolean;
  caption: Caption;
  asset: { kind: "IMAGE" | "VIDEO"; exists: true } | null;
  ctx: ContentContext;
  approval: { hashMatches: boolean; approved: boolean };
  siteHasOpenIncident: boolean;
}
export interface PublishIssue {
  code:
    | "capability"
    | "not_connected"
    | "connection_unhealthy"
    | "not_approved"
    | "content"
    | "media_required"
    | "media_type"
    | "not_available"
    | "site_down";
  severity: "block" | "warn";
  message: string;
}

/** validate content, capability, account, policy, media, authorization — in that order, all reported. */
export function checkPublishable(i: PublishCheckInput): PublishIssue[] {
  const out: PublishIssue[] = [];
  const spec = CHANNEL_MATRIX[i.channel];
  if (!supports(i.channel, "publish")) {
    out.push({
      code: "capability",
      severity: "block",
      message:
        `${spec.label} does not support posting from Kora. ${spec.notes[0] ?? ""}`.trim(),
    });
    return out;
  }
  if (!i.approval.approved)
    out.push({
      code: "not_approved",
      severity: "block",
      message: "This post has not been approved.",
    });
  else if (!i.approval.hashMatches)
    out.push({
      code: "not_approved",
      severity: "block",
      message: "The post changed after you approved it. Approve it again.",
    });
  if (!i.connection || i.connection.state === "DISCONNECTED")
    out.push({
      code: "not_connected",
      severity: "block",
      message: `${spec.label} is not connected.`,
    });
  else if (i.connection.state !== "CONNECTED")
    out.push({
      code: "connection_unhealthy",
      severity: "block",
      message: `${spec.label} needs attention (${i.connection.state.toLowerCase().replace(/_/g, " ")}).`,
    });
  if (!i.adapterCanPublish)
    out.push({
      code: "not_available",
      severity: "block",
      message: `Automatic posting to ${spec.label} is not available on this Kora yet. Kora can prepare the post for you to publish yourself.`,
    });
  if (i.channel === "instagram" || i.channel === "tiktok") {
    if (!i.asset)
      out.push({
        code: "media_required",
        severity: "block",
        message: `${spec.label} posts need an image or video.`,
      });
    else if (i.channel === "tiktok" && i.asset.kind !== "VIDEO")
      out.push({
        code: "media_type",
        severity: "block",
        message: "TikTok needs a video.",
      });
  }
  const draftIssues = validateDraft(
    {
      headline: i.caption.headline || "Post",
      body: i.caption.body || "-",
      cta: i.caption.cta,
      hashtags: i.caption.hashtags,
    },
    i.ctx,
    i.channel as "instagram",
  );
  for (const d of draftIssues)
    out.push({ code: "content", severity: d.severity, message: d.message });
  if (i.siteHasOpenIncident)
    out.push({
      code: "site_down",
      severity: "warn",
      message:
        "Your website has an open incident. Customers who tap through may not reach you until it recovers.",
    });
  return out;
}
export const isBlocked = (issues: PublishIssue[]) =>
  issues.some((x) => x.severity === "block");

// ---- retry policy -------------------------------------------------------------
export type FailureClass = "RETRYABLE" | "PERMANENT" | "UNCERTAIN";
export const MAX_PUBLISH_ATTEMPTS = 3;
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];

/** Only failures where the provider certainly did not publish are retried. */
export function classifyFailure(f: {
  httpStatus?: number;
  network?: boolean;
  code?: string;
}): FailureClass {
  if (f.network) return "UNCERTAIN"; // the request may have reached the provider
  const s = f.httpStatus ?? 0;
  if (s === 429 || s === 503) return "RETRYABLE";
  if (s === 401 || s === 403) return "PERMANENT";
  if (s >= 400 && s < 500) return "PERMANENT";
  if (s >= 500) return "UNCERTAIN";
  return "UNCERTAIN";
}
export const nextAttemptAt = (attempt: number, now: Date) =>
  new Date(
    now.getTime() +
      (BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length) - 1] ??
        BACKOFF_MS.at(-1)!),
  );
