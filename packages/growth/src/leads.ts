export const LEAD_STATUSES = [
  "NEW",
  "NEEDS_REPLY",
  "FOLLOW_UP",
  "WON",
  "LOST",
  "CLOSED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = [
  "WEBSITE_FORM",
  "WHATSAPP",
  "INSTAGRAM",
  "FACEBOOK",
  "MANUAL",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Leads in these statuses mean a customer is waiting on the business. */
export const WAITING: ReadonlySet<LeadStatus> = new Set(["NEW", "NEEDS_REPLY"]);
export const isWaiting = (s: LeadStatus) => WAITING.has(s);
export const isOpen = (s: LeadStatus) =>
  s === "NEW" || s === "NEEDS_REPLY" || s === "FOLLOW_UP";

export type LeadEvent =
  | { type: "inbound_message" }
  | { type: "owner_viewed" }
  | { type: "owner_replied" }
  | { type: "set"; status: LeadStatus };

/**
 * The only place lead status changes are decided.
 * - a customer writing always puts the ball back in the owner's court, even on a closed lead;
 * - opening a NEW lead moves it to NEEDS_REPLY (seen, not answered);
 * - replying moves an open lead to FOLLOW_UP, and never reopens a won/lost/closed one.
 */
export function nextStatus(cur: LeadStatus, ev: LeadEvent): LeadStatus {
  switch (ev.type) {
    case "inbound_message":
      return cur === "NEW" ? "NEW" : "NEEDS_REPLY";
    case "owner_viewed":
      return cur === "NEW" ? "NEEDS_REPLY" : cur;
    case "owner_replied":
      return isOpen(cur) ? "FOLLOW_UP" : cur;
    case "set":
      return ev.status;
  }
}

/** WhatsApp lets a business send free-form replies only within 24 hours of the customer's last message. */
export function whatsappWindow(lastInboundAt: Date | null, now: Date) {
  if (!lastInboundAt) return { open: false, closesAt: null as Date | null };
  const closes = new Date(lastInboundAt.getTime() + 24 * 3_600_000);
  return { open: closes.getTime() > now.getTime(), closesAt: closes };
}

/** Normalises a phone number to digits so the same customer is recognised across channels. */
export const normalizePhone = (p: string | undefined | null): string | null => {
  const d = (p ?? "").replace(/[^\d]/g, "");
  return d.length >= 6 ? d : null;
};

/** Builds a click-to-chat link for replies the owner sends from their own WhatsApp. */
export function waLink(
  phone: string | null | undefined,
  text?: string,
): string | null {
  const d = normalizePhone(phone);
  if (!d) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
