import { describe, expect, it } from "vitest";
import {
  IllegalTransition,
  checkPublishable,
  classifyFailure,
  contentHash,
  decide,
  isBlocked,
  nextAttemptAt,
  nextItemState,
  type ContentContext,
  type PublishCheckInput,
} from "../src/index.js";

const ctx: ContentContext = {
  business: "Mama",
  industry: "",
  city: "Lagos",
  description: "Food",
  services: ["Jollof"],
  offers: [],
  expiredOfferIds: [],
  expiredOfferTitles: [],
  hours: ["Mon-Sat: 9am-8pm"],
  notice: null,
  contact: { whatsapp: "+2348012345678", phone: null, email: null },
  voice: { tone: "warm", use: [], avoid: [], language: "en" },
};
const caption = {
  headline: "Hi",
  body: "Open Mon-Sat 9am-8pm in Lagos",
  cta: "",
  hashtags: [],
};
const base = (o: Partial<PublishCheckInput> = {}): PublishCheckInput => ({
  now: new Date(),
  channel: "facebook",
  connection: { state: "CONNECTED", mode: "SANDBOX" },
  adapterCanPublish: true,
  caption,
  asset: null,
  ctx,
  approval: { approved: true, hashMatches: true },
  siteHasOpenIncident: false,
  ...o,
});

describe("item state machine", () => {
  it("walks the happy path", () => {
    let s = nextItemState("IDEA", { type: "write_content" });
    s = nextItemState(s, { type: "submit" });
    s = nextItemState(s, { type: "approve", hashMatches: true });
    s = nextItemState(s, { type: "schedule", hashMatches: true });
    s = nextItemState(s, { type: "start_publish" });
    expect(
      nextItemState(s, { type: "jobs_settled", published: 2, failed: 0 }),
    ).toBe("PUBLISHED");
  });
  it("cannot skip approval or publish unscheduled", () => {
    expect(() =>
      nextItemState("DRAFT", { type: "approve", hashMatches: true }),
    ).toThrow(IllegalTransition);
    expect(() =>
      nextItemState("APPROVAL_NEEDED", { type: "schedule", hashMatches: true }),
    ).toThrow(IllegalTransition);
    expect(() => nextItemState("APPROVED", { type: "start_publish" })).toThrow(
      IllegalTransition,
    );
  });
  it("an edit voids approval and a changed hash refuses to schedule", () => {
    expect(nextItemState("APPROVED", { type: "edit" })).toBe("APPROVAL_NEEDED");
    expect(nextItemState("SCHEDULED", { type: "edit" })).toBe(
      "APPROVAL_NEEDED",
    );
    expect(
      nextItemState("APPROVED", { type: "schedule", hashMatches: false }),
    ).toBe("APPROVAL_NEEDED");
    expect(() => nextItemState("PUBLISHED", { type: "edit" })).toThrow(
      IllegalTransition,
    );
  });
  it("reports partial and total failure and allows cancel only before publishing", () => {
    expect(
      nextItemState("PUBLISHING", {
        type: "jobs_settled",
        published: 1,
        failed: 1,
      }),
    ).toBe("PARTIALLY_PUBLISHED");
    expect(
      nextItemState("PUBLISHING", {
        type: "jobs_settled",
        published: 0,
        failed: 2,
      }),
    ).toBe("FAILED");
    expect(nextItemState("SCHEDULED", { type: "cancel" })).toBe("CANCELLED");
    expect(() => nextItemState("PUBLISHING", { type: "cancel" })).toThrow(
      IllegalTransition,
    );
    expect(nextItemState("FAILED", { type: "retry" })).toBe("SCHEDULED");
  });
});

describe("content hash", () => {
  const c = {
    caption,
    assetId: null,
    channels: ["facebook", "instagram"],
    scheduledFor: "2026-07-01T10:00:00.000Z",
  };
  it("is stable across channel order and changes with any approved field but not the time", () => {
    expect(contentHash(c)).toBe(
      contentHash({ ...c, channels: ["instagram", "facebook"] }),
    );
    expect(contentHash(c)).not.toBe(
      contentHash({ ...c, caption: { ...caption, body: "x" } }),
    );
    expect(contentHash(c)).not.toBe(contentHash({ ...c, assetId: "a" }));
    expect(contentHash(c)).toBe(
      contentHash({ ...c, scheduledFor: "2026-07-02T10:00:00.000Z" }),
    );
  });
});

describe("authority", () => {
  it("never automates money, bulk messages, customer or review replies", () => {
    for (const a of [
      "spend_ad_budget",
      "send_bulk_message",
      "reply_to_review",
      "reply_to_customer",
    ] as const)
      expect(decide(a).authority).toBe("DENY");
    expect(decide("create_draft").authority).toBe("AUTO_SAFE");
    expect(decide("publish_post").authority).toBe("APPROVAL_REQUIRED");
  });
});

describe("publish checks", () => {
  it("passes a clean approved post on a healthy connection", () =>
    expect(isBlocked(checkPublishable(base()))).toBe(false));
  it("refuses unsupported capability outright (WhatsApp has no posting)", () => {
    const r = checkPublishable(base({ channel: "whatsapp" }));
    expect(r[0]!.code).toBe("capability");
    expect(isBlocked(r)).toBe(true);
  });
  it("blocks unapproved, changed-after-approval, disconnected, unhealthy and unavailable adapters", () => {
    expect(
      checkPublishable(
        base({ approval: { approved: false, hashMatches: false } }),
      ).some((x) => x.code === "not_approved"),
    ).toBe(true);
    expect(
      checkPublishable(
        base({ approval: { approved: true, hashMatches: false } }),
      ).some((x) => /changed after/.test(x.message)),
    ).toBe(true);
    expect(
      checkPublishable(base({ connection: null })).some(
        (x) => x.code === "not_connected",
      ),
    ).toBe(true);
    expect(
      checkPublishable(
        base({ connection: { state: "AUTH_EXPIRED", mode: "LIVE" } }),
      ).some((x) => x.code === "connection_unhealthy"),
    ).toBe(true);
    expect(
      checkPublishable(base({ adapterCanPublish: false })).some(
        (x) => x.code === "not_available",
      ),
    ).toBe(true);
  });
  it("requires media where the channel needs it and re-validates content against current facts", () => {
    expect(
      checkPublishable(base({ channel: "instagram" })).some(
        (x) => x.code === "media_required",
      ),
    ).toBe(true);
    expect(
      checkPublishable(
        base({ channel: "tiktok", asset: { kind: "IMAGE", exists: true } }),
      ).some((x) => x.code === "media_type"),
    ).toBe(true);
    expect(
      checkPublishable(
        base({ caption: { ...caption, body: "Only ₦1 today" } }),
      ).some((x) => x.code === "content" && x.severity === "block"),
    ).toBe(true);
  });
  it("warns, but does not block, when the website is down", () => {
    const r = checkPublishable(base({ siteHasOpenIncident: true }));
    expect(r.some((x) => x.code === "site_down")).toBe(true);
    expect(isBlocked(r)).toBe(false);
  });
});

describe("retry policy", () => {
  it("retries only failures where the provider certainly did not publish", () => {
    expect(classifyFailure({ httpStatus: 429 })).toBe("RETRYABLE");
    expect(classifyFailure({ httpStatus: 401 })).toBe("PERMANENT");
    expect(classifyFailure({ httpStatus: 400 })).toBe("PERMANENT");
    expect(classifyFailure({ network: true })).toBe("UNCERTAIN");
    expect(classifyFailure({ httpStatus: 500 })).toBe("UNCERTAIN");
  });
  it("backs off", () => {
    const n = new Date("2026-01-01T00:00:00Z");
    expect(nextAttemptAt(1, n).getTime() - n.getTime()).toBe(60_000);
    expect(nextAttemptAt(9, n).getTime() - n.getTime()).toBe(30 * 60_000);
  });
});
