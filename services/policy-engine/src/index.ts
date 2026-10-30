import { z } from "zod";

export const ACTION_TYPES = [
  "run_health_check",
  "restart_service",
  "redeploy",
  "rollback_deployment",
  "republish_site_version",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Typed action contract. There is deliberately no free-form command field. */
export const typedActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run_health_check"),
    parameters: z.object({}).strict().default({}),
  }),
  z.object({
    type: z.literal("restart_service"),
    parameters: z.object({}).strict().default({}),
  }),
  z.object({
    type: z.literal("redeploy"),
    parameters: z.object({}).strict().default({}),
  }),
  z.object({
    type: z.literal("rollback_deployment"),
    parameters: z.object({}).strict().default({}),
  }),
  z.object({
    type: z.literal("republish_site_version"),
    parameters: z.object({ versionId: z.string().uuid() }).strict(),
  }),
]);
export type TypedAction = z.infer<typeof typedActionSchema>;

export type PolicyDecisionKind = "DENY" | "REQUIRE_APPROVAL" | "ALLOW";
export type Risk = "LOW" | "MEDIUM" | "HIGH";
export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

/** Names of operations that are never executable, whatever proposes them. */
export const FORBIDDEN_OPERATIONS = new Set([
  "delete_vm",
  "delete_database",
  "destroy_volume",
  "delete_domain",
  "exec",
  "shell",
  "run_command",
  "rotate_secret",
  "purchase",
  "purchase_domain",
  "create_billable_infrastructure",
  "drop_table",
  "destructive_database",
]);

export interface PolicyInput {
  orgId: string;
  siteId: string | null;
  incident: { id: string; severity: string };
  /** The proposed operation; unknown strings are denied, not coerced. */
  action: { type: string; parameters: Record<string, unknown> };
  target: {
    providerResourceId: string | null;
    /** Provider + account + region + type + id all present. */
    identityComplete: boolean;
    capabilities: ReadonlySet<string>;
    publishedVersionId: string | null;
  };
  /** Prior executions on this incident. */
  history: Array<{ type: string; outcome: string; at: string }>;
  blastRadius: { affectsPublicSite: boolean; sitesAffected: number };
  actorRole: Role;
  now: Date;
}
export interface PolicyResult {
  decision: PolicyDecisionKind;
  policyCode: string;
  reason: string;
  risk: Risk;
  approverMinRole?: Role;
  expiresAt?: string;
}

const REQUIRED_CAPABILITY: Partial<Record<ActionType, string>> = {
  restart_service: "RESTART",
  redeploy: "REDEPLOY",
  rollback_deployment: "ROLLBACK",
  republish_site_version: "REPUBLISH",
};
const APPROVAL_TTL_MS = 30 * 60_000;
const MAX_ATTEMPTS_PER_HOUR = 3;

const deny = (
  policyCode: string,
  reason: string,
  risk: Risk = "HIGH",
): PolicyResult => ({ decision: "DENY", policyCode, reason, risk });

/**
 * Deterministic, pure and total: the same input always yields the same
 * decision. Order matters: hard denials first, then capability, then the
 * approval defaults. Nothing here can be weakened by model output.
 */
export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const type = input.action.type;
  if (FORBIDDEN_OPERATIONS.has(type))
    return deny(
      "POLICY_FORBIDDEN_OPERATION",
      `"${type}" is a destructive or unrestricted operation and is never executed by Kora.`,
    );
  if (!(ACTION_TYPES as readonly string[]).includes(type))
    return deny(
      "POLICY_UNKNOWN_ACTION",
      `"${type}" is not a typed action Kora can perform.`,
    );
  const parsed = typedActionSchema.safeParse(input.action);
  if (!parsed.success)
    return deny(
      "POLICY_INVALID_PARAMETERS",
      "The action parameters do not match its typed contract.",
      "MEDIUM",
    );
  const action = parsed.data;

  if (input.actorRole === "VIEWER")
    return deny(
      "POLICY_ROLE_INSUFFICIENT",
      "Viewers cannot request actions.",
      "LOW",
    );

  const recent = input.history.filter(
    (h) =>
      h.type === type &&
      input.now.getTime() - new Date(h.at).getTime() < 3_600_000,
  );
  if (recent.length >= MAX_ATTEMPTS_PER_HOUR)
    return deny(
      "POLICY_REPEATED_ACTION",
      `"${type}" already ran ${recent.length} times in the last hour on this incident; a person must investigate.`,
      "MEDIUM",
    );

  if (action.type === "run_health_check")
    return {
      decision: "ALLOW",
      policyCode: "POLICY_READ_ONLY_CHECK",
      reason: "A health check only observes; it changes nothing.",
      risk: "LOW",
    };

  const needed = REQUIRED_CAPABILITY[action.type];
  if (needed && !input.target.capabilities.has(needed))
    return deny(
      "POLICY_PROVIDER_UNSUPPORTED",
      `Kora has no verified, typed executor for this provider and workload to perform "${type}" here. It needs a manual step in the provider console.`,
      "MEDIUM",
    );

  if (
    action.type !== "republish_site_version" &&
    (!input.target.identityComplete || !input.target.providerResourceId)
  )
    return deny(
      "POLICY_INSUFFICIENT_RESOURCE_IDENTITY",
      "The target resource is not fully identified (provider, workspace, region, type and ID), so Kora will not act on it.",
    );

  const expiresAt = new Date(
    input.now.getTime() + APPROVAL_TTL_MS,
  ).toISOString();
  if (action.type === "republish_site_version") {
    if (action.parameters.versionId === input.target.publishedVersionId)
      return {
        decision: "ALLOW",
        policyCode: "POLICY_IDEMPOTENT_REPUBLISH",
        reason:
          "Republishing the exact version that is already published is idempotent and safe.",
        risk: "LOW",
      };
    return {
      decision: "REQUIRE_APPROVAL",
      policyCode: "POLICY_VERSION_CHANGE_NEEDS_APPROVAL",
      reason:
        "Switching the live website to a different version changes what customers see.",
      risk: "MEDIUM",
      approverMinRole: "ADMIN",
      expiresAt,
    };
  }
  return {
    decision: "REQUIRE_APPROVAL",
    policyCode: "POLICY_WORKLOAD_CHANGE_NEEDS_APPROVAL",
    reason: `"${type}" changes a running workload${input.blastRadius.affectsPublicSite ? " that serves the public website" : ""}.`,
    risk: input.blastRadius.affectsPublicSite ? "HIGH" : "MEDIUM",
    approverMinRole: "ADMIN",
    expiresAt,
  };
}
