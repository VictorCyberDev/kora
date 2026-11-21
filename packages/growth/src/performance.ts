/** M20: what happened, and how Krevstudio knows. */
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
      label: "Visits from Krevstudio links",
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
    "Tracked-link visits and contact-button taps are events, not distinct people or confirmed sales.",
    "Website-form enquiries are measured separately and may overlap with contact-button events. Walk-ins and word of mouth are not counted.",
  ];
  if (i.platformReach === null)
    caveats.push(
      "Platform reach is not shown because that channel is not connected.",
    );
  // Website-form enquiries are not automatically attributable to tracked links.
  // Do not present combined interactions as distinct people or paying customers.
  const interactions = i.whatsappTaps + i.callTaps;
  const trackedActivity = i.trackedVisits + interactions;
  let headline: string;
  if (trackedActivity === 0 && i.enquiries === 0)
    headline = "No tracked-link activity or website-form enquiries recorded yet.";
  else if (i.priorEnquiries === null)
    headline = `${interactions} tracked contact-button interaction${interactions === 1 ? "" : "s"}; ${i.enquiries} website-form enquir${i.enquiries === 1 ? "y" : "ies"}. These events may overlap.`;
  else if (i.enquiries > i.priorEnquiries)
    headline = `Website enquiries rose from ${i.priorEnquiries} to ${i.enquiries}; no causal claim is supported.`;
  else if (i.enquiries < i.priorEnquiries)
    headline = `Website enquiries fell from ${i.priorEnquiries} to ${i.enquiries}.`;
  else headline = `Website enquiries stayed at ${i.enquiries}.`;
  return { lines, headline, caveats };
}
