import { describe, expect, it } from "vitest";
import {
  composeDirections,
  fatigueAvoid,
  rerankByTaste,
  recencyWeight,
  tasteSignals,
  type DesignTrace,
} from "../src/index.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1);
const t = (
  grammarId: string,
  daysAgo: number,
  outcome: "chosen" | "rejected" = "chosen",
  typeVoice = "modern-serif",
): DesignTrace => ({
  grammarId,
  typeVoice,
  colorwayId: "x",
  compositionMode: "split-narrative",
  outcome,
  at: NOW - daysAgo * DAY,
});

describe("template fatigue", () => {
  it("does nothing without history", () => {
    expect(fatigueAvoid([], NOW)).toEqual([]);
  });
  it("weights recent choices more than old ones", () => {
    expect(recencyWeight(NOW, NOW)).toBe(1);
    expect(recencyWeight(NOW - 45 * DAY, NOW)).toBeCloseTo(0.5, 5);
    expect(recencyWeight(NOW - 450 * DAY, NOW)).toBeLessThan(0.002);
  });
  it("avoids a language chosen twice recently but not once, and not twice long ago", () => {
    expect(fatigueAvoid([t("a", 3)], NOW)).toEqual([]);
    expect(fatigueAvoid([t("a", 3), t("a", 10)], NOW)).toEqual(["a"]);
    expect(fatigueAvoid([t("a", 300), t("a", 330)], NOW)).toEqual([]);
  });
  it("never avoids more than two, so three different directions remain", () => {
    const h = ["a", "b", "c", "d"].flatMap((g) => [t(g, 2), t(g, 4)]);
    expect(fatigueAvoid(h, NOW).length).toBe(2);
  });
  it("feeds composeDirections: avoided languages are replaced, others untouched", () => {
    const brief = {
      name: "Tola's Cakes",
      description:
        "Home bakery in Lekki: birthday cakes, cupcakes and small chops. Orders on WhatsApp.",
      whatsapp: "+2348012345678",
      location: "Lekki, Lagos",
    };
    const base = composeDirections(brief);
    const avoid = [base[0]!.grammarId];
    const next = composeDirections(brief, { avoidGrammarIds: avoid });
    expect(next.map((d) => d.grammarId)).not.toContain(avoid[0]);
    expect(new Set(next.map((d) => d.grammarId)).size).toBe(3);
  });
});

describe("taste learning (three or more judgements)", () => {
  it("claims nothing from fewer than three judgements", () => {
    const s = tasteSignals([t("a", 1), t("a", 2)], NOW);
    expect(s.confident).toBe(false);
    expect(s.preferredGrammars).toEqual([]);
  });
  it("learns from repeated choices and passed-over directions", () => {
    const s = tasteSignals(
      [t("a", 1), t("a", 5), t("b", 2, "rejected"), t("b", 6, "rejected")],
      NOW,
    );
    expect(s.confident).toBe(true);
    expect(s.preferredGrammars).toContain("a");
    expect(s.rejectedGrammars).toContain("b");
  });
  it("re-ranks a near tie toward taste, but never overrides a clearly better fit", () => {
    const dirs = [
      { grammarId: "a", genome: { typeVoice: "x" } },
      { grammarId: "b", genome: { typeVoice: "x" } },
      { grammarId: "c", genome: { typeVoice: "x" } },
    ];
    const taste = tasteSignals([t("b", 1), t("b", 2), t("b", 3)], NOW);
    expect(rerankByTaste(dirs, [5, 4.6, 2], taste).index).toBe(1);
    expect(rerankByTaste(dirs, [8, 4.6, 2], taste).index).toBe(0);
    // no taste, no change
    expect(
      rerankByTaste(dirs, [5, 4.6, 2], tasteSignals([t("b", 1)], NOW)).changed,
    ).toBe(false);
  });
});
