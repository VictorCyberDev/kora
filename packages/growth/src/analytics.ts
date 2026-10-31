import type { ChannelProvider } from "./graph.js";

export const NORMALIZED = [
  "impressions",
  "reach",
  "engagements",
  "clicks",
  "followers",
  "profile_views",
] as const;
export type NormalizedMetric = (typeof NORMALIZED)[number] | "unmapped";

export interface RawMetric {
  scope: "ACCOUNT" | "POST";
  externalId: string;
  name: string;
  value: number;
  periodEnd: string;
}
export interface NormalizedRow extends RawMetric {
  metric: NormalizedMetric;
}

/** Provider metric names → Kora's shared vocabulary. Unknown names are kept, tagged `unmapped`, never guessed. */
const MAP: Partial<Record<ChannelProvider, Record<string, NormalizedMetric>>> =
  {
    facebook: {
      page_impressions: "impressions",
      post_impressions: "impressions",
      page_impressions_unique: "reach",
      post_impressions_unique: "reach",
      page_post_engagements: "engagements",
      post_engaged_users: "engagements",
      post_clicks: "clicks",
      page_fans: "followers",
      page_views_total: "profile_views",
    },
    instagram: {
      impressions: "impressions",
      reach: "reach",
      total_interactions: "engagements",
      link_clicks: "clicks",
      follower_count: "followers",
      profile_views: "profile_views",
    },
    google_business: {
      BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "impressions",
      BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "impressions",
      BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "impressions",
      BUSINESS_IMPRESSIONS_MOBILE_MAPS: "impressions",
      WEBSITE_CLICKS: "clicks",
      CALL_CLICKS: "clicks",
      BUSINESS_DIRECTION_REQUESTS: "clicks",
    },
    search_console: { impressions: "impressions", clicks: "clicks" },
    tiktok: {
      video_views: "impressions",
      like_count: "engagements",
      share_count: "engagements",
      comment_count: "engagements",
      follower_count: "followers",
    },
    whatsapp: {},
  };

export function normalizeMetrics(
  provider: ChannelProvider,
  raw: RawMetric[],
): NormalizedRow[] {
  const m = MAP[provider] ?? {};
  return raw
    .filter((r) => Number.isFinite(r.value) && r.value >= 0)
    .map((r) => ({ ...r, metric: m[r.name] ?? "unmapped" }));
}

export interface MetricTotals {
  metric: NormalizedMetric;
  total: number;
  /** Raw names that were summed, so the total can be traced. */
  from: string[];
}
/** Totals per normalized metric over account-scope rows. `followers` is a level (latest), the rest are flows (sum). */
export function totals(rows: NormalizedRow[]): MetricTotals[] {
  const out = new Map<
    NormalizedMetric,
    {
      total: number;
      from: Set<string>;
      latest: Map<string, { at: string; v: number }>;
    }
  >();
  for (const r of rows.filter(
    (x) => x.scope === "ACCOUNT" && x.metric !== "unmapped",
  )) {
    const e = out.get(r.metric) ?? {
      total: 0,
      from: new Set<string>(),
      latest: new Map<string, { at: string; v: number }>(),
    };
    e.from.add(r.name);
    if (r.metric === "followers") {
      const cur = e.latest.get(r.name);
      if (!cur || cur.at < r.periodEnd)
        e.latest.set(r.name, { at: r.periodEnd, v: r.value });
    } else e.total += r.value;
    out.set(r.metric, e);
  }
  return [...out].map(([metric, e]) => ({
    metric,
    total:
      metric === "followers"
        ? [...e.latest.values()].reduce((a, b) => a + b.v, 0)
        : e.total,
    from: [...e.from].sort(),
  }));
}
