import { describe, expect, it } from "vitest";
import { acquisitionFunnel, type AcquisitionEvent } from "./acquisition.js";

const make = (stage: AcquisitionEvent["stage"], eventId: string): AcquisitionEvent => ({
  eventId,
  sourceId: "audit:one",
  journeyId: "journey:one",
  stage,
  occurredAt: "2026-11-21T12:00:00Z",
  tenantId: "owner:one",
  consented: true,
  authorized: true,
});

describe("M15 acquisition funnel", () => {
  it("tracks a complete share-to-export journey with verified transitions", () => {
    const events = [
      make("audit_created", "a"),
      make("share_created", "b"),
      make("referral_visit", "c"),
      make("signup", "d"),
      make("activation", "e"),
      make("first_project", "f"),
      make("first_export", "g"),
      make("new_share", "h"),
    ];
    const result = acquisitionFunnel("owner:one", events);
    expect(result.acceptedEvents).toBe(8);
    expect(result.conversion.referredToSignup).toBe(1);
    expect(result.conversion.signupToActivation).toBe(1);
    expect(result.conversion.activationToFirstExport).toBe(1);
  });

  it("rejects unauthorized, other-tenant, and non-consenting events", () => {
    const unauthorized = make("signup", "a");
    unauthorized.authorized = false;
    const otherTenant = make("signup", "b");
    otherTenant.tenantId = "owner:two";
    const declined = make("signup", "c");
    declined.consented = false;
    const result = acquisitionFunnel("owner:one", [unauthorized, otherTenant, declined]);
    expect(result.acceptedEvents).toBe(0);
    expect(result.rejectedEvents).toBe(3);
    expect(result.conversion.signupToActivation).toBeNull();
  });

  it("deduplicates idempotent events and counts matched journeys only", () => {
    const referral = make("referral_visit", "id-1");
    const signup = make("signup", "id-2");
    signup.journeyId = "other-journey";
    const result = acquisitionFunnel("owner:one", [referral, referral, signup]);
    expect(result.duplicateEvents).toBe(1);
    expect(result.conversion.referredToSignup).toBe(0);
    expect(result.byStage.referral_visit).toBe(1);
  });
});
