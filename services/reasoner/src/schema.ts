import { z } from "zod";

export const ACTION_TYPES = [
  "run_health_check",
  "restart_service",
  "redeploy",
  "rollback_deployment",
  "republish_site_version",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

const ids = z.array(z.string().min(1).max(120)).max(50);
const text = (n: number) => z.string().min(1).max(n);

export const reasonerOutputSchema = z
  .object({
    ownerSummary: text(600),
    engineerSummary: text(1500),
    whatWeKnow: z.array(text(300)).max(12),
    whatWeDoNotKnow: z.array(text(300)).max(12),
    hypotheses: z
      .array(
        z.object({
          id: text(40),
          statement: text(400),
          confidence: z.enum(["SUPPORTED", "STRONGLY_SUPPORTED", "CONFIRMED"]),
          evidenceIds: ids,
          gapIds: ids,
          contradictionIds: ids,
        }),
      )
      .max(6),
    recommendedActions: z
      .array(
        z.object({
          type: z.enum(ACTION_TYPES),
          reason: text(400),
          /** Typed parameters only; today every action targets the incident's own service. */
          parameters: z
            .object({ versionId: z.string().uuid().optional() })
            .strict()
            .default({}),
        }),
      )
      .max(4),
    riskNotes: z.array(text(300)).max(8),
  })
  .strict();
export type ReasonerOutput = z.infer<typeof reasonerOutputSchema>;

/** The only identifiers a model may reference. */
export interface ReasonerReferences {
  evidenceIds: ReadonlySet<string>;
  gapIds: ReadonlySet<string>;
  contradictionIds: ReadonlySet<string>;
  allowedActions: ReadonlySet<ActionType>;
  /** Maximum confidence rank the deterministic diagnosis supports. */
  maxConfidence: "SUPPORTED" | "STRONGLY_SUPPORTED" | "CONFIRMED";
  versionIds: ReadonlySet<string>;
}
const RANK = { SUPPORTED: 1, STRONGLY_SUPPORTED: 2, CONFIRMED: 3 } as const;

export class ReasonerRejection extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ReasonerRejection";
  }
}

/**
 * Structural + referential validation. A hypothesis must cite real evidence,
 * cannot out-rank the deterministic diagnosis, and actions must be in the
 * permitted vocabulary. Anything else rejects the whole output.
 */
export function validateReasonerOutput(
  raw: unknown,
  refs: ReasonerReferences,
): ReasonerOutput {
  const parsed = reasonerOutputSchema.safeParse(raw);
  if (!parsed.success)
    throw new ReasonerRejection(
      `schema: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  const out = parsed.data;
  for (const h of out.hypotheses) {
    if (h.evidenceIds.length === 0)
      throw new ReasonerRejection(`hypothesis ${h.id} cites no evidence`);
    for (const id of h.evidenceIds)
      if (!refs.evidenceIds.has(id))
        throw new ReasonerRejection(`unknown evidence id ${id}`);
    for (const id of h.gapIds)
      if (!refs.gapIds.has(id))
        throw new ReasonerRejection(`unknown gap id ${id}`);
    for (const id of h.contradictionIds)
      if (!refs.contradictionIds.has(id))
        throw new ReasonerRejection(`unknown contradiction id ${id}`);
    if (RANK[h.confidence] > RANK[refs.maxConfidence])
      throw new ReasonerRejection(
        `hypothesis ${h.id} claims ${h.confidence}, above what the evidence supports`,
      );
  }
  for (const a of out.recommendedActions) {
    if (!refs.allowedActions.has(a.type))
      throw new ReasonerRejection(`action ${a.type} is not permitted here`);
    if (a.parameters.versionId && !refs.versionIds.has(a.parameters.versionId))
      throw new ReasonerRejection("action references an unknown site version");
  }
  return out;
}
