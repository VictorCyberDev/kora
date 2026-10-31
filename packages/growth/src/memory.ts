export const MEMORY_KINDS = [
  "PREFERENCE",
  "FACT",
  "DECISION",
  "OUTCOME",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryEntry {
  kind: MemoryKind;
  key: string;
  value: string;
}

/** Words the owner told Kora to avoid or prefer, folded into the Brand Kit voice for every future draft. */
export function voiceFromMemory(entries: MemoryEntry[]): {
  avoid: string[];
  use: string[];
} {
  const pick = (k: string) =>
    entries
      .filter((e) => e.kind === "PREFERENCE" && e.key === k)
      .map((e) => e.value.trim())
      .filter(Boolean);
  return { avoid: pick("avoid_word"), use: pick("use_word") };
}

export interface CampaignOutcomeInput {
  campaignId: string;
  name: string;
  offerTitle: string;
  endedOn: string;
  posts: { planned: number; published: number };
  tracked: {
    visits: number;
    whatsappTaps: number;
    callTaps: number;
    enquiries: number;
  };
  channels: string[];
}
/**
 * The LEARN step: a plain, evidenced record of what a finished campaign did. It states counts, never a cause, and
 * says when nothing could be measured.
 */
export function outcomeEntry(
  o: CampaignOutcomeInput,
): MemoryEntry & { evidence: Record<string, unknown> } {
  const t = o.tracked;
  const measured = t.visits + t.whatsappTaps + t.callTaps + t.enquiries;
  const value = measured
    ? `“${o.name}” (${o.offerTitle}) ended ${o.endedOn}: ${o.posts.published} of ${o.posts.planned} posts went out on ${o.channels.join(", ")}. Links Kora created brought ${t.visits} visits, ${t.whatsappTaps} WhatsApp taps, ${t.callTaps} call taps and ${t.enquiries} enquiries.`
    : `“${o.name}” (${o.offerTitle}) ended ${o.endedOn}: ${o.posts.published} of ${o.posts.planned} posts went out on ${o.channels.join(", ")}. No activity from its tracked links was recorded.`;
  return {
    kind: "OUTCOME",
    key: `campaign:${o.campaignId}`,
    value: value.slice(0, 500),
    evidence: { ...o },
  };
}
