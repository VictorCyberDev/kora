import { describe, expect, it } from "vitest";
import { selectDesignRules, DesignRuleSchema } from "../src/design-rules.js";

describe("first-party design rule registry", () => {
  it("selects industry-aware rules and always applies fundamental safeguards", () => {
    const food = selectDesignRules({ industry: "food" }).map((r) => r.id);
    expect(food).toContain("food-photography-relevance");
    expect(food).toContain("verified-business-claims");
    expect(food).toContain("accessible-navigation");
    expect(food).not.toContain("professional-trust-hierarchy");
  });

  it("prefers accessibility over conflicting decoration", () => {
    const rules = selectDesignRules({ industry: "food" }, [
      {
        id: "decorative-navigation-only",
        source: "kora-first-party",
        version: 1,
        phase: "render",
        priority: "decoration",
        industries: ["*"],
        instruction: "Render a decorative navigation-only treatment.",
        incompatibleWith: ["accessible-navigation"],
      },
      {
        id: "accessible-navigation",
        source: "kora-first-party",
        version: 1,
        phase: "validate",
        priority: "accessibility",
        industries: ["*"],
        instruction: "Preserve keyboard-accessible navigation controls.",
        incompatibleWith: ["decorative-navigation-only"],
      },
    ]);
    expect(rules.map((r) => r.id)).toEqual(["accessible-navigation"]);
  });

  it("rejects malformed metadata instead of executing unknown rules", () => {
    expect(() =>
      DesignRuleSchema.parse({ id: "<script>", source: "remote" }),
    ).toThrow();
  });
});
