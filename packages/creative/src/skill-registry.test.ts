import { describe, expect, it } from "vitest";
import {
  INSTALLED_DESIGN_SKILLS,
  loadDesignSkills,
} from "./skill-registry.js";

describe("pinned creative skills across Studios", () => {
  it("makes licensed, data-only guidance available to websites, graphics, carousels and logos", () => {
    for (const designType of [
      "site",
      "graphic",
      "carousel",
      "logo",
    ] as const) {
      const selected = loadDesignSkills({ industry: "food" }, designType);
      expect(selected.entries.length).toBeGreaterThan(0);
      expect(
        selected.rules.some(
          (rule) => rule.effect === "typography-hierarchy",
        ),
      ).toBe(true);
      expect(selected.rejected).toEqual([]);
    }
    expect(
      INSTALLED_DESIGN_SKILLS.every((skill) =>
        skill.supportedDesignTypes.includes("graphic"),
      ),
    ).toBe(true);
  });
});
