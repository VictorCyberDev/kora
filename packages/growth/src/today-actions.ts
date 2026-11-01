/** M17: "what should I do today", ranked. Every action carries the evidence that put it on the list. */
export interface TodayInput {
  waitingLeads: number;
  oldestWaitingHours: number;
  approvalsPending: number;
  staleOffers: string[];
  truthQuestions: string[];
  genomeGaps: string[];
  openIncidents: number;
  scheduledThisWeek: number;
  daysSinceLastPost: number | null;
  qualityGrade: "K0" | "K1" | "K2" | "K3" | "K4" | "K5" | null;
}
export interface TodayAction {
  id: string;
  title: string;
  why: string;
  weight: number;
  to: string;
}

export function todayActions(i: TodayInput, limit = 5): TodayAction[] {
  const a: TodayAction[] = [];
  const add = (
    id: string,
    title: string,
    why: string,
    weight: number,
    to: string,
  ) => a.push({ id, title, why, weight, to });
  if (i.openIncidents > 0)
    add(
      "incident",
      "Your website needs attention",
      `${i.openIncidents} open incident(s).`,
      100,
      "health",
    );
  if (i.waitingLeads > 0)
    add(
      "leads",
      `${i.waitingLeads} customer${i.waitingLeads === 1 ? " is" : "s are"} waiting for a reply`,
      `The longest wait is ${Math.round(i.oldestWaitingHours)} hours.`,
      80 + Math.min(15, i.oldestWaitingHours / 4),
      "customers",
    );
  if (i.approvalsPending > 0)
    add(
      "approvals",
      `${i.approvalsPending} post${i.approvalsPending === 1 ? "" : "s"} waiting for your approval`,
      "Nothing goes out until you approve it.",
      70,
      "calendar",
    );
  for (const o of i.staleOffers)
    add(
      `stale:${o}`,
      `"${o}" has ended but is still shown`,
      "Customers may ask for something you no longer offer.",
      75,
      "presence",
    );
  if (i.truthQuestions.length)
    add(
      "truth",
      "Answer one question so Kora can post",
      i.truthQuestions[0]!,
      60,
      "identity",
    );
  if (
    i.daysSinceLastPost !== null &&
    i.daysSinceLastPost >= 7 &&
    i.scheduledThisWeek === 0
  )
    add(
      "quiet",
      "Nothing is scheduled this week",
      `Your last post was ${i.daysSinceLastPost} days ago.`,
      50,
      "campaigns",
    );
  if (i.qualityGrade && ["K0", "K1", "K2"].includes(i.qualityGrade))
    add(
      "quality",
      "Your website can look stronger",
      `Kora's review graded it ${i.qualityGrade}.`,
      45,
      "build",
    );
  if (i.genomeGaps.length)
    add(
      "brand",
      "Tell Kora what makes you different",
      i.genomeGaps[0]!,
      40,
      "identity",
    );
  return a
    .sort((x, y) => y.weight - x.weight || x.id.localeCompare(y.id))
    .slice(0, limit);
}
