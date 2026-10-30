import { describe, expect, it } from "vitest";
import {
  CHANNEL_MATRIX,
  deriveConnectionState,
  nextStatus,
  normalizePhone,
  runtimeStatus,
  supports,
  waLink,
  whatsappWindow,
  isWaiting,
} from "../src/index.js";

const now = new Date("2026-06-10T12:00:00Z");

describe("channel matrix", () => {
  it("never offers WhatsApp Status or bulk publishing", () => {
    expect(supports("whatsapp", "publish")).toBe(false);
    expect(supports("whatsapp", "schedule")).toBe(false);
    expect(CHANNEL_MATRIX.whatsapp.notes.join(" ")).toMatch(
      /Status cannot be posted/,
    );
  });
  it("does not pretend TikTok can post publicly without audit", () => {
    expect(CHANNEL_MATRIX.tiktok.capabilities.publish).toBe("limited");
    expect(CHANNEL_MATRIX.tiktok.platformApproval).toMatch(/audit/i);
  });
  it("reports NOT_CONFIGURED naming only the missing variables", () => {
    const s = runtimeStatus("instagram", { META_APP_ID: "x" });
    expect(s.state).toBe("NOT_CONFIGURED");
    expect(s.missing).toEqual(["META_APP_SECRET"]);
    expect(JSON.stringify(s)).not.toContain('"x"');
    expect(
      runtimeStatus("instagram", { META_APP_ID: "x", META_APP_SECRET: "y" })
        .state,
    ).toBe("CONFIGURED");
  });
  it("treats planned providers as not configured regardless of env", () => {
    expect(
      runtimeStatus("linkedin", {
        LINKEDIN_CLIENT_ID: "a",
        LINKEDIN_CLIENT_SECRET: "b",
      }).state,
    ).toBe("NOT_CONFIGURED");
  });
});

describe("connection state", () => {
  const ok = {
    tokenExpiresAt: null,
    lastCall: null,
    grantedScopes: ["a"],
    requiredScopes: ["a"],
    now,
    revoked: false,
  };
  it("is connected when nothing is wrong", () =>
    expect(deriveConnectionState(ok)).toBe("CONNECTED"));
  it("expires with the token", () =>
    expect(
      deriveConnectionState({ ...ok, tokenExpiresAt: new Date("2026-06-01") }),
    ).toBe("AUTH_EXPIRED"));
  it("asks for permissions when a scope was not granted", () =>
    expect(deriveConnectionState({ ...ok, grantedScopes: [] })).toBe(
      "PERMISSION_REQUIRED",
    ));
  it("maps provider failures", () => {
    expect(
      deriveConnectionState({
        ...ok,
        lastCall: { ok: false, httpStatus: 429 },
      }),
    ).toBe("RATE_LIMITED");
    expect(
      deriveConnectionState({
        ...ok,
        lastCall: { ok: false, httpStatus: 401 },
      }),
    ).toBe("AUTH_EXPIRED");
    expect(
      deriveConnectionState({
        ...ok,
        lastCall: { ok: false, httpStatus: 500 },
      }),
    ).toBe("DEGRADED");
    expect(deriveConnectionState({ ...ok, revoked: true })).toBe(
      "DISCONNECTED",
    );
  });
});

describe("lead status", () => {
  it("a customer writing always needs a reply, even after the lead was closed", () => {
    expect(nextStatus("CLOSED", { type: "inbound_message" })).toBe(
      "NEEDS_REPLY",
    );
    expect(nextStatus("WON", { type: "inbound_message" })).toBe("NEEDS_REPLY");
    expect(nextStatus("NEW", { type: "inbound_message" })).toBe("NEW");
  });
  it("replying moves open leads to follow-up but never reopens closed ones", () => {
    expect(nextStatus("NEEDS_REPLY", { type: "owner_replied" })).toBe(
      "FOLLOW_UP",
    );
    expect(nextStatus("LOST", { type: "owner_replied" })).toBe("LOST");
  });
  it("counts only NEW and NEEDS_REPLY as waiting", () => {
    expect(
      (
        ["NEW", "NEEDS_REPLY", "FOLLOW_UP", "WON", "LOST", "CLOSED"] as const
      ).filter(isWaiting),
    ).toEqual(["NEW", "NEEDS_REPLY"]);
  });
});

describe("whatsapp helpers", () => {
  it("opens a 24 hour window from the customer's last message", () => {
    expect(whatsappWindow(new Date("2026-06-10T00:00:00Z"), now).open).toBe(
      true,
    );
    expect(whatsappWindow(new Date("2026-06-08T00:00:00Z"), now).open).toBe(
      false,
    );
    expect(whatsappWindow(null, now).open).toBe(false);
  });
  it("normalizes phones and builds click-to-chat links", () => {
    expect(normalizePhone("+234 801 234 5678")).toBe("2348012345678");
    expect(normalizePhone("12")).toBeNull();
    expect(waLink("+234 801 234 5678", "Hi there")).toBe(
      "https://wa.me/2348012345678?text=Hi%20there",
    );
    expect(waLink(null)).toBeNull();
  });
});
