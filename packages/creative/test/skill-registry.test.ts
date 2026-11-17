import { describe, expect, it } from "vitest";
import {
  INSTALLED_DESIGN_SKILLS,
  loadDesignSkills,
} from "../src/skill-registry.js";
describe("installed runtime design skills", () => {
  it("has pinned licensed skills and predictable integrity markers", () => {
    expect(INSTALLED_DESIGN_SKILLS.length).toBeGreaterThanOrEqual(10);
    expect(
      INSTALLED_DESIGN_SKILLS.filter(
        (s) => s.source !== "kora-first-party",
      ).every(
        (s) =>
          s.upstreamCommit?.length === 40 &&
          ["MIT", "Apache-2.0"].includes(s.license),
      ),
    ).toBe(true);
  });
  it("activates relevant sources and resolves conflicts", () => {
    const food = loadDesignSkills({ industry: "food" });
    const legal = loadDesignSkills({ industry: "professional" });
    expect(food.rules.some((s) => s.id === "editorial-food-photo")).toBe(true);
    expect(legal.rules.some((s) => s.id === "editorial-food-photo")).toBe(
      false,
    );
    expect(food.entries.length).toBe(food.rules.length);
  });
  it("rejects altered metadata and disabled skills without executing scripts", () => {
    const altered = INSTALLED_DESIGN_SKILLS.map((entry) =>
      entry.id === "editorial-food-photo"
        ? { ...entry, checksum: "fnv1a32:00000000" as const }
        : entry,
    );
    const outcome = loadDesignSkills({ industry: "food" }, "site", altered);
    expect(outcome.rules.some((r) => r.id === "editorial-food-photo")).toBe(
      false,
    );
    expect(outcome.rejected).toContain("editorial-food-photo");
    const disabled = INSTALLED_DESIGN_SKILLS.map((entry) =>
      entry.id === "visual-rhythm"
        ? { ...entry, status: "disabled" as const }
        : entry,
    );
    expect(
      loadDesignSkills({ industry: "food" }, "site", disabled).rules.some(
        (r) => r.id === "visual-rhythm",
      ),
    ).toBe(false);
  });
});
