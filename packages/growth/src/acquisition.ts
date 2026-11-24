/**
 * M15 acquisition funnel projection. Events must be recorded by a trusted
 * server adapter after consent and authorization; the reducer never sends,
 * tracks, or associates people by itself.
 */
export const ACQUISITION_STAGES = [
  "audit_created",
  "share_created",
  "referral_visit",
  "signup",
  "activation",
  "first_project",
  "first_export",
  "new_share",
] as const;
export type AcquisitionStage = (typeof ACQUISITION_STAGES)[number];

export interface AcquisitionEvent {
  eventId: string;
  sourceId: string;
  /** Pseudonymous journey token, not an email, IP address or display name. */
  journeyId: string;
  stage: AcquisitionStage;
  occurredAt: string;
  tenantId: string;
  consented: boolean;
  /** Server-side verification that the event belongs to this owner. */
  authorized: boolean;
}

export interface AcquisitionFunnel {
  tenantId: string;
  acceptedEvents: number;
  rejectedEvents: number;
  duplicateEvents: number;
  byStage: Record<AcquisitionStage, number>;
  /** Counts unique opted-in journeys with observed evidence for each stage. */
  uniqueJourneys: Record<AcquisitionStage, number>;
  conversion: {
    referredToSignup: number | null;
    signupToActivation: number | null;
    activationToFirstExport: number | null;
  };
}

/**
 * Scope to a tenant, discard events lacking consent or trusted provenance,
 * and suppress duplicates by eventId. Never aggregate different tenants.
 */
export function acquisitionFunnel(
  tenantId: string,
  events: readonly AcquisitionEvent[],
): AcquisitionFunnel {
  if (!tenantId.trim()) throw new Error("Tenant scope is required");
  const stages = [...ACQUISITION_STAGES];
  const byStage = Object.fromEntries(
    stages.map((stage) => [stage, 0]),
  ) as Record<AcquisitionStage, number>;
  const seenJourneys = Object.fromEntries(
    stages.map((stage) => [stage, new Set<string>()]),
  ) as Record<AcquisitionStage, Set<string>>;
  const ids = new Set<string>();
  let rejectedEvents = 0;
  let duplicateEvents = 0;
  let acceptedEvents = 0;
  for (const event of events) {
    const valid =
      event.tenantId === tenantId &&
      event.consented &&
      event.authorized &&
      !!event.eventId.trim() &&
      !!event.journeyId.trim() &&
      !!event.sourceId.trim() &&
      Number.isFinite(Date.parse(event.occurredAt)) &&
      stages.includes(event.stage);
    if (!valid) {
      rejectedEvents++;
      continue;
    }
    if (ids.has(event.eventId)) {
      duplicateEvents++;
      continue;
    }
    ids.add(event.eventId);
    acceptedEvents++;
    byStage[event.stage]++;
    seenJourneys[event.stage].add(event.journeyId);
  }
  const uniqueJourneys = Object.fromEntries(
    stages.map((stage) => [stage, seenJourneys[stage].size]),
  ) as Record<AcquisitionStage, number>;
  // Only count a referred conversion for journeys observed at BOTH stages.
  const matchedRate = (from: AcquisitionStage, to: AcquisitionStage) => {
    const denominator = seenJourneys[from].size;
    if (!denominator) return null;
    let matched = 0;
    for (const journey of seenJourneys[from]) {
      if (seenJourneys[to].has(journey)) matched++;
    }
    return matched / denominator;
  };
  return {
    tenantId,
    acceptedEvents,
    rejectedEvents,
    duplicateEvents,
    byStage,
    uniqueJourneys,
    conversion: {
      referredToSignup: matchedRate("referral_visit", "signup"),
      signupToActivation: matchedRate("signup", "activation"),
      activationToFirstExport: matchedRate("activation", "first_export"),
    },
  };
}
