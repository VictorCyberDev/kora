import { randomInt } from "node:crypto";

export const TRACK_CODE = /^[a-z]{8}$/;
/** Eight lowercase letters: no digits, so a tracking code can never look like a price or phone number. */
export function newTrackCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += String.fromCharCode(97 + randomInt(26));
  return s;
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "post";

export function trackedUrl(
  siteUrl: string,
  p: { code: string; provider: string; campaign?: string; content?: string },
): string {
  const u = new URL(siteUrl);
  u.searchParams.set("utm_source", p.provider);
  u.searchParams.set(
    "utm_medium",
    p.provider === "whatsapp" ? "message" : "social",
  );
  u.searchParams.set("utm_campaign", slug(p.campaign ?? "post"));
  if (p.content) u.searchParams.set("utm_content", slug(p.content));
  u.searchParams.set("k", p.code);
  return u.toString();
}

export interface LinkResult {
  code: string;
  provider: string;
  campaignId: string | null;
  label: string;
  visits: number;
  whatsappTaps: number;
  callTaps: number;
  enquiries: number;
}
export interface AttributionSummary {
  links: number;
  visits: number;
  whatsappTaps: number;
  callTaps: number;
  enquiries: number;
  byChannel: Record<
    string,
    {
      visits: number;
      whatsappTaps: number;
      callTaps: number;
      enquiries: number;
    }
  >;
  /** Always shown with the numbers so they are never read as total traffic or revenue. */
  note: string;
}
export const ATTRIBUTION_NOTE =
  "Counts only people who arrived through a link Kora created. Other visitors are not measured, and Kora does not see sales.";

export function summarizeAttribution(
  results: LinkResult[],
): AttributionSummary {
  const byChannel: AttributionSummary["byChannel"] = {};
  const t = { visits: 0, whatsappTaps: 0, callTaps: 0, enquiries: 0 };
  for (const r of results) {
    const c = (byChannel[r.provider] ??= {
      visits: 0,
      whatsappTaps: 0,
      callTaps: 0,
      enquiries: 0,
    });
    for (const k of [
      "visits",
      "whatsappTaps",
      "callTaps",
      "enquiries",
    ] as const) {
      c[k] += r[k];
      t[k] += r[k];
    }
  }
  return { links: results.length, ...t, byChannel, note: ATTRIBUTION_NOTE };
}

export const isLikelyBot = (ua: string | undefined) =>
  !ua ||
  /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slurp|headless|curl|wget/i.test(
    ua,
  );
