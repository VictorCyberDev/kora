import { describe, expect, it } from "vitest";
import {
  assistCopy,
  factsOf,
  parseSiteSpecV3,
  planDirectionsV3,
  validateProposal,
  renderSiteV3,
  type CopyModel,
} from "../src/index.js";

const brief = {
  name: "Fade Lab",
  description:
    "We focus on clean fades and beard grooming in Lekki. We want more bookings.",
  goal: "bookings" as const,
  location: "Lekki, Lagos",
  phone: "+2348012345678",
  whatsapp: "+2348012345678",
  services: ["Clean fades", "Beard grooming", "Kids cuts"],
};
const spec = () => planDirectionsV3(brief).directions[0]!.spec;
const answer =
  (o: unknown): CopyModel =>
  () =>
    Promise.resolve({
      text: typeof o === "string" ? o : JSON.stringify(o),
      inputTokens: 10,
      outputTokens: 5,
    });

describe("model-assisted opening copy", () => {
  it("uses a clean proposal and the result is still a valid spec that renders", async () => {
    const r = await assistCopy(
      spec(),
      answer({
        heading: "Clean fades and beard care in Lekki",
        subheading: "Book a chair on WhatsApp and walk in to a sharp cut.",
      }),
    );
    expect(r.used).toBe(true);
    expect(r.inputTokens).toBe(10);
    expect(() => parseSiteSpecV3(r.spec)).not.toThrow();
    expect(renderSiteV3(r.spec)["index.html"]).toContain(
      "Clean fades and beard care in Lekki",
    );
  });

  const bad: Array<[string, unknown]> = [
    [
      "invented number",
      { heading: "Over 500 happy clients in Lekki", subheading: "Fades." },
    ],
    [
      "invented year",
      { heading: "Lekki's barber since 2009", subheading: "Fades." },
    ],
    [
      "award",
      { heading: "Award-winning fades in Lekki", subheading: "Fades." },
    ],
    [
      "best claim",
      { heading: "The best barber in Lagos", subheading: "Fades." },
    ],
    [
      "guarantee",
      {
        heading: "Fades in Lekki",
        subheading: "Satisfaction guaranteed or your money back.",
      },
    ],
    ["price", { heading: "Fades from ₦5,000 in Lekki", subheading: "Fades." }],
    [
      "fake testimonial",
      {
        heading: "Fades in Lekki",
        subheading: "“Best cut I ever had” — Tunde Bakare",
      },
    ],
    [
      "invented person",
      {
        heading: "Fades in Lekki",
        subheading: "Led by master barber Tunde Bakare and his team.",
      },
    ],
    [
      "cliche",
      {
        heading: "Unlock your world-class grooming journey",
        subheading: "Fades.",
      },
    ],
    ["html", { heading: "Fades <script>alert(1)</script>", subheading: "x" }],
    [
      "link",
      {
        heading: "Fades in Lekki",
        subheading: "See https://evil.example for more",
      },
    ],
    ["too long", { heading: "x".repeat(120), subheading: "y" }],
  ];
  for (const [name, proposal] of bad)
    it(`rejects ${name} and keeps the deterministic copy`, async () => {
      const s = spec();
      const r = await assistCopy(s, answer(proposal));
      expect(r.used).toBe(false);
      expect(r.rejected.length).toBeGreaterThan(0);
      expect(r.spec).toEqual(s);
    });

  it("keeps the deterministic copy when the model fails, is not JSON, or has the wrong shape", async () => {
    const s = spec();
    for (const m of [
      (() => Promise.reject(new Error("down"))) as CopyModel,
      answer("not json at all"),
      answer({ heading: 3 }),
      answer([]),
    ]) {
      const r = await assistCopy(s, m);
      expect(r.used).toBe(false);
      expect(r.spec).toEqual(s);
    }
  });

  it("accepts numbers and names that the owner really supplied", () => {
    const f = factsOf(spec());
    expect(
      validateProposal(
        { heading: "Fade Lab in Lekki", subheading: "Call +2348012345678." },
        f,
      ).ok,
    ).toBe(true);
  });

  it("accepts fenced JSON output", async () => {
    const r = await assistCopy(
      spec(),
      answer(
        '```json\n{"heading":"Sharp fades in Lekki","subheading":"Book on WhatsApp."}\n```',
      ),
    );
    expect(r.used).toBe(true);
  });
});
