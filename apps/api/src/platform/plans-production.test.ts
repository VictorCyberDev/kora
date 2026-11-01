import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tierForPlan } from "../growth/entitlements.js";
import { loadPlanCatalog } from "./billing.js";

const file = new URL(
  "../../../../deploy/plans.production.json",
  import.meta.url,
);

describe("deploy/plans.production.json", () => {
  const plans = loadPlanCatalog({
    NODE_ENV: "production",
    KORA_PLANS_JSON: readFileSync(file, "utf8"),
  });
  it("parses with the real loader and keeps the free trial", () => {
    expect(plans.map((p) => p.code)).toEqual(["trial", "pro-monthly"]);
    expect(plans[0]!.amountMinor).toBe(0);
  });
  it("prices Pro at NGN 100,000 a month (minor units are kobo)", () => {
    const p = plans.find((x) => x.code === "pro-monthly")!;
    expect(p.currency).toBe("NGN");
    expect(p.amountMinor / 100).toBe(100_000);
    expect(p.interval).toBe("monthly");
  });
  it("maps to the intended tiers", () => {
    expect(tierForPlan("trial", "ACTIVE")).toBe("TRIAL");
    expect(tierForPlan("pro-monthly", "ACTIVE")).toBe("PRO");
  });
});
