import { describe, expect, it } from "vitest";
import { recommendGraphicDirection, type GraphicJudgement } from "./graphic-taste.js";

const event = (
  style: GraphicJudgement["style"],
  outcome: GraphicJudgement["outcome"],
  locked = false,
  at = "2026-11-21T12:00:00Z",
): GraphicJudgement => ({ style, outcome, locked, at });

describe("graphic style memory", () => {
  it("does not infer taste from one subjective reaction", () => {
    expect(recommendGraphicDirection([event("editorial", "rejected")])).toMatchObject({
      direction: 0,
      applied: false,
      judgements: 1,
    });
  });
  it("respects explicit owner locks and allows a correction", () => {
    const bad = event("editorial", "rejected", true);
    expect(recommendGraphicDirection([bad]).direction).toBe(1);
    const corrected = event(
      "editorial",
      "chosen",
      true,
      "2026-11-21T13:00:00Z",
    );
    expect(recommendGraphicDirection([bad, corrected])).toMatchObject({
      direction: 0,
      applied: true,
    });
  });
  it("uses repeated feedback to recommend genuinely different composition", () => {
    const result = recommendGraphicDirection([
      event("cinematic", "chosen"),
      event("cinematic", "chosen"),
      event("editorial", "rejected"),
    ]);
    expect(result.direction).toBe(1);
    expect(result.applied).toBe(true);
    expect(result.reason).toContain("repeated");
  });
});
