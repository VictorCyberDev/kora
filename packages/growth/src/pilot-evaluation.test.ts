import { describe, expect, it } from "vitest";
import { evaluateCommercialPilot, evaluatePilotParticipant, type PilotParticipant } from "./pilot-evaluation.js";

const participant = (id = "biz-1"): PilotParticipant => ({
  id,
  segment: "small_business",
  industry: "bakery",
  enrolledAt: "2026-11-20T10:00:00Z",
  consent: { granted: true, recordedAt: "2026-11-20T09:59:00Z" },
  observations: [
    { id: "project-1", type: "first_project", observedAt: "2026-11-20T11:00:00Z", evidenceId: "project:1" },
    { id: "publish-1", type: "first_publication", observedAt: "2026-11-20T14:00:00Z", evidenceId: "release:1" },
  ],
  metrics: {
    time_to_first_publish_hours: 4,
    approval_to_publish_rate: 0.9,
    rework_rate: 0.1,
    enquiries_per_week: 4,
    owner_quality_rating: 4.5,
    weekly_active_owner: 0.8,
  },
});

describe("commercial pilot evidence", () => {
  it("computes observed activation and publication without inventing payments", () => {
    const p = participant();
    const x = evaluatePilotParticipant(p);
    expect(x.eligible).toBe(true);
    expect(x.activationHours).toBe(4);
    expect(x.events).toContain("first_publication");
    expect(x.verifiedPaid).toBe(false);
  });

  it("excludes non-consenting and revoked participants", () => {
    const denied = participant("denied");
    denied.consent.granted = false;
    const revoked = participant("revoked");
    revoked.consent.revokedAt = "2026-11-21T10:00:00Z";
    const result = evaluateCommercialPilot([participant(), denied, revoked]);
    expect(result.participantsRecorded).toBe(3);
    expect(result.eligibleEnrollment).toBe(1);
    expect(result.excluded).toBe(2);
    expect(result.commerciallyValidated).toBe(false);
  });

  it("rejects a paid claim without independent receipt evidence", () => {
    const p = participant();
    p.payment = { status: "paid" };
    const outcome = evaluateCommercialPilot([p]);
    expect(outcome.verifiedPaid).toBe(0);
    expect(outcome.findings[0]?.issues).toContain("PAID_STATUS_WITHOUT_VERIFIED_RECEIPT");
  });

  it("requires ten consented businesses and observed payments and metrics before validation", () => {
    const set = Array.from({ length: 10 }, (_, i) => participant("biz-" + i));
    expect(evaluateCommercialPilot(set).commerciallyValidated).toBe(false);
    set[0]!.payment = { status: "paid", verifiedReceiptId: "receipt:paid-1" };
    const result = evaluateCommercialPilot(set);
    expect(result.commerciallyValidated).toBe(true);
    expect(result.verifiedPaid).toBe(1);
    expect(result.pilot.conclusive).toBe(true);
  });

  it("ignores fabricated or pre-enrollment events with no provenance", () => {
    const p = participant();
    p.observations = [
      { id: "old", type: "first_publication", observedAt: "2026-11-19T10:00:00Z", evidenceId: "release:old" },
      { id: "empty", type: "first_project", observedAt: "2026-11-20T11:00:00Z", evidenceId: "" },
    ];
    const finding = evaluatePilotParticipant(p);
    expect(finding.activationHours).toBeNull();
    expect(finding.events).toEqual([]);
    expect(finding.issues).toContain("EVENT_EVIDENCE_INVALID");
  });
});
