import { describe, expect, it } from "vitest";
import { performanceReport } from "./performance.js";

describe("performance evidence provenance", () => {
  it("separates observed website enquiries from tracked link interactions", () => {
    const report = performanceReport({
      trackedVisits: 8,
      whatsappTaps: 2,
      callTaps: 1,
      enquiries: 4,
      platformReach: null,
      priorEnquiries: null,
      newCustomersEstimate: null,
    });
    expect(report.headline).toContain("3 tracked contact-button interactions");
    expect(report.headline).toContain("4 website-form enquiries");
    expect(report.headline).not.toContain("7 contacts");
    expect(report.caveats.join(" ")).toContain("may overlap");
  });
  it("never claims causation from a period comparison", () => {
    const report = performanceReport({
      trackedVisits: 0,
      whatsappTaps: 0,
      callTaps: 0,
      enquiries: 5,
      platformReach: null,
      priorEnquiries: 2,
      newCustomersEstimate: null,
    });
    expect(report.headline).toContain("rose from 2 to 5");
    expect(report.headline).toContain("no causal claim");
  });
});
