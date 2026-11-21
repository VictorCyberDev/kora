/**
 * Consent-aware commercial pilot evaluation. This is a pure, deterministic
 * projection of recorded evidence; it never manufactures customers or revenue.
 * An API/storage adapter must provide real participant records.
 */
import { pilotSummary, type PilotBusiness } from "./pilot.js";

export type PilotMilestone =
  | "enrolled"
  | "onboarded"
  | "first_project"
  | "first_export"
  | "first_publication"
  | "feedback"
  | "exit";

export interface PilotObservation {
  id: string;
  type: PilotMilestone;
  observedAt: string;
  /** Source identifier from an actual event, interview or export. */
  evidenceId: string;
}

export interface PilotParticipant {
  id: string;
  segment: "small_business" | "freelancer" | "creative_professional" | "agency";
  industry: string;
  enrolledAt: string;
  consent: { granted: boolean; recordedAt: string | null; revokedAt?: string };
  observations: PilotObservation[];
  metrics: PilotBusiness["metrics"];
  satisfaction?: number;
  pricingFeedback?: { statedMonthlyAmount?: number; currency?: string };
  payment?: { status: "none" | "pending" | "paid" | "refunded"; verifiedReceiptId?: string };
  exitFeedback?: string;
}

const parseTime = (value: string): number | null => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

export interface PilotFinding {
  participantId: string;
  eligible: boolean;
  events: PilotMilestone[];
  activationHours: number | null;
  verifiedPaid: boolean;
  issues: string[];
}

export function evaluatePilotParticipant(p: PilotParticipant): PilotFinding {
  const issues: string[] = [];
  const consentAt = p.consent.recordedAt ? parseTime(p.consent.recordedAt) : null;
  const enrolledAt = parseTime(p.enrolledAt);
  const consentValid =
    p.consent.granted &&
    consentAt !== null &&
    enrolledAt !== null &&
    consentAt <= enrolledAt &&
    !p.consent.revokedAt;
  if (!consentValid) issues.push("CONSENT_MISSING_OR_REVOKED");
  if (!p.id.trim() || !p.industry.trim()) issues.push("PARTICIPANT_INCOMPLETE");
  if (enrolledAt === null) issues.push("ENROLLMENT_DATE_INVALID");
  const ordered = [...p.observations].sort(
    (a, b) => (parseTime(a.observedAt) ?? Infinity) - (parseTime(b.observedAt) ?? Infinity),
  );
  const valid = ordered.filter((event) => {
    const time = parseTime(event.observedAt);
    const ok = time !== null && enrolledAt !== null &&
      time >= enrolledAt && !!event.evidenceId.trim() && !!event.id.trim();
    if (!ok) issues.push("EVENT_EVIDENCE_INVALID");
    return ok;
  });
  const firstPublication = valid.find((event) => event.type === "first_publication");
  const activationHours =
    firstPublication && enrolledAt !== null
      ? ((parseTime(firstPublication.observedAt) ?? enrolledAt) - enrolledAt) / 3_600_000
      : null;
  const verifiedPaid =
    consentValid &&
    p.payment?.status === "paid" &&
    !!p.payment.verifiedReceiptId?.trim();
  if (p.payment?.status === "paid" && !verifiedPaid)
    issues.push("PAID_STATUS_WITHOUT_VERIFIED_RECEIPT");
  if (p.satisfaction !== undefined && (!Number.isFinite(p.satisfaction) || p.satisfaction < 1 || p.satisfaction > 5))
    issues.push("INVALID_SATISFACTION_RATING");
  return {
    participantId: p.id,
    eligible: consentValid && !!p.id.trim() && !!p.industry.trim(),
    events: [...new Set(valid.map((event) => event.type))],
    activationHours,
    verifiedPaid,
    issues: [...new Set(issues)],
  };
}

export function evaluateCommercialPilot(participants: readonly PilotParticipant[]) {
  const findings = participants.map(evaluatePilotParticipant);
  const eligible = participants.filter((_, index) => findings[index]!.eligible);
  const observedPayments = eligible.filter((_, index) => {
    // Use participant IDs instead of positional indexes after filtering.
    return findings.some((f) => f.participantId === eligible[index]!.id && f.verifiedPaid);
  }).length;
  const pilot = pilotSummary(
    eligible.map((p) => ({ id: p.id, consented: true, metrics: p.metrics })),
  );
  const eligibleFindings = findings.filter((f) => f.eligible);
  const published = eligibleFindings.filter((f) => f.events.includes("first_publication")).length;
  const activated = eligibleFindings.filter((f) => f.events.includes("first_project")).length;
  const withMeasuredOutcomes = pilot.rows.filter((r) => r.n > 0).length;
  return {
    participantsRecorded: participants.length,
    eligibleEnrollment: eligible.length,
    excluded: participants.length - eligible.length,
    activated,
    published,
    verifiedPaid: observedPayments,
    pilot,
    findings,
    /**
     * Ten consenting participants alone are not proof of pilot success:
     * each declared metric also needs real observations.
     */
    commerciallyValidated:
      eligible.length >= 10 &&
      withMeasuredOutcomes === pilot.rows.length &&
      eligible.some((p) => p.payment?.status === "paid" && !!p.payment.verifiedReceiptId?.trim()) &&
      pilot.rows.every((r) => r.met === true),
  };
}
