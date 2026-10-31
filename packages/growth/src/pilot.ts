/** M24: the commercial pilot. Metrics are defined before the pilot starts so they cannot be chosen afterwards. */
export const PILOT_METRICS = [
  { id: "time_to_first_publish_hours", better: "lower", target: 24 },
  { id: "approval_to_publish_rate", better: "higher", target: 0.8 },
  { id: "rework_rate", better: "lower", target: 0.3 },
  { id: "enquiries_per_week", better: "higher", target: 3 },
  { id: "owner_quality_rating", better: "higher", target: 4 },
  { id: "weekly_active_owner", better: "higher", target: 0.7 },
] as const;

export interface PilotBusiness {
  id: string;
  consented: boolean;
  metrics: Partial<Record<(typeof PILOT_METRICS)[number]["id"], number>>;
}

export function pilotSummary(biz: readonly PilotBusiness[]) {
  const counted = biz.filter((b) => b.consented);
  const rows = PILOT_METRICS.map((m) => {
    const vals = counted
      .map((b) => b.metrics[m.id])
      .filter((v): v is number => typeof v === "number");
    const mean = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : null;
    const met =
      mean === null
        ? null
        : m.better === "higher"
          ? mean >= m.target
          : mean <= m.target;
    return { metric: m.id, n: vals.length, mean, target: m.target, met };
  });
  return {
    enrolled: biz.length,
    counted: counted.length,
    excludedWithoutConsent: biz.length - counted.length,
    rows,
    /** A pilot of fewer than 10 businesses is a trial run, not evidence. */
    conclusive: counted.length >= 10,
  };
}
