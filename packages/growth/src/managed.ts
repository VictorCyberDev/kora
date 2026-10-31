/** M25: managed service. A human or Kora works a request; the owner approves anything customer-visible. */
export const REQUEST_STATES = [
  "OPEN",
  "IN_PROGRESS",
  "NEEDS_OWNER",
  "DELIVERED",
  "ACCEPTED",
  "CANCELLED",
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];
export type RequestEvent =
  | "start"
  | "ask_owner"
  | "owner_replied"
  | "deliver"
  | "accept"
  | "reject"
  | "cancel";

const T: Record<RequestState, Partial<Record<RequestEvent, RequestState>>> = {
  OPEN: { start: "IN_PROGRESS", cancel: "CANCELLED" },
  IN_PROGRESS: {
    ask_owner: "NEEDS_OWNER",
    deliver: "DELIVERED",
    cancel: "CANCELLED",
  },
  NEEDS_OWNER: { owner_replied: "IN_PROGRESS", cancel: "CANCELLED" },
  DELIVERED: { accept: "ACCEPTED", reject: "IN_PROGRESS" },
  ACCEPTED: {},
  CANCELLED: {},
};

export function nextRequestState(
  cur: RequestState,
  ev: RequestEvent,
): RequestState {
  const n = T[cur][ev];
  if (!n) throw new Error(`Cannot ${ev} a request that is ${cur}`);
  return n;
}

/** Hours until a request breaches its service target. Negative means already late. */
export function slaRemainingHours(
  createdAt: Date,
  now: Date,
  state: RequestState,
  targetHours = 48,
): number | null {
  if (state === "ACCEPTED" || state === "CANCELLED" || state === "NEEDS_OWNER")
    return null;
  return targetHours - (now.getTime() - createdAt.getTime()) / 3_600_000;
}
