import { isExpired, type PresenceInputs } from "./graph.js";
import type { BusinessFacts } from "./facts.js";

export const CHECK_STATUSES = ["OK", "WARN", "FAIL", "UNKNOWN"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export const AREAS = [
  "identity",
  "contact",
  "availability",
  "offer",
  "brand",
  "website",
  "distribution",
  "proof",
  "operations",
  "demand",
] as const;
export type Area = (typeof AREAS)[number];

export interface PresenceCheck {
  id: string;
  area: Area;
  status: CheckStatus;
  /** What Kora observed, as a plain statement. */
  observed: string;
  /** Why it matters to the owner. */
  why: string;
  /** The recommended fix. Absent when the check passes. */
  fix: string | null;
  /** Whether Kora itself can make the fix. */
  koraCanFix: "yes" | "with_approval" | "no";
  /** What the owner must authorize or supply, if anything. */
  authorization: string | null;
}

const ok = (id: string, area: Area, observed: string): PresenceCheck => ({
  id,
  area,
  status: "OK",
  observed,
  why: "",
  fix: null,
  koraCanFix: "no",
  authorization: null,
});

const HOUR = 3_600_000;
const norm = (s: string | undefined) => (s ?? "").replace(/[^\d+]/g, "");
const normHours = (f: BusinessFacts) =>
  f.availability.hours
    .map(
      (h) => `${h.days.trim().toLowerCase()}|${h.hours.trim().toLowerCase()}`,
    )
    .sort()
    .join(";");

export function evaluatePresenceHealth(i: PresenceInputs): PresenceCheck[] {
  const f = i.facts;
  const out: PresenceCheck[] = [];
  const push = (c: PresenceCheck) => out.push(c);

  // identity
  push(
    f.identity.description.length >= 40
      ? ok("identity.description", "identity", "A business description is set.")
      : {
          id: "identity.description",
          area: "identity",
          status: "WARN",
          observed: f.identity.description
            ? "The business description is very short."
            : "There is no business description.",
          why: "Search results, your website and every post Kora writes start from this description.",
          fix: "Add one or two sentences about what you do and who you serve.",
          koraCanFix: "no",
          authorization: "Owner writes or confirms the description.",
        },
  );

  // contact
  const reachable = Boolean(
    f.contact.phone || f.contact.whatsapp || f.contact.email,
  );
  push(
    reachable
      ? ok(
          "contact.reachable",
          "contact",
          "Customers have at least one way to reach you.",
        )
      : {
          id: "contact.reachable",
          area: "contact",
          status: "FAIL",
          observed: "No phone, WhatsApp or email is on file.",
          why: "Customers who want to buy have no way to contact you.",
          fix: "Add a phone number or WhatsApp number.",
          koraCanFix: "no",
          authorization: "Owner supplies the number.",
        },
  );
  push(
    f.contact.whatsapp
      ? ok("contact.whatsapp", "contact", "A WhatsApp number is set.")
      : {
          id: "contact.whatsapp",
          area: "contact",
          status: "WARN",
          observed: "No WhatsApp number is set.",
          why: "Many customers prefer to message on WhatsApp before they call.",
          fix: "Add your WhatsApp number so the website and posts can offer a chat button.",
          koraCanFix: "no",
          authorization: "Owner supplies the number.",
        },
  );
  push(
    f.contact.address || f.contact.city
      ? ok("contact.location", "contact", "A location is set.")
      : {
          id: "contact.location",
          area: "contact",
          status: "WARN",
          observed: "No address or city is set.",
          why: "Customers nearby cannot tell where you are.",
          fix: "Add your address or at least your city.",
          koraCanFix: "no",
          authorization: "Owner supplies the address.",
        },
  );

  // availability
  push(
    f.availability.hours.length
      ? ok("availability.hours", "availability", "Opening hours are set.")
      : {
          id: "availability.hours",
          area: "availability",
          status: "WARN",
          observed: "No opening hours are set.",
          why: "Customers do not know when you are open, and Kora cannot warn them about closures.",
          fix: "Add your opening hours.",
          koraCanFix: "no",
          authorization: "Owner supplies the hours.",
        },
  );

  // offer
  push(
    f.offer.services.length
      ? ok(
          "offer.services",
          "offer",
          `${f.offer.services.length} service(s) listed.`,
        )
      : {
          id: "offer.services",
          area: "offer",
          status: "WARN",
          observed: "No services or products are listed.",
          why: "Without a list of what you sell, Kora cannot write accurate posts or campaigns.",
          fix: "List the main things you sell.",
          koraCanFix: "no",
          authorization: "Owner supplies the list.",
        },
  );
  const expired = f.offer.offers.filter((o) => isExpired(o, i.now));
  if (f.offer.offers.length)
    push(
      expired.length
        ? {
            id: "offer.stale",
            area: "offer",
            status: "WARN",
            observed: `${expired.length} offer(s) ended already: ${expired.map((o) => o.title).join(", ")}.`,
            why: "An ended offer still shown to customers causes disputes and lost trust.",
            fix: "Remove the ended offer or set a new end date.",
            koraCanFix: "with_approval",
            authorization:
              "Owner approves removing the offer from the website and scheduled posts.",
          }
        : ok("offer.stale", "offer", "No offers have ended."),
    );

  // one business, one truth: an ended offer must not linger on the website or in queued posts
  if (i.staleness) {
    const m = i.staleness.websiteMentions;
    push(
      m.length
        ? {
            id: "offer.on_website",
            area: "offer",
            status: "WARN",
            observed: `Your website still mentions ${m.map((x) => `"${x}"`).join(", ")}, which has ended.`,
            why: "Customers may ask for an offer you no longer honour.",
            fix: "Edit the website text and publish the new version.",
            koraCanFix: "with_approval",
            authorization: "Owner approves the change and publishing.",
          }
        : ok(
            "offer.on_website",
            "offer",
            "No ended offer appears on your website.",
          ),
    );
    push(
      i.staleness.scheduledPosts > 0
        ? {
            id: "offer.scheduled_stale",
            area: "offer",
            status: "FAIL",
            observed: `${i.staleness.scheduledPosts} post${i.staleness.scheduledPosts === 1 ? " is" : "s are"} waiting to go out about an offer that has ended.`,
            why: "Posting it would advertise something you no longer offer.",
            fix: "Cancel or rewrite those posts in the Calendar.",
            koraCanFix: "no",
            authorization: "Owner cancels or edits and re-approves each post.",
          }
        : ok(
            "offer.scheduled_stale",
            "offer",
            "No queued post is about an ended offer.",
          ),
    );
  }

  // brand
  push(
    i.brand
      ? ok("brand.kit", "brand", `Brand Kit v${i.brand.version} is in use.`)
      : {
          id: "brand.kit",
          area: "brand",
          status: "WARN",
          observed: "No Brand Kit has been saved.",
          why: "Posts and flyers will not look like your website until colors, fonts and tone are fixed.",
          fix: "Create a Brand Kit from your website's design.",
          koraCanFix: "yes",
          authorization: null,
        },
  );

  // website
  if (!i.site.exists || !i.site.published) {
    push({
      id: "website.published",
      area: "website",
      status: "FAIL",
      observed: i.site.exists
        ? "The website has not been published."
        : "No website exists yet.",
      why: "Customers who find you online have nowhere to land.",
      fix: "Publish the website.",
      koraCanFix: "with_approval",
      authorization: "Owner approves publishing.",
    });
  } else {
    push(
      ok(
        "website.published",
        "website",
        `Published at ${i.site.url ?? "your site"}.`,
      ),
    );
    const live = i.site.liveFacts;
    if (live) {
      const diffs: string[] = [];
      if (f.identity.name !== live.identity.name) diffs.push("business name");
      if (norm(f.contact.phone) !== norm(live.contact.phone))
        diffs.push("phone number");
      if (norm(f.contact.whatsapp) !== norm(live.contact.whatsapp))
        diffs.push("WhatsApp number");
      if ((f.contact.email ?? "") !== (live.contact.email ?? ""))
        diffs.push("email");
      if (normHours(f) !== normHours(live)) diffs.push("opening hours");
      push(
        diffs.length
          ? {
              id: "website.drift",
              area: "website",
              status: "WARN",
              observed: `Your business profile and the live website disagree on: ${diffs.join(", ")}.`,
              why: "Customers see different details on your website than on your profile and posts.",
              fix: "Apply the profile to the website as a new draft version, then review and publish it.",
              koraCanFix: "with_approval",
              authorization: "Owner reviews the draft and approves publishing.",
            }
          : ok(
              "website.drift",
              "website",
              "The website matches your business profile.",
            ),
      );
    }
  }

  // domain
  if (i.site.published)
    push(
      !i.domain.custom
        ? {
            id: "website.domain",
            area: "website",
            status: "WARN",
            observed: "The website is on a Kora address, not your own domain.",
            why: "A domain you own looks more trustworthy and keeps your address if you ever move.",
            fix: "Connect a domain you own.",
            koraCanFix: "no",
            authorization: "Owner provides the domain and adds the DNS record.",
          }
        : !i.domain.verified
          ? {
              id: "website.domain",
              area: "website",
              status: "FAIL",
              observed: `${i.domain.custom} is not verified yet.`,
              why: "Until DNS points at Kora, your own domain does not show your site.",
              fix: "Add the DNS record shown in the domain settings.",
              koraCanFix: "no",
              authorization: "Owner adds the DNS record at their registrar.",
            }
          : ok("website.domain", "website", `${i.domain.custom} is verified.`),
    );

  // distribution
  const connected = i.channels.filter((c) => c.state === "CONNECTED");
  const broken = i.channels.filter(
    (c) =>
      c.state !== "CONNECTED" &&
      c.state !== "DISCONNECTED" &&
      c.state !== "NOT_SUPPORTED",
  );
  push(
    connected.length
      ? ok(
          "distribution.channels",
          "distribution",
          `${connected.length} channel(s) connected.`,
        )
      : {
          id: "distribution.channels",
          area: "distribution",
          status: "UNKNOWN",
          observed:
            "No channel is connected, so Kora cannot see or publish to your social or Google presence.",
          why: "Kora can only help with what you connect. Until then it cannot check or post anywhere.",
          fix: "Connect the channels you already use.",
          koraCanFix: "no",
          authorization: "Owner signs in to each provider to grant access.",
        },
  );
  for (const c of broken)
    push({
      id: `distribution.${c.provider}`,
      area: "distribution",
      status:
        c.state === "DEGRADED" || c.state === "RATE_LIMITED" ? "WARN" : "FAIL",
      observed: `${c.provider} is ${c.state.toLowerCase().replace(/_/g, " ")}.`,
      why: "Posts and messages for this channel will not go out until it is healthy.",
      fix:
        c.state === "AUTH_EXPIRED" || c.state === "PERMISSION_REQUIRED"
          ? "Reconnect the account and grant the requested permissions."
          : "Wait and retry; Kora will keep checking.",
      koraCanFix: "no",
      authorization:
        c.state === "AUTH_EXPIRED" || c.state === "PERMISSION_REQUIRED"
          ? "Owner signs in again."
          : null,
    });
  for (const h of f.social) {
    const provider =
      h.network === "google_business" ? "google_business" : h.network;
    if (
      !connected.some((c) => c.provider === provider) &&
      provider !== "x" &&
      provider !== "youtube"
    )
      push({
        id: `distribution.handle.${h.network}`,
        area: "distribution",
        status: "WARN",
        observed: `You list ${h.network} (${h.handle}) but it is not connected to Kora.`,
        why: "Kora cannot read results or publish there until it is connected.",
        fix: `Connect ${h.network}.`,
        koraCanFix: "no",
        authorization: "Owner signs in to grant access.",
      });
  }

  // proof
  push(
    i.proof.passports > 0
      ? ok(
          "proof.passport",
          "proof",
          `${i.proof.passports} Recovery Passport(s) issued.`,
        )
      : {
          id: "proof.passport",
          area: "proof",
          status: "UNKNOWN",
          observed: "No Recovery Passport has been issued yet.",
          why: "A Passport is checkable proof that Kora detected and fixed a real problem.",
          fix: "Nothing to do; a Passport is issued after a verified recovery.",
          koraCanFix: "no",
          authorization: null,
        },
  );

  // operations
  if (i.operations.openIncidents > 0)
    push({
      id: "operations.incident",
      area: "operations",
      status: "FAIL",
      observed: `${i.operations.openIncidents} open incident(s) on the website.`,
      why: "Customers may be unable to reach your site right now.",
      fix: "Review the incident and approve the recommended recovery.",
      koraCanFix: "with_approval",
      authorization: "Owner approves the recovery action.",
    });
  else if (i.operations.lastCheckAt === null)
    push({
      id: "operations.monitoring",
      area: "operations",
      status: "UNKNOWN",
      observed: "Kora has not checked this website yet.",
      why: "Without checks Kora cannot tell you when the site goes down.",
      fix: "Publish the website; checks start automatically.",
      koraCanFix: "yes",
      authorization: null,
    });
  else if (i.now.getTime() - Date.parse(i.operations.lastCheckAt) > 24 * HOUR)
    push({
      id: "operations.monitoring",
      area: "operations",
      status: "WARN",
      observed: "The last website check was more than a day ago.",
      why: "Stale checks mean a failure could go unnoticed.",
      fix: "Run a health check now.",
      koraCanFix: "yes",
      authorization: null,
    });
  else
    push(
      ok(
        "operations.monitoring",
        "operations",
        "The website was checked recently and is healthy.",
      ),
    );

  // demand
  if (i.demand.waiting > 0) {
    const old =
      i.demand.oldestWaitingAt !== null &&
      i.now.getTime() - Date.parse(i.demand.oldestWaitingAt) > 24 * HOUR;
    push({
      id: "demand.waiting",
      area: "demand",
      status: old ? "FAIL" : "WARN",
      observed: `${i.demand.waiting} customer(s) are waiting for a reply${old ? ", the oldest for more than a day" : ""}.`,
      why: "Customers who are not answered quickly buy from someone else.",
      fix: "Reply to the waiting customers.",
      koraCanFix: "no",
      authorization: "Owner writes or approves each reply.",
    });
  } else
    push(ok("demand.waiting", "demand", "No customer is waiting for a reply."));

  return out;
}

export interface HealthSummary {
  counts: Record<CheckStatus, number>;
  /** A plain sentence, never a score. */
  headline: string;
  /** Checks that need the owner, most severe first. */
  attention: PresenceCheck[];
}

const RANK: Record<CheckStatus, number> = {
  FAIL: 0,
  WARN: 1,
  UNKNOWN: 2,
  OK: 3,
};

export function summarizeHealth(checks: PresenceCheck[]): HealthSummary {
  const counts = { OK: 0, WARN: 0, FAIL: 0, UNKNOWN: 0 } as Record<
    CheckStatus,
    number
  >;
  for (const c of checks) counts[c.status]++;
  const attention = checks
    .filter((c) => c.status === "FAIL" || c.status === "WARN")
    .sort((a, b) => RANK[a.status] - RANK[b.status]);
  const headline = counts.FAIL
    ? `${counts.FAIL} thing${counts.FAIL === 1 ? "" : "s"} need${counts.FAIL === 1 ? "s" : ""} attention now.`
    : counts.WARN
      ? `Nothing is broken. ${counts.WARN} thing${counts.WARN === 1 ? "" : "s"} could be better.`
      : counts.UNKNOWN
        ? "Everything Kora can see looks fine; some areas are not connected yet."
        : "Everything Kora can check looks good.";
  return { counts, headline, attention };
}
