import { describe, expect, it } from "vitest";
import { interpretIntent } from "../src/index.js";

describe("intent interpretation", () => {
  it.each([
    ["Who is waiting for a reply?", "customers_waiting"],
    ["any new message wey I never reply", "customers_waiting"],
    ["write a post for Instagram", "write_post"],
    ["post about my lunch offer on facebook", "announce_offer"],
    ["tell customers we are closed tomorrow", "closing_notice"],
    ["is my website okay", "website_status"],
    ["wetin dey scheduled", "show_calendar"],
    ["how many visits did my post get", "show_results"],
    ["show my reviews", "show_reviews"],
  ])("%s -> %s", (text, intent) =>
    expect(interpretIntent(text).intent).toBe(intent),
  );
  it("extracts the channel when one is named", () => {
    expect(interpretIntent("write a post for IG").slots.channel).toBe(
      "instagram",
    );
    expect(interpretIntent("announce my sale on whatsapp").slots.channel).toBe(
      "whatsapp",
    );
  });
  it("never executes: every result needs confirmation, and requests Kora cannot do stay unknown", () => {
    for (const t of [
      "publish everything now",
      "spend 50000 on ads",
      "reply to all my customers",
      "",
      "asdf",
    ])
      expect(interpretIntent(t).requiresConfirmation).toBe(true);
    expect(interpretIntent("spend 50000 on ads").intent).toBe("unknown");
    expect(interpretIntent("publish everything now").intent).toBe("unknown");
    // it routes to the customer list; it does not offer to message anyone
    expect(interpretIntent("reply to all my customers").intent).toBe(
      "customers_waiting",
    );
    expect(interpretIntent("reply to all my customers").summary).not.toMatch(
      /send|reply for you/i,
    );
    expect(interpretIntent("").confidence).toBe("low");
  });
});
