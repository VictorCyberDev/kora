import { describe, expect, it } from "vitest";
import { parseWindow, proposeCampaign } from "./proposal.js";

// Sunday 2026-11-01
const today = new Date("2026-11-01T10:00:00Z");
const ctx = {
  businessName: "Tola's Cakes",
  offerings: ["Birthday cakes", "Cupcakes", "Small chops"],
  whatsapp: true,
  phone: false,
  today,
};

describe("natural-language campaign proposal", () => {
  it("turns a plain request into a coordinated proposal that never posts or spends", () => {
    const p = proposeCampaign(
      "I need more birthday cake orders next week",
      ctx,
    );
    if ("error" in p) throw new Error(p.message);
    expect(p.status).toBe("PROPOSED");
    expect(p.autoPublish).toBe(false);
    expect(p.spends).toBe(false);
    expect(p.understood.goal).toBe("order");
    expect(p.understood.subject).toBe("Birthday cakes");
    expect(p.understood.subjectInProfile).toBe(true);
    expect(p.understood.window).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
      label: "next week",
    });
    expect(p.pieces.map((x) => x.format)).toEqual([
      "story",
      "whatsapp-status",
      "social-square",
      "flyer-a5",
    ]);
    for (const piece of p.pieces) {
      expect(piece.draft.ownerWritten).toBe(false);
      expect(
        piece.suggestedOn >= "2026-11-02" && piece.suggestedOn <= "2026-11-08",
      ).toBe(true);
      expect(piece.draft.cta).toBe("Order on WhatsApp");
    }
    expect(p.next).toMatch(/Nothing has been made/);
  });

  it("wording contains only the owner's words: no invented prices, claims or numbers", () => {
    const p = proposeCampaign(
      "I need more birthday cake orders next week",
      ctx,
    );
    if ("error" in p) throw new Error("x");
    const all = p.pieces
      .map((x) =>
        [x.draft.headline, x.draft.eyebrow, x.draft.subline, x.draft.cta].join(
          " ",
        ),
      )
      .join(" ");
    expect(all).not.toMatch(/\d|₦|\$|%|best|free|award|guarantee|limited/i);
  });

  it("asks rather than assumes when the thing is not in the profile or contact is missing", () => {
    const p = proposeCampaign("promote wedding cakes this weekend", {
      ...ctx,
      whatsapp: false,
    });
    if ("error" in p) throw new Error("x");
    expect(p.understood.subjectInProfile).toBe(false);
    expect(p.needsFromOwner.join(" ")).toMatch(/not in the list/);
    expect(p.needsFromOwner.join(" ")).toMatch(/WhatsApp number or phone/);
    expect(p.pieces[0]!.draft.cta).toBe("");
  });

  it("does not guess when it cannot tell what to promote", () => {
    const r = proposeCampaign("do something good for me", ctx);
    expect("error" in r).toBe(true);
  });

  it("understands different goals", () => {
    const g = (s: string) => {
      const p = proposeCampaign(s, ctx);
      return "error" in p ? p.error : p.understood.goal;
    };
    expect(g("I want more cupcake bookings tomorrow")).toBe("booking");
    expect(g("I want more cupcakes visits this weekend")).toBe("visit");
    expect(g("promote small chops by friday")).toBe("awareness");
  });

  it("resolves time words against today", () => {
    expect(parseWindow("tomorrow", today).from).toBe("2026-11-02");
    expect(parseWindow("this weekend", today)).toMatchObject({
      from: "2026-11-07",
      to: "2026-11-08",
    });
    expect(parseWindow("by friday", today).to).toBe("2026-11-06");
    expect(parseWindow("in 3 days", today).to).toBe("2026-11-04");
    expect(parseWindow("whenever", today).label).toBe("the next 7 days");
  });

  it("ignores hostile or oversized input safely", () => {
    const p = proposeCampaign(
      `<script>alert(1)</script> more birthday cake orders next week ${"x".repeat(5000)}`,
      ctx,
    );
    expect(JSON.stringify(p)).not.toContain("<script>");
  });
});
