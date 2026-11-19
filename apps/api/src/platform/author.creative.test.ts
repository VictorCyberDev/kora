import { describe, expect, it } from "vitest";
import { criticV3, planDirectionsV3 } from "@kora/site-schema";
import { SiteAuthor } from "./author.js";
const bakery = {
  name: "Aster Breadhouse",
  description:
    "A premium bakery specializing in artisan sourdough bread, pastries and celebration cakes.",
  industry: "bakery",
  services: ["Sourdough bread", "Pastries", "Celebration cakes"],
  whatsapp: "+2348012345678",
};
describe("production creative quality loop", () => {
  it("runs the real author with the same v3 planner and does not add critic blockers", async () => {
    const baseline = planDirectionsV3(bakery).directions[0]!.spec;
    const author = new SiteAuthor(null);
    const generated = await author.generateV3(bakery, 0);
    expect(generated.spec.version).toBe(3);
    if (generated.spec.version !== 3) throw new Error("Wrong spec version");
    const blocking = (issues: ReturnType<typeof criticV3>) =>
      issues.filter((issue) => issue.severity === "block").length;
    expect(blocking(criticV3(generated.spec))).toBeLessThanOrEqual(
      blocking(criticV3(baseline)),
    );
    expect(generated.spec.business.name).toBe(bakery.name);
    expect(generated.spec.meta.generator).toBe("deterministic");
  });
});
