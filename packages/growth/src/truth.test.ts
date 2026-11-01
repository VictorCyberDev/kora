import { describe, expect, it } from "vitest";
import {
  buildLedger,
  evaluateClaim,
  factsFromBusiness,
  type TruthFact,
} from "./truth.js";
import { BusinessFactsSchema } from "./facts.js";

const now = new Date("2026-10-31T12:00:00Z");
const fact = (o: Partial<TruthFact>): TruthFact => ({
  key: "price:cake",
  kind: "price",
  value: "₦20,000",
  source: "OWNER_STATED",
  confidence: 1,
  observedAt: "2026-10-01T00:00:00Z",
  ...o,
});

describe("truth engine", () => {
  it("allows a price the owner stated", () => {
    expect(
      evaluateClaim({ kind: "price", key: "price:cake" }, [fact({})], now).ok,
    ).toBe(true);
  });
  it("blocks a price that was only scraped or inferred", () => {
    for (const source of ["SCRAPED", "INFERRED"] as const) {
      const v = evaluateClaim(
        { kind: "price", key: "price:cake" },
        [fact({ source })],
        now,
      );
      expect(v.ok).toBe(false);
      expect(!v.ok && v.reason).toBe("LOW_TRUST");
    }
  });
  it("blocks missing facts and asks a question", () => {
    const v = evaluateClaim(
      { kind: "product", key: "product:croissant", text: "croissants" },
      [],
      now,
    );
    expect(!v.ok && v.reason).toBe("MISSING");
    expect(!v.ok && v.question).toContain("croissants");
  });
  it("blocks expired facts", () => {
    const v = evaluateClaim(
      { kind: "price", key: "price:cake" },
      [fact({ expiresAt: "2026-10-30T00:00:00Z" })],
      now,
    );
    expect(!v.ok && v.reason).toBe("EXPIRED");
  });
  it("never lets an owner statement stand in for staff, premises, testimonials or metrics", () => {
    for (const kind of [
      "staff",
      "premises",
      "testimonial",
      "metric",
    ] as const) {
      const v = evaluateClaim(
        { kind, key: `${kind}:x` },
        [fact({ kind, key: `${kind}:x` })],
        now,
      );
      expect(v.ok, kind).toBe(false);
    }
    const ok = evaluateClaim(
      { kind: "staff", key: "staff:x" },
      [fact({ kind: "staff", key: "staff:x", source: "VERIFIED" })],
      now,
    );
    expect(ok.ok).toBe(true);
  });
  it("low confidence fails even when verified", () => {
    const v = evaluateClaim(
      { kind: "metric", key: "m" },
      [fact({ kind: "metric", key: "m", source: "VERIFIED", confidence: 0.2 })],
      now,
    );
    expect(v.ok).toBe(false);
  });
  it("ledger is publishable only when every claim is supported, with unique questions", () => {
    const facts = [fact({})];
    const l = buildLedger(
      [
        { kind: "price", key: "price:cake" },
        { kind: "testimonial", key: "t1", text: "Best cake ever" },
        { kind: "testimonial", key: "t1", text: "Best cake ever" },
      ],
      facts,
      now,
    );
    expect(l.publishable).toBe(false);
    expect(l.used).toHaveLength(1);
    expect(l.blocked).toHaveLength(2);
    expect(l.questions).toHaveLength(1);
  });
  it("converts BusinessFacts, expiring dated offers", () => {
    const bf = BusinessFactsSchema.parse({
      identity: { name: "Ada Cakes" },
      contact: {},
      availability: { hours: [{ days: "Mon-Sat", hours: "8-6" }] },
      offer: {
        services: ["Birthday cakes"],
        offers: [
          {
            id: "oct",
            title: "October deal",
            price: "₦15,000",
            endsOn: "2026-10-31",
          },
        ],
      },
      social: [],
    });
    const facts = factsFromBusiness(bf, "2026-10-01T00:00:00Z");
    expect(evaluateClaim({ kind: "hours", key: "hours" }, facts, now).ok).toBe(
      true,
    );
    expect(
      evaluateClaim(
        { kind: "product", key: "product:birthday cakes" },
        facts,
        now,
      ).ok,
    ).toBe(true);
    expect(
      evaluateClaim({ kind: "price", key: "price:oct" }, facts, now).ok,
    ).toBe(true);
    const later = new Date("2026-11-02T00:00:00Z");
    expect(
      evaluateClaim({ kind: "price", key: "price:oct" }, facts, later).ok,
    ).toBe(false);
  });
});
