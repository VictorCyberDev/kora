/** M20: what happened, and how Kora knows. */
import type { EvidenceLevel } from "./campaign.js";

export interface PerfLine {
  label: string;
  value: number;
  evidence: EvidenceLevel;
}
export interface PerfReport {
  lines: PerfLine[];
  headline: string;
  caveats: string[];
}

export function performanceReport(i: {
  trackedVisits: number;
  whatsappTaps: number;
  callTaps: number;
  enquiries: number;
  platformReach: number | null;
  priorEnquiries: number | null;
  newCustomersEstimate: number | null;
}): PerfReport {
  const lines: PerfLine[] = [
    {
      label: "Visits from Kora links",
      value: i.trackedVisits,
      evidence: "OBSERVED",
    },
    { label: "WhatsApp taps", value: i.whatsappTaps, evidence: "OBSERVED" },
    { label: "Call taps", value: i.callTaps, evidence: "OBSERVED" },
    {
      label: "Enquiries from the website form",
      value: i.enquiries,
      evidence: "OBSERVED",
    },
  ];
  if (i.platformReach !== null)
    lines.push({
      label: "People reached (as reported by the platform)",
      value: i.platformReach,
      evidence: "INFERRED",
    });
  if (i.newCustomersEstimate !== null)
    lines.push({
      label: "New customers (your estimate)",
      value: i.newCustomersEstimate,
      evidence: "ESTIMATED",
    });
  const caveats = [
    "Only visits through links Kora created are counted. Walk-ins and word of mouth are not.",
  ];
  if (i.platformReach === null)
    caveats.push(
      "Platform reach is not shown because that channel is not connected.",
    );
  const total = i.enquiries + i.whatsappTaps + i.callTaps;
  let headline: string;
  if (i.trackedVisits + total === 0)
    headline = "Kora has not counted any activity from its links yet.";
  else if (i.priorEnquiries === null)
    headline = `Kora counted ${total} contact${total === 1 ? "" : "s"} from its links.`;
  else if (total > i.priorEnquiries)
    headline = `Counted contacts rose from ${i.priorEnquiries} to ${total}. Kora cannot say this was caused by any one post.`;
  else if (total < i.priorEnquiries)
    headline = `Counted contacts fell from ${i.priorEnquiries} to ${total}.`;
  else headline = `Counted contacts stayed at ${total}.`;
  return { lines, headline, caveats };
}
